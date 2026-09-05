#!/usr/bin/env node
/* KARAN DASHBOARD - FIXED & SIMPLIFIED */

const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8000');
const KARAN_API = process.env.KARAN_API || 'http://localhost:9000';
const CHAIRMAN_API = process.env.CHAIRMAN_API || 'http://localhost:8080';
const JARVIS_API = process.env.JARVIS_API || 'http://localhost:8001';

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

// Render's container disk is wiped on every redeploy and idle spin-down, so the
// owner account and signing key come from environment variables instead of files.
const OWNER_EMAIL = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const PASSWORD_SALT = process.env.PASSWORD_SALT || SESSION_SECRET;

const MISSING_CONFIG = ['OWNER_EMAIL', 'OWNER_PASSWORD', 'SESSION_SECRET']
  .filter(name => !process.env[name]);
const CONFIGURED = MISSING_CONFIG.length === 0;

const OWNER_PW_HASH = CONFIGURED ? hashPassword(OWNER_PASSWORD, PASSWORD_SALT) : '';

function hashPassword(pwd, salt) {
  return crypto.pbkdf2Sync(pwd, salt, 100000, 32, 'sha256').toString('hex');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyPassword(pwd, hash) {
  return safeEqual(hashPassword(pwd, PASSWORD_SALT), hash);
}

// Sessions are signed tokens rather than server-side records, so a restart no
// longer invalidates a live login.
function createSession(userId) {
  const payload = userId + ':' + (Date.now() + SESSION_TTL);
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

function verifySession(token) {
  if (!token || !CONFIGURED) return null;
  const [encoded, sig] = String(token).split('.');
  if (!encoded || !sig) return null;

  const payload = Buffer.from(encoded, 'base64url').toString();
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  if (!safeEqual(sig, expected)) return null;

  const [userId, expiresAt] = payload.split(':');
  if (!userId || Number(expiresAt) < Date.now()) return null;
  return userId;
}

function sessionCookie(req, token) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return 'sessionId=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800' + secure;
}

function getSetupHTML() {
  return `<!DOCTYPE html>
<html>
<head><title>Karan Dashboard - Setup</title><meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 40px; }
  .box { background: white; padding: 32px; border-radius: 8px; max-width: 620px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
  li { margin: 10px 0; line-height: 1.6; }
</style>
</head>
<body>
  <div class="box">
    <h1>Setup required</h1>
    <p>Set these environment variables in the Render service, then redeploy:</p>
    <ul>
      ${MISSING_CONFIG.map(name => '<li><code>' + name + '</code></li>').join('')}
    </ul>
    <p><code>OWNER_EMAIL</code> and <code>OWNER_PASSWORD</code> are the only credentials that
    can sign in. <code>SESSION_SECRET</code> should be a long random string.</p>
  </div>
</body>
</html>`;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  const sessionId = (req.headers.cookie || '').match(/sessionId=([^;]+)/)?.[1];
  const userId = verifySession(sessionId);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Routes
  try {
    // Health check
    if (pathname === '/api/health') {
      return res.end(JSON.stringify({ status: 'ok' }));
    }

    if (!CONFIGURED) {
      res.writeHead(503, { 'Content-Type': 'text/html' });
      return res.end(getSetupHTML());
    }

    // Login. Single owner account; credentials come from the environment.
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        try {
          const { email, password } = JSON.parse(body);
          const emailMatches = String(email || '').trim().toLowerCase() === OWNER_EMAIL;
          if (!emailMatches || !verifyPassword(String(password || ''), OWNER_PW_HASH)) {
            res.writeHead(401);
            return res.end(JSON.stringify({ error: 'Invalid credentials' }));
          }
          res.writeHead(200, { 'Set-Cookie': sessionCookie(req, createSession('owner')) });
          res.end(JSON.stringify({ ok: true }));
        } catch(e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (pathname === '/api/auth/logout') {
      res.writeHead(200, { 'Set-Cookie': 'sessionId=; Path=/; HttpOnly; Max-Age=0' });
      return res.end(JSON.stringify({ ok: true }));
    }

    // Protected endpoints require session
    if (!userId) {
      if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(getLoginHTML());
      }
      res.writeHead(401);
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    // Dashboard page
    if (pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(getDashboardHTML());
    }

    // Proxy to backends
    if (pathname.startsWith('/api/karan/')) {
      const path = pathname.replace('/api/karan', '');
      const body = req.method !== 'GET' ? await readBody(req) : null;
      const result = await proxyRequest(KARAN_API, path, req.method, body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }

    if (pathname.startsWith('/api/chairman/')) {
      const path = pathname.replace('/api/chairman', '');
      const body = req.method !== 'GET' ? await readBody(req) : null;
      const result = await proxyRequest(CHAIRMAN_API, path, req.method, body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }

    if (pathname.startsWith('/api/jarvis/')) {
      const path = pathname.replace('/api/jarvis', '');
      const body = req.method !== 'GET' ? await readBody(req) : null;
      const result = await proxyRequest(JARVIS_API, path, req.method, body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch(e) {
    console.error('[ERROR]', e.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  }
});

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => resolve(body));
  });
}

function proxyRequest(baseUrl, path, method, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const proto = url.protocol === 'https:' ? https : http;
    const req = proto.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function getLoginHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Karan Dashboard</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; }
    .auth-box { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
    .auth-box h1 { margin-top: 0; text-align: center; color: #333; }
    .tabs { display: flex; margin-bottom: 20px; border-bottom: 1px solid #e5e5e5; }
    .tab { flex: 1; padding: 12px; text-align: center; cursor: pointer; border-bottom: 2px solid transparent; color: #666; }
    .tab.active { border-bottom-color: #10a37f; color: #10a37f; font-weight: 600; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #e5e5e5; border-radius: 4px; box-sizing: border-box; font-size: 14px; }
    input:focus { outline: none; border-color: #10a37f; }
    button { width: 100%; padding: 12px; background: #10a37f; color: white; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; margin-top: 10px; }
    button:hover { background: #0a8f6f; }
    .error { color: red; font-size: 13px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="auth-box">
    <h1>🚀 FORGE</h1>

    <div id="login" class="tab-content active">
      <input type="email" id="login-email" placeholder="Email" autocomplete="username" />
      <input type="password" id="login-password" placeholder="Password" autocomplete="current-password" />
      <button id="login-button" onclick="handleLogin()">Login</button>
      <div id="login-error" class="error"></div>
    </div>
  </div>

  <script>
    const errorBox = document.getElementById('login-error');
    const button = document.getElementById('login-button');

    async function handleLogin() {
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      if (!email || !password) { errorBox.textContent = 'Please fill all fields'; return; }

      errorBox.textContent = '';
      button.disabled = true;
      button.textContent = 'Signing in...';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          location.href = '/';
          return;
        }
        errorBox.textContent = res.status === 401
          ? 'Incorrect email or password'
          : (data.error || 'Login failed (' + res.status + ')');
      } catch(e) {
        errorBox.textContent = 'Could not reach the server: ' + e.message;
      }

      button.disabled = false;
      button.textContent = 'Login';
    }

    document.querySelectorAll('#login input').forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
    });
  </script>
</body>
</html>`;
}

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <title>FORGE Dashboard</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #333; }
    .container { display: flex; height: 100vh; }
    .sidebar { width: 250px; background: #f7f7f7; border-right: 1px solid #e5e5e5; padding: 20px; overflow-y: auto; }
    .sidebar h2 { margin-bottom: 20px; font-size: 16px; }
    .nav-item { padding: 10px; margin-bottom: 5px; background: white; border: 1px solid #e5e5e5; border-radius: 4px; cursor: pointer; }
    .nav-item:hover { background: #f0f0f0; }
    .nav-item.active { background: #10a37f; color: white; }
    .main { flex: 1; display: flex; flex-direction: column; }
    .header { padding: 20px; border-bottom: 1px solid #e5e5e5; display: flex; justify-content: space-between; }
    .content { flex: 1; overflow-y: auto; padding: 20px; }
    .panel { background: white; padding: 20px; border: 1px solid #e5e5e5; border-radius: 8px; margin-bottom: 20px; }
    .panel h3 { margin-bottom: 15px; font-size: 16px; }
    .status { padding: 15px; background: #f0f0f0; border-radius: 4px; margin-bottom: 10px; font-size: 14px; }
    .status.ok { background: #d4edda; color: #155724; }
    .status.error { background: #f8d7da; color: #721c24; }
    button { padding: 10px 20px; background: #10a37f; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0a8f6f; }
    .logout-btn { position: absolute; top: 20px; right: 20px; background: #e5e5e5; color: #333; }
  </style>
</head>
<body>
  <div class="container">
    <div class="sidebar">
      <h2>🚀 FORGE</h2>
      <div class="nav-item active" onclick="showSection('dashboard')">Dashboard</div>
      <div class="nav-item" onclick="showSection('chat')">💬 Chat (Karan)</div>
      <div class="nav-item" onclick="showSection('monitoring')">📊 Monitor (Chairman)</div>
      <div class="nav-item" onclick="showSection('voice')">🎤 Voice (Jarvis)</div>
    </div>

    <div class="main">
      <div class="header">
        <h1>FORGE Dashboard</h1>
        <button class="logout-btn" onclick="logout()">Logout</button>
      </div>

      <div class="content">
        <div id="dashboard" class="section">
          <div class="panel">
            <h3>System Status</h3>
            <div id="status-karan" class="status">Karan (Chat)...</div>
            <div id="status-chairman" class="status">Chairman (Monitor)...</div>
            <div id="status-jarvis" class="status">Jarvis (Voice)...</div>
          </div>
        </div>

        <div id="chat" class="section" style="display:none;">
          <div class="panel">
            <h3>Chat with Karan</h3>
            <div id="chat-messages" style="height: 300px; overflow-y: auto; background: #f7f7f7; padding: 10px; margin-bottom: 10px; border-radius: 4px;"></div>
            <input type="text" id="chat-input" placeholder="Type a message..." />
            <button onclick="sendMessage()">Send</button>
          </div>
        </div>

        <div id="monitoring" class="section" style="display:none;">
          <div class="panel">
            <h3>System Monitoring</h3>
            <p>Real-time monitoring from Chairman Agent OS</p>
            <button onclick="loadMonitoring()">Load Monitoring Data</button>
          </div>
        </div>

        <div id="voice" class="section" style="display:none;">
          <div class="panel">
            <h3>Voice AI (Jarvis)</h3>
            <p>Voice integration with Project Jarvis</p>
            <button onclick="startVoice()">Start Voice</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    function showSection(name) {
      document.querySelectorAll('.section').forEach(el => el.style.display = 'none');
      document.getElementById(name).style.display = 'block';
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      event.target.classList.add('active');
    }

    async function logout() {
      await fetch('/api/auth/logout').catch(() => {});
      location.href = '/';
    }

    async function checkStatus() {
      const endpoints = [
        { name: 'karan', url: '${KARAN_API}/api/health' },
        { name: 'chairman', url: '${CHAIRMAN_API}/api/health' },
        { name: 'jarvis', url: '${JARVIS_API}/api/health' }
      ];

      for (const ep of endpoints) {
        try {
          const res = await fetch(ep.url);
          const data = await res.json();
          const el = document.getElementById('status-' + ep.name);
          el.textContent = ep.name.charAt(0).toUpperCase() + ep.name.slice(1) + ' ✅ Online';
          el.classList.add('ok');
        } catch(e) {
          const el = document.getElementById('status-' + ep.name);
          el.textContent = ep.name.charAt(0).toUpperCase() + ep.name.slice(1) + ' ❌ Offline';
          el.classList.add('error');
        }
      }
    }

    async function sendMessage() {
      const input = document.getElementById('chat-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';

      const msgDiv = document.createElement('div');
      msgDiv.style.cssText = 'padding: 8px; margin: 5px 0; background: white; border-radius: 4px;';
      msgDiv.textContent = 'You: ' + text;
      document.getElementById('chat-messages').appendChild(msgDiv);
    }

    function loadMonitoring() {
      alert('Monitoring data loading from Chairman...');
    }

    function startVoice() {
      alert('Voice interface starting with Jarvis...');
    }

    checkStatus();
    setInterval(checkStatus, 30000);
  </script>
</body>
</html>`;
}


server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 FORGE Dashboard running on http://localhost:${PORT}\n`);
  console.log(`   Karan API: ${KARAN_API}`);
  console.log(`   Chairman API: ${CHAIRMAN_API}`);
  console.log(`   Jarvis API: ${JARVIS_API}\n`);
});

process.on('SIGTERM', () => {
  console.log('\n[shutdown] Dashboard shutting down...');
  server.close(() => process.exit(0));
});

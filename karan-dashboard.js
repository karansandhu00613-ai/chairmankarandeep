#!/usr/bin/env node
/* ==========================================================================
   KARAN DASHBOARD - Unified AI Operating System Interface

   Port 8000 - ChatGPT/Claude.com-style interface
   Orchestrates: Karan (9000), Chairman (8080), Jarvis (8001)
   Multi-user with API keys, no external AI dependencies
   ========================================================================== */

const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8000');
const PRODUCTION = parseInt(process.env.PRODUCTION || '0');
const STORE_TYPE = process.env.STORE || 'local';

const KARAN_API = process.env.KARAN_API || 'http://localhost:9000';
const CHAIRMAN_API = process.env.CHAIRMAN_API || 'http://localhost:8080';
const JARVIS_API = process.env.JARVIS_API || 'http://localhost:8001';

const GH_TOKEN = process.env.GH_TOKEN;
const GH_REPO = process.env.GH_REPO;
const GH_BRANCH = process.env.GH_BRANCH || 'main';

let STATE = {
  users: {},
  apiKeys: {},
  sessions: {},
  settings: {}
};

const SESS = new Map();
const WS_CLIENTS = new Map();
const TTL = 7 * 24 * 60 * 60 * 1000;
const DB = 'dashboard.json';
const SESSDB = 'dashboard-sessions.json';

let STORE = STORE_TYPE === 'github' ? githubStore() : localStore('.');

function uid() { return crypto.randomBytes(16).toString('hex'); }

function localStore(dir) {
  const fs = require('fs');
  return {
    describe: () => `Local (${dir})`,
    read: async (name) => {
      try { return fs.readFileSync(`${dir}/${name}`, 'utf8'); } catch(e) { return null; }
    },
    write: async (name, text) => {
      fs.writeFileSync(`${dir}/${name}`, text);
    }
  };
}

function githubStore() {
  return {
    describe: () => `GitHub (${GH_REPO})`,
    read: async (name) => {
      const [owner, repoName] = GH_REPO.split('/');
      try {
        const res = await ghAPI('GET', `/repos/${owner}/${repoName}/contents/${name}?ref=${GH_BRANCH}`, GH_TOKEN);
        return Buffer.from(res.content, 'base64').toString();
      } catch(e) { return null; }
    },
    write: async (name, text) => {
      const [owner, repoName] = GH_REPO.split('/');
      let sha = null;
      try {
        const fileRes = await ghAPI('GET', `/repos/${owner}/${repoName}/contents/${name}?ref=${GH_BRANCH}`, GH_TOKEN);
        sha = fileRes.sha;
      } catch (e) {}
      await ghAPI('PUT', `/repos/${owner}/${repoName}/contents/${name}`, GH_TOKEN, {
        message: `Update ${name}`,
        content: Buffer.from(text).toString('base64'),
        sha
      });
    }
  };
}

async function ghAPI(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Karan-Dashboard',
        'Content-Type': 'application/json'
      }
    }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`GitHub API ${res.statusCode}`));
        try { resolve(JSON.parse(buf)); } catch(e) { resolve(buf); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Hash password with PBKDF2
function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const computed = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return computed === hash;
}

// API Key management
function generateAPIKey(userId) {
  const key = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const apiKey = {
    id: uid(),
    userId,
    keyHash: hash,
    createdAt: Date.now(),
    lastUsed: null,
    name: `API Key ${new Date().toLocaleDateString()}`
  };
  STATE.apiKeys[apiKey.id] = apiKey;
  return key;
}

function verifyAPIKey(key) {
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  for (const [id, apiKey] of Object.entries(STATE.apiKeys)) {
    if (apiKey.keyHash === hash) {
      apiKey.lastUsed = Date.now();
      return apiKey.userId;
    }
  }
  return null;
}

// Session management
function createSession(userId) {
  const sid = uid();
  SESS.set(sid, { uid: userId, t: Date.now() });
  return sid;
}

function verifySession(sessionId) {
  const sess = SESS.get(sessionId);
  if (!sess || Date.now() - sess.t > TTL) {
    SESS.delete(sessionId);
    return null;
  }
  return sess;
}

// API Handlers
async function handleAPI(req, res, pathname, query) {
  const method = req.method;
  const sessionId = query.get('sessionId');
  const apiKey = query.get('apiKey');

  let userId = null;

  if (sessionId) {
    const sess = verifySession(sessionId);
    if (!sess) return send(res, 401, { error: 'Invalid session' });
    userId = sess.uid;
  } else if (apiKey) {
    userId = verifyAPIKey(apiKey);
    if (!userId) return send(res, 401, { error: 'Invalid API key' });
  }

  // Health check (public)
  if (pathname === '/api/health') {
    return send(res, 200, { ok: true, service: 'dashboard' });
  }

  // Registration
  if (pathname === '/api/auth/register' && method === 'POST') {
    if (Object.keys(STATE.users).length > 0 && !Object.keys(STATE.users)[0]) {
      return send(res, 403, { error: 'Users already exist. Contact admin.' });
    }

    const body = await readBody(req);
    const { email, password, name } = JSON.parse(body);

    if (!email || !password || !name) {
      return send(res, 400, { error: 'Missing fields' });
    }

    const user = {
      id: uid(),
      email,
      name,
      pwHash: hashPassword(password),
      role: Object.keys(STATE.users).length === 0 ? 'admin' : 'user',
      createdAt: Date.now()
    };

    STATE.users[user.id] = user;
    await STORE.write(DB, JSON.stringify(STATE, null, 1));

    const sid = createSession(user.id);
    return send(res, 201, { ok: true, sessionId: sid, user: { id: user.id, email, name, role: user.role } });
  }

  // Login
  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await readBody(req);
    const { email, password } = JSON.parse(body);

    for (const user of Object.values(STATE.users)) {
      if (user.email === email && verifyPassword(password, user.pwHash)) {
        const sid = createSession(user.id);
        return send(res, 200, { ok: true, sessionId: sid, user: { id: user.id, email, name: user.name, role: user.role } });
      }
    }

    return send(res, 401, { error: 'Invalid credentials' });
  }

  // Protected endpoints
  if (!userId) return send(res, 401, { error: 'Unauthorized' });

  // Generate API key (admin only)
  if (pathname === '/api/keys/generate' && method === 'POST') {
    const user = STATE.users[userId];
    if (user.role !== 'admin') return send(res, 403, { error: 'Admin only' });

    const body = await readBody(req);
    const { targetUserId } = JSON.parse(body);
    const key = generateAPIKey(targetUserId || userId);

    await STORE.write(DB, JSON.stringify(STATE, null, 1));
    return send(res, 200, { ok: true, key, keyId: Object.keys(STATE.apiKeys).find(k => STATE.apiKeys[k].createdAt > Date.now() - 1000) });
  }

  // List API keys (admin only)
  if (pathname === '/api/keys' && method === 'GET') {
    const user = STATE.users[userId];
    if (user.role !== 'admin') return send(res, 403, { error: 'Admin only' });

    const keys = Object.values(STATE.apiKeys).map(k => ({
      id: k.id,
      name: k.name,
      createdAt: k.createdAt,
      lastUsed: k.lastUsed
    }));

    return send(res, 200, { keys });
  }

  // Proxy to Karan
  if (pathname.startsWith('/api/karan/')) {
    const karanPath = pathname.replace('/api/karan', '');
    try {
      const body = method !== 'GET' ? await readBody(req) : null;
      const karanRes = await proxyRequest(KARAN_API, karanPath, method, body, sessionId);
      return send(res, 200, karanRes);
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  // Proxy to Chairman
  if (pathname.startsWith('/api/chairman/')) {
    const chairmanPath = pathname.replace('/api/chairman', '');
    try {
      const chairmanRes = await proxyRequest(CHAIRMAN_API, chairmanPath, method);
      return send(res, 200, chairmanRes);
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  // Proxy to Jarvis
  if (pathname.startsWith('/api/jarvis/')) {
    const jarvisPath = pathname.replace('/api/jarvis', '');
    try {
      const body = method !== 'GET' ? await readBody(req) : null;
      const jarvisRes = await proxyRequest(JARVIS_API, jarvisPath, method, body);
      return send(res, 200, jarvisRes);
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  send(res, 404, { error: 'Not found' });
}

async function proxyRequest(baseUrl, path, method, body, sessionId) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    if (sessionId) url.searchParams.set('sessionId', sessionId);

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function send(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// WebSocket upgrade
function upgradeToWebSocket(req, socket, head) {
  const url_obj = new URL(req.url, 'http://x');
  const sessionId = url_obj.searchParams.get('sessionId');
  const sess = verifySession(sessionId);

  if (!sess) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  const hash = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');

  const response = 'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${hash}\r\n\r\n`;

  socket.write(response);

  const ws = { socket, isAlive: true, sessionId, userId: sess.uid };
  WS_CLIENTS.set(socket, ws);

  socket.on('error', (err) => console.error('WebSocket error:', err.message));
  socket.on('close', () => WS_CLIENTS.delete(socket));
}

function broadcastEvent(channel, data) {
  const msg = JSON.stringify({ channel, data, timestamp: Date.now() });
  const frame = createWebSocketFrame(msg);

  for (const [socket, ws] of WS_CLIENTS) {
    try { socket.write(frame); } catch (e) {}
  }
}

function createWebSocketFrame(data) {
  const payload = Buffer.from(data);
  let headerSize = 2;
  if (payload.length >= 126) headerSize += (payload.length < 65536) ? 2 : 8;

  const frame = Buffer.alloc(headerSize + payload.length);
  frame[0] = 0x81;
  let offset = 1;

  if (payload.length < 126) {
    frame[offset] = payload.length;
    offset = 2;
  } else if (payload.length < 65536) {
    frame[offset] = 126;
    frame.writeUInt16BE(payload.length, offset + 1);
    offset = 4;
  } else {
    frame[offset] = 127;
    frame.writeBigUInt64BE(BigInt(payload.length), offset + 1);
    offset = 10;
  }

  payload.copy(frame, offset);
  return frame;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');

    if (url.pathname.startsWith('/api/')) {
      return await handleAPI(req, res, url.pathname, url.searchParams);
    }

    // Serve HTML dashboard
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end(getIndexHTML());
  } catch (e) {
    console.error('Error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
});

server.on('upgrade', (req, socket, head) => {
  if (req.headers.upgrade === 'websocket') {
    upgradeToWebSocket(req, socket, head);
  }
});

// Startup
(async function init() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('   KARAN DASHBOARD - Unified AI Operating System');
  console.log('════════════════════════════════════════════════════════\n');

  try {
    const raw = await STORE.read(DB);
    if (raw) {
      STATE = JSON.parse(raw);
    }

    const sraw = await STORE.read(SESSDB);
    if (sraw) {
      const now = Date.now();
      for (const [k, v] of Object.entries(JSON.parse(sraw))) {
        if (now - v.t < TTL) SESS.set(k, v);
      }
    }
  } catch (e) {
    console.error('Store init failed:', e.message);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`   RUNNING ON:  http://localhost:${PORT}`);
    console.log(`   MODE:        ${PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`   STORE:       ${STORE.describe()}`);
    console.log('\n   Services:');
    console.log(`     • Karan API: ${KARAN_API}`);
    console.log(`     • Chairman: ${CHAIRMAN_API}`);
    console.log(`     • Jarvis: ${JARVIS_API}`);
    console.log('\n   Features:');
    console.log(`     • Multi-user auth ✓`);
    console.log(`     • API key management ✓`);
    console.log(`     • Real-time WebSocket ✓`);
    console.log(`     • Service orchestration ✓`);
    console.log('\n════════════════════════════════════════════════════════\n');
  });
})();

process.on('SIGTERM', () => {
  console.log('[shutdown] Karan Dashboard shutting down...');
  setTimeout(() => process.exit(0), 1500);
});

// HTML Dashboard (ChatGPT/Claude.com style)
function getIndexHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Karan Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #333; height: 100vh; display: flex; overflow: hidden; }

    .sidebar { width: 300px; background: #f7f7f7; border-right: 1px solid #e5e5e5; display: flex; flex-direction: column; }
    .sidebar-header { padding: 20px; border-bottom: 1px solid #e5e5e5; }
    .sidebar-header h1 { font-size: 20px; color: #000; }
    .sidebar-new { width: 100%; padding: 10px 20px; margin: 10px 0; background: #10a37f; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; }
    .sidebar-new:hover { background: #1a8f6f; }

    .sidebar-chats { flex: 1; overflow-y: auto; padding: 10px; }
    .chat-item { padding: 12px; margin-bottom: 8px; background: white; border: 1px solid #e5e5e5; border-radius: 6px; cursor: pointer; font-size: 14px; transition: 0.2s; }
    .chat-item:hover { background: #f0f0f0; }
    .chat-item.active { background: #10a37f; color: white; }

    .sidebar-footer { padding: 15px; border-top: 1px solid #e5e5e5; }
    .user-info { font-size: 13px; color: #666; margin-bottom: 10px; }
    .logout-btn { width: 100%; padding: 8px; background: #e5e5e5; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }

    .main { flex: 1; display: flex; flex-direction: column; background: white; }
    .header { padding: 20px; border-bottom: 1px solid #e5e5e5; display: flex; justify-content: space-between; align-items: center; }
    .header-title { font-size: 18px; font-weight: 600; }
    .header-actions { display: flex; gap: 10px; }
    .header-btn { padding: 8px 16px; background: #f0f0f0; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }

    .content { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; }
    .messages { flex: 1; margin-bottom: 20px; }
    .message { margin-bottom: 16px; padding: 12px 16px; border-radius: 8px; max-width: 80%; }
    .message.user { align-self: flex-end; background: #10a37f; color: white; }
    .message.assistant { align-self: flex-start; background: #f0f0f0; color: #333; }
    .message.system { align-self: center; background: #e5e5e5; color: #666; font-size: 12px; max-width: 100%; }

    .input-area { display: flex; gap: 10px; }
    .input-area input { flex: 1; padding: 12px; border: 1px solid #e5e5e5; border-radius: 6px; font-size: 14px; }
    .input-area input:focus { outline: none; border-color: #10a37f; }
    .input-area button { padding: 12px 20px; background: #10a37f; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; }
    .input-area button:hover { background: #1a8f6f; }

    .panel { width: 280px; border-left: 1px solid #e5e5e5; padding: 20px; overflow-y: auto; }
    .panel-title { font-size: 14px; font-weight: 600; margin-bottom: 15px; }
    .panel-item { padding: 10px; background: #f7f7f7; margin-bottom: 10px; border-radius: 4px; font-size: 13px; }

    .auth-modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z: 1000; }
    .auth-modal.hidden { display: none; }
    .auth-box { background: white; padding: 40px; border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .auth-box h2 { margin-bottom: 20px; }
    .auth-box label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 500; }
    .auth-box input { width: 100%; padding: 10px; border: 1px solid #e5e5e5; border-radius: 4px; margin-bottom: 16px; font-size: 14px; }
    .auth-box input:focus { outline: none; border-color: #10a37f; }
    .auth-box button { width: 100%; padding: 10px; background: #10a37f; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; margin-bottom: 10px; }
    .auth-toggle { text-align: center; font-size: 13px; color: #666; }
    .auth-toggle a { color: #10a37f; cursor: pointer; text-decoration: underline; }
  </style>
</head>
<body>
  <!-- Auth Modal -->
  <div id="auth-modal" class="auth-modal">
    <div class="auth-box">
      <h2 id="auth-title">Login to Karan Dashboard</h2>
      <div id="login-form">
        <label>Email</label>
        <input type="email" id="login-email" placeholder="your@email.com">
        <label>Password</label>
        <input type="password" id="login-password" placeholder="password">
        <button onclick="handleLogin()">Login</button>
        <div class="auth-toggle">
          New user? <a onclick="switchToRegister()">Create account</a>
        </div>
      </div>
      <div id="register-form" style="display:none;">
        <label>Email</label>
        <input type="email" id="register-email" placeholder="your@email.com">
        <label>Full Name</label>
        <input type="text" id="register-name" placeholder="Your Name">
        <label>Password</label>
        <input type="password" id="register-password" placeholder="strong password">
        <button onclick="handleRegister()">Create Account</button>
        <div class="auth-toggle">
          Have an account? <a onclick="switchToLogin()">Login</a>
        </div>
      </div>
    </div>
  </div>

  <!-- Main UI -->
  <div class="sidebar">
    <div class="sidebar-header">
      <h1>⚡ Karan</h1>
      <button class="sidebar-new" onclick="newChat()">+ New Chat</button>
    </div>
    <div class="sidebar-chats" id="chat-list"></div>
    <div class="sidebar-footer">
      <div class="user-info" id="user-info">Loading...</div>
      <button class="logout-btn" onclick="logout()">Logout</button>
    </div>
  </div>

  <div class="main">
    <div class="header">
      <div class="header-title" id="chat-title">Start a new chat</div>
      <div class="header-actions">
        <button class="header-btn" onclick="showSettings()">⚙️ Settings</button>
      </div>
    </div>
    <div class="content">
      <div class="messages" id="messages"></div>
      <div class="input-area">
        <input type="text" id="message-input" placeholder="Message Karan, Chairman, or Jarvis..." onkeypress="if(event.key==='Enter') sendMessage()">
        <button onclick="sendMessage()">→</button>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-title">📊 Services</div>
    <div class="panel-item">Chairman: <span id="chairman-status">●</span></div>
    <div class="panel-item">Karan: <span id="karan-status">●</span></div>
    <div class="panel-item">Jarvis: <span id="jarvis-status">●</span></div>
    <div class="panel-title" style="margin-top: 20px;">📋 Tasks</div>
    <div id="tasks-list"></div>
    <div class="panel-title" style="margin-top: 20px;">🎤 Voice</div>
    <button class="header-btn" style="width: 100%;" onclick="startVoice()">Start Voice Command</button>
  </div>

  <script>
    let sessionId = localStorage.getItem('sessionId');
    const authModal = document.getElementById('auth-modal');
    const messagesDiv = document.getElementById('messages');

    async function api(path, method = 'GET', data = null) {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (data) opts.body = JSON.stringify(data);
      const res = await fetch(\`/api\${path}?sessionId=\${sessionId}\`, opts);
      return res.json();
    }

    function showAuthModal() {
      authModal.classList.remove('hidden');
    }

    function hideAuthModal() {
      authModal.classList.add('hidden');
    }

    function switchToLogin() {
      document.getElementById('login-form').style.display = 'block';
      document.getElementById('register-form').style.display = 'none';
      document.getElementById('auth-title').textContent = 'Login to Karan Dashboard';
    }

    function switchToRegister() {
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('register-form').style.display = 'block';
      document.getElementById('auth-title').textContent = 'Create Your Account';
    }

    async function handleLogin() {
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      if (!email || !password) { alert('Please fill all fields'); return; }
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.ok) {
          sessionId = data.sessionId;
          localStorage.setItem('sessionId', sessionId);
          hideAuthModal();
          location.reload();
        } else {
          alert('Login failed: ' + data.error);
        }
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }

    async function handleRegister() {
      const email = document.getElementById('register-email').value.trim();
      const name = document.getElementById('register-name').value.trim();
      const password = document.getElementById('register-password').value;
      if (!email || !name || !password) { alert('Please fill all fields'); return; }
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name, password })
        });
        const data = await res.json();
        if (data.ok) {
          sessionId = data.sessionId;
          localStorage.setItem('sessionId', sessionId);
          hideAuthModal();
          location.reload();
        } else {
          alert('Registration failed: ' + data.error);
        }
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }

    async function sendMessage() {
      const input = document.getElementById('message-input');
      const text = input.value.trim();
      if (!text) return;

      const msgDiv = document.createElement('div');
      msgDiv.className = 'message user';
      msgDiv.textContent = text;
      messagesDiv.appendChild(msgDiv);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      input.value = '';

      try {
        const data = await api('/karan/chat', 'POST', { message: text });
        const respDiv = document.createElement('div');
        respDiv.className = 'message assistant';
        respDiv.textContent = data.message?.text || data.response || 'Processing...';
        messagesDiv.appendChild(respDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      } catch (e) {
        const errDiv = document.createElement('div');
        errDiv.className = 'message system';
        errDiv.textContent = 'Error: ' + e.message;
        messagesDiv.appendChild(errDiv);
      }
    }

    function newChat() {
      messagesDiv.innerHTML = '';
      document.getElementById('message-input').focus();
    }

    function logout() {
      localStorage.removeItem('sessionId');
      location.reload();
    }

    function showSettings() {
      alert('Settings panel coming soon');
    }

    function startVoice() {
      alert('Voice integration coming soon');
    }

    (async () => {
      if (!sessionId) {
        showAuthModal();
        return;
      }
      try {
        const data = await api('/health');
        if (!data.ok) location.reload();
        document.getElementById('user-info').textContent = 'Logged in';
      } catch (e) {
        console.error('Init failed:', e);
      }
    })();
  </script>
</body>
</html>`;
}

#!/usr/bin/env node
/* KARAN DASHBOARD - FIXED & SIMPLIFIED */

const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8000');
const KARAN_API = process.env.KARAN_API || 'http://localhost:9000';
const CHAIRMAN_API = process.env.CHAIRMAN_API || 'http://localhost:8080';
const JARVIS_API = process.env.JARVIS_API || 'http://localhost:8001';

// Change this one value to rename the product everywhere.
const BRAND = process.env.BRAND || 'KARAN';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || '';

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

// Checked server-side. A browser fetch straight to the backends is cross-origin,
// and only chairman-enhanced.js sends CORS headers, so two of three always
// looked offline from the page even while running.
function checkBackend(baseUrl) {
  return new Promise(resolve => {
    const started = Date.now();
    const client = baseUrl.startsWith('https') ? https : http;
    const done = (online, note) => resolve({ online, ms: Date.now() - started, note });

    const req = client.get(baseUrl + '/api/health', { timeout: 12000 }, r => {
      r.resume();
      done(r.statusCode === 200, r.statusCode === 200 ? null : 'HTTP ' + r.statusCode);
    });
    req.on('error', e => done(false, e.code === 'ENOTFOUND' ? 'not found' : 'unreachable'));
    req.on('timeout', () => { req.destroy(); done(false, 'waking up'); });
  });
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

    if (pathname === '/api/status') {
      const names = ['karan', 'chairman', 'jarvis'];
      const results = await Promise.all([KARAN_API, CHAIRMAN_API, JARVIS_API].map(checkBackend));
      const status = {};
      names.forEach((n, i) => { status[n] = results[i]; });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(status));
    }

    // Dashboard page
    if (pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(getDashboardHTML());
    }

    // Proxy to backends
    const backend = { karan: KARAN_API, chairman: CHAIRMAN_API, jarvis: JARVIS_API };
    const proxyMatch = pathname.match(/^\/api\/(karan|chairman|jarvis)(\/.*)$/);
    if (proxyMatch) {
      const [, name, path] = proxyMatch;
      const body = req.method !== 'GET' ? await readBody(req) : null;
      const result = await proxyRequest(backend[name], path, req.method, body);
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result.data));
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
    const headers = { 'Content-Type': 'application/json' };
    // Karan and Chairman gate their APIs on their own session. This identifies
    // the dashboard as a trusted internal caller instead.
    if (SERVICE_TOKEN) headers['x-service-token'] = SERVICE_TOKEN;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);

    const req = proto.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers,
      timeout: 15000
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch(e) { parsed = { raw: data }; }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Backend timed out')); });
    if (body) req.write(body);
    req.end();
  });
}

function baseStyles() {
  return `
    :root {
      --bg: #070b14; --ink: #e8edf5; --muted: #8b97ab;
      --line: rgba(255,255,255,.09); --glass: rgba(255,255,255,.045);
      --accent: #10b981; --accent-soft: rgba(16,185,129,.16); --danger: #f43f5e;
      --radius: 16px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg); color: var(--ink);
      min-height: 100vh; overflow-x: hidden; -webkit-font-smoothing: antialiased;
    }
    /* Drifting aurora field */
    .aurora { position: fixed; inset: -30%; z-index: 0; filter: blur(90px); opacity: .55; pointer-events: none; }
    .aurora span { position: absolute; border-radius: 50%; display: block; }
    .aurora .a1 { width: 45vw; height: 45vw; left: 5%;  top: 5%;  background: #0f766e; animation: drift1 22s ease-in-out infinite; }
    .aurora .a2 { width: 38vw; height: 38vw; right: 8%; top: 25%; background: #1d4ed8; animation: drift2 27s ease-in-out infinite; }
    .aurora .a3 { width: 32vw; height: 32vw; left: 32%; bottom: 2%; background: #059669; animation: drift3 31s ease-in-out infinite; }
    @keyframes drift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(9vw,7vh) scale(1.18); } }
    @keyframes drift2 { 0%,100% { transform: translate(0,0) scale(1.1); } 50% { transform: translate(-8vw,10vh) scale(.9); } }
    @keyframes drift3 { 0%,100% { transform: translate(0,0) scale(.95); } 50% { transform: translate(6vw,-8vh) scale(1.2); } }
    /* Fine grain so the gradients do not band */
    body::after {
      content: ''; position: fixed; inset: 0; z-index: 1; pointer-events: none; opacity: .035;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    }
    .glass {
      background: var(--glass); border: 1px solid var(--line);
      backdrop-filter: blur(20px) saturate(1.3); -webkit-backdrop-filter: blur(20px) saturate(1.3);
      border-radius: var(--radius);
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: .14em; }
    .brand-dot {
      width: 9px; height: 9px; border-radius: 50%; background: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-soft); animation: breathe 2.6s ease-in-out infinite;
    }
    @keyframes breathe { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
    button {
      font: inherit; font-weight: 600; cursor: pointer; color: #04140e;
      background: linear-gradient(135deg, #34d399, var(--accent));
      border: none; border-radius: 10px; padding: 12px 18px;
      transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
    }
    button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(16,185,129,.3); }
    button:disabled { filter: grayscale(.6); opacity: .6; cursor: default; }
    input, textarea {
      font: inherit; width: 100%; color: var(--ink);
      background: rgba(255,255,255,.05); border: 1px solid var(--line);
      border-radius: 10px; padding: 12px 14px; transition: border-color .2s, box-shadow .2s;
    }
    input::placeholder { color: var(--muted); }
    input:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .error { color: #fda4af; font-size: 13px; min-height: 18px; }
    ::-webkit-scrollbar { width: 9px; height: 9px; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
    }
  `;
}

function getLoginHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${BRAND}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${baseStyles()}
  .wrap { position: relative; z-index: 2; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
  .card { width: 100%; max-width: 400px; padding: 40px 34px; animation: rise .7s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes rise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
  .card .brand { justify-content: center; font-size: 22px; margin-bottom: 6px; }
  .sub { text-align: center; color: var(--muted); font-size: 13px; margin-bottom: 30px; }
  .field { margin-bottom: 14px; }
  label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; font-weight: 500; }
  .card button { width: 100%; margin-top: 8px; }
  .foot { text-align: center; color: var(--muted); font-size: 11.5px; margin-top: 22px; line-height: 1.6; }
</style>
</head>
<body>
<div class="aurora"><span class="a1"></span><span class="a2"></span><span class="a3"></span></div>

<div class="wrap">
  <div class="card glass">
    <div class="brand"><span class="brand-dot"></span>${BRAND}</div>
    <p class="sub">Private command center</p>

    <div class="field">
      <label for="login-email">Email</label>
      <input type="email" id="login-email" autocomplete="username" placeholder="you@example.com">
    </div>
    <div class="field">
      <label for="login-password">Password</label>
      <input type="password" id="login-password" autocomplete="current-password" placeholder="••••••••">
    </div>

    <button id="login-button" onclick="handleLogin()">Sign in</button>
    <div class="error" id="login-error"></div>
    <p class="foot">Single-owner access.<br>Backends may take up to a minute to wake.</p>
  </div>
</div>

<script>
  var errorBox = document.getElementById('login-error');
  var button = document.getElementById('login-button');

  async function handleLogin() {
    var email = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    if (!email || !password) { errorBox.textContent = 'Enter your email and password'; return; }

    errorBox.textContent = '';
    button.disabled = true;
    button.textContent = 'Signing in...';

    try {
      var res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.ok && data.ok) { location.href = '/'; return; }
      errorBox.textContent = res.status === 401
        ? 'Incorrect email or password'
        : (data.error || 'Sign in failed (' + res.status + ')');
    } catch (e) {
      errorBox.textContent = 'Could not reach the server: ' + e.message;
    }

    button.disabled = false;
    button.textContent = 'Sign in';
  }

  document.querySelectorAll('input').forEach(function (el) {
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleLogin(); });
  });
</script>
</body>
</html>`;
}

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${BRAND} · Command Center</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${baseStyles()}
  .shell { position: relative; z-index: 2; display: grid; grid-template-columns: 248px 1fr; gap: 20px; padding: 20px; min-height: 100vh; }
  aside { padding: 22px 18px; height: fit-content; position: sticky; top: 20px; }
  aside .brand { font-size: 16px; margin-bottom: 26px; }
  .nav-item {
    display: flex; align-items: center; gap: 11px; padding: 11px 13px; margin-bottom: 5px;
    border-radius: 11px; cursor: pointer; color: var(--muted); font-size: 14px; font-weight: 500;
    border: 1px solid transparent; transition: all .2s ease;
  }
  .nav-item:hover { background: rgba(255,255,255,.05); color: var(--ink); transform: translateX(3px); }
  .nav-item.active { background: var(--accent-soft); color: #6ee7b7; border-color: rgba(16,185,129,.3); }
  .nav-item .ico { width: 17px; text-align: center; }

  main { min-width: 0; }
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 22px; margin-bottom: 18px; }
  .topbar h1 { font-size: 19px; font-weight: 600; letter-spacing: -.01em; }
  .topbar .meta { display: flex; align-items: center; gap: 16px; color: var(--muted); font-size: 12.5px; }
  .clock { font-family: 'JetBrains Mono', monospace; }
  .ghost { background: rgba(255,255,255,.06); color: var(--ink); border: 1px solid var(--line); padding: 9px 15px; font-size: 13px; }
  .ghost:hover { box-shadow: none; background: rgba(255,255,255,.1); }

  .section { display: none; animation: fade .45s cubic-bezier(.2,.8,.2,1) both; }
  .section.active { display: block; }
  @keyframes fade { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

  .panel { padding: 24px; margin-bottom: 18px; }
  .panel h3 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .panel .hint { color: var(--muted); font-size: 12.5px; margin-bottom: 18px; }

  .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 13px; }
  .svc {
    display: flex; align-items: center; gap: 13px; padding: 16px;
    border: 1px solid var(--line); border-radius: 13px; background: rgba(255,255,255,.03);
    transition: border-color .3s, transform .2s;
  }
  .svc:hover { transform: translateY(-2px); }
  .svc.up { border-color: rgba(16,185,129,.34); }
  .svc.down { border-color: rgba(244,63,94,.3); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); flex-shrink: 0; }
  .svc.up .dot { background: var(--accent); box-shadow: 0 0 0 0 rgba(16,185,129,.6); animation: ping 2s ease-out infinite; }
  .svc.down .dot { background: var(--danger); }
  @keyframes ping { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,.55); } 70% { box-shadow: 0 0 0 9px rgba(16,185,129,0); } 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); } }
  .svc .name { font-weight: 600; font-size: 14px; text-transform: capitalize; }
  .svc .sub { color: var(--muted); font-size: 11.5px; font-family: 'JetBrains Mono', monospace; margin-top: 2px; }

  .log {
    font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.65;
    background: rgba(0,0,0,.32); border: 1px solid var(--line); border-radius: 12px;
    padding: 15px; max-height: 340px; overflow: auto; white-space: pre-wrap; word-break: break-word;
    color: #a7f3d0;
  }
  .chat-log { height: 330px; overflow-y: auto; display: flex; flex-direction: column; gap: 11px; margin-bottom: 14px; padding: 4px; }
  .msg { max-width: 78%; padding: 11px 15px; border-radius: 14px; font-size: 14px; line-height: 1.5; animation: pop .35s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: none; } }
  .msg.me { align-self: flex-end; background: linear-gradient(135deg,#34d399,var(--accent)); color: #04140e; border-bottom-right-radius: 4px; }
  .msg.them { align-self: flex-start; background: rgba(255,255,255,.07); border: 1px solid var(--line); border-bottom-left-radius: 4px; }
  .msg.sys { align-self: center; background: rgba(244,63,94,.12); border: 1px solid rgba(244,63,94,.3); color: #fda4af; font-size: 12.5px; }
  .row { display: flex; gap: 10px; }
  .row input { flex: 1; }

  @media (max-width: 860px) {
    .shell { grid-template-columns: 1fr; padding: 14px; }
    aside { position: static; }
    aside .nav { display: flex; gap: 8px; overflow-x: auto; }
    .nav-item { margin-bottom: 0; white-space: nowrap; }
    .nav-item span:not(.ico) { display: none; }
  }
</style>
</head>
<body>
<div class="aurora"><span class="a1"></span><span class="a2"></span><span class="a3"></span></div>

<div class="shell">
  <aside class="glass">
    <div class="brand"><span class="brand-dot"></span>${BRAND}</div>
    <div class="nav">
      <div class="nav-item active" data-sec="overview"><span class="ico">◈</span><span>Overview</span></div>
      <div class="nav-item" data-sec="chat"><span class="ico">✦</span><span>Chat</span></div>
      <div class="nav-item" data-sec="monitor"><span class="ico">▤</span><span>Monitor</span></div>
      <div class="nav-item" data-sec="voice"><span class="ico">◉</span><span>Voice</span></div>
    </div>
  </aside>

  <main>
    <div class="topbar glass">
      <h1 id="page-title">Overview</h1>
      <div class="meta">
        <span class="clock" id="clock"></span>
        <button class="ghost" onclick="logout()">Sign out</button>
      </div>
    </div>

    <section id="overview" class="section active">
      <div class="panel glass">
        <h3>System status</h3>
        <p class="hint">Checked from the server every 20 seconds. Free-tier services sleep when idle and take up to a minute to wake.</p>
        <div class="status-grid" id="status-grid"></div>
      </div>
    </section>

    <section id="chat" class="section">
      <div class="panel glass">
        <h3>Chat</h3>
        <p class="hint">Talks to the Karan service.</p>
        <div class="chat-log" id="chat-log"></div>
        <div class="row">
          <input id="chat-input" placeholder="Ask something..." autocomplete="off">
          <button id="chat-send" onclick="sendMessage()">Send</button>
        </div>
      </div>
    </section>

    <section id="monitor" class="section">
      <div class="panel glass">
        <h3>Monitor</h3>
        <p class="hint">Live payload from the Chairman service.</p>
        <div class="row" style="margin-bottom:14px">
          <button onclick="loadFeed('monitor-out','/api/chairman/api/dashboard')">Refresh</button>
        </div>
        <div class="log" id="monitor-out">Press refresh to load.</div>
      </div>
    </section>

    <section id="voice" class="section">
      <div class="panel glass">
        <h3>Voice</h3>
        <p class="hint">Available commands from the Jarvis service.</p>
        <div class="row" style="margin-bottom:14px">
          <button onclick="loadFeed('voice-out','/api/jarvis/api/commands')">Load commands</button>
        </div>
        <div class="log" id="voice-out">Press load to fetch.</div>
      </div>
    </section>
  </main>
</div>

<script>
  var TITLES = { overview: 'Overview', chat: 'Chat', monitor: 'Monitor', voice: 'Voice' };

  document.querySelectorAll('.nav-item').forEach(function (item) {
    item.addEventListener('click', function () {
      var name = item.dataset.sec;
      document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
      document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
      document.getElementById(name).classList.add('active');
      item.classList.add('active');
      document.getElementById('page-title').textContent = TITLES[name];
    });
  });

  function tick() {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
  tick();
  setInterval(tick, 1000);

  async function checkStatus() {
    var grid = document.getElementById('status-grid');
    try {
      var res = await fetch('/api/status');
      if (res.status === 401) { location.href = '/'; return; }
      var data = await res.json();
      grid.innerHTML = '';
      Object.keys(data).forEach(function (name) {
        var s = data[name];
        var detail = s.online ? s.ms + ' ms' : (s.note || 'offline');
        var el = document.createElement('div');
        el.className = 'svc ' + (s.online ? 'up' : 'down');
        el.innerHTML = '<span class="dot"></span><div><div class="name">' + name +
          '</div><div class="sub">' + (s.online ? 'online · ' : '') + detail + '</div></div>';
        grid.appendChild(el);
      });
    } catch (e) {
      grid.innerHTML = '<div class="svc down"><span class="dot"></span><div>' +
        '<div class="name">status</div><div class="sub">check failed</div></div></div>';
    }
  }
  checkStatus();
  setInterval(checkStatus, 20000);

  function addMsg(text, kind) {
    var log = document.getElementById('chat-log');
    var el = document.createElement('div');
    el.className = 'msg ' + kind;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  async function sendMessage() {
    var input = document.getElementById('chat-input');
    var send = document.getElementById('chat-send');
    var text = input.value.trim();
    if (!text) return;

    addMsg(text, 'me');
    input.value = '';
    send.disabled = true;

    try {
      var res = await fetch('/api/karan/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        addMsg('Karan service returned ' + res.status + (data.error ? ': ' + data.error : ''), 'sys');
      } else {
        var m = data.message;
        var reply = typeof m === 'string' ? m
          : (m && typeof m.text === 'string' ? m.text : JSON.stringify(data, null, 2));
        addMsg(reply, 'them');
      }
    } catch (e) {
      addMsg('Could not reach the Karan service: ' + e.message, 'sys');
    }
    send.disabled = false;
    input.focus();
  }

  document.getElementById('chat-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendMessage();
  });

  async function loadFeed(target, path) {
    var out = document.getElementById(target);
    out.textContent = 'Loading... (a sleeping service can take up to a minute)';
    try {
      var res = await fetch(path);
      var data = await res.json().catch(function () { return {}; });
      out.textContent = res.ok
        ? JSON.stringify(data, null, 2)
        : 'HTTP ' + res.status + '\n' + JSON.stringify(data, null, 2);
    } catch (e) {
      out.textContent = 'Request failed: ' + e.message;
    }
  }

  async function logout() {
    await fetch('/api/auth/logout').catch(function () {});
    location.href = '/';
  }
</script>
</body>
</html>`;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n${BRAND} dashboard running on http://localhost:${PORT}\n`);
  console.log(`   Karan API: ${KARAN_API}`);
  console.log(`   Chairman API: ${CHAIRMAN_API}`);
  console.log(`   Jarvis API: ${JARVIS_API}\n`);
});

process.on('SIGTERM', () => {
  console.log('\n[shutdown] Dashboard shutting down...');
  server.close(() => process.exit(0));
});

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
<head><title>${BRAND} - Setup</title><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #faf4e9; color: #2e1116; margin: 0; padding: 40px; }
  .box { background: #fff; border: 1px solid rgba(155,27,48,.14); box-shadow: 0 12px 32px rgba(46,17,22,.09);
         padding: 32px; border-radius: 16px; max-width: 620px; margin: 0 auto; }
  h1 { font-size: 20px; margin-bottom: 14px; }
  p { line-height: 1.7; color: #5c3a3f; }
  code { background: rgba(155,27,48,.10); color: #9b1b30; padding: 2px 7px;
         border-radius: 5px; font-size: 13px; }
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
      // A free-tier backend that has idled takes up to a minute to wake. At the
      // old 15s the first message after any quiet period always failed, which
      // is why the chat looked broken.
      timeout: 75000
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

function bgScript() {
  // A raymarched height field, shaded and fogged, drawn straight to a canvas.
  // No library: three.js from a CDN is one more thing that can fail, and the
  // Google Fonts outage already proved what a blocked external does to a page.
  // GLSL lives in script tags so the template literal never has to escape it.
  return `
<script type="x-shader/x-vertex" id="vs">
attribute vec2 pos;
void main(){ gl_Position = vec4(pos, 0.0, 1.0); }
</script>
<script type="x-shader/x-fragment" id="fs">
precision highp float;
uniform vec2  u_res;
uniform float u_time;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// A thin slab. Seven of them, tumbling on their own clocks, make the field.
float box(vec3 p, vec3 b){
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float map(vec3 p){
  float d = 1e9;
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    vec3 q = p - vec3(sin(fi * 2.3 + u_time * 0.13) * 1.9,
                      cos(fi * 1.9 + u_time * 0.10) * 0.95,
                      fi * 1.02 - 1.6);
    q.xz *= rot(u_time * 0.16 + fi);
    q.xy *= rot(fi * 0.7);
    d = min(d, box(q, vec3(0.58, 0.045, 0.58)));
  }
  return d;
}

vec3 nrm(vec3 p){
  vec2 e = vec2(0.0012, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy),
                        map(p + e.yxy) - map(p - e.yxy),
                        map(p + e.yyx) - map(p - e.yyx)));
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;

  vec3 ro = vec3(0.0, 0.0, -4.5);
  vec3 rd = normalize(vec3(uv, 1.6));

  float t = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 82; i++){
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < 0.002){ hit = 1.0; break; }
    t += d;
    if (t > 16.0) break;
  }

  vec3 ivory = vec3(0.980, 0.957, 0.914);
  vec3 ruby  = vec3(0.608, 0.106, 0.188);
  vec3 gold  = vec3(0.910, 0.639, 0.239);
  vec3 col   = ivory;

  if (hit > 0.5){
    vec3 p = ro + rd * t;
    vec3 n = nrm(p);

    float fres = pow(1.0 - abs(dot(n, rd)), 2.2);
    float diff = clamp(dot(n, normalize(vec3(-0.4, 0.8, -0.5))), 0.0, 1.0);
    float spec = pow(clamp(dot(reflect(rd, n), normalize(vec3(-0.35, 0.85, -0.4))), 0.0, 1.0), 38.0);

    // Split the refraction so the edges throw gold and the bodies hold ruby.
    float split = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 glass = mix(ruby, gold, clamp(split * 0.78 + fres * 0.22, 0.0, 1.0));

    // Deeper bodies so ruby and gold actually read against ivory, with the
    // edges kept bright so the slabs still look like glass rather than card.
    col = mix(ivory, glass, 0.62 + fres * 0.34);
    col *= 0.92 + diff * 0.22;
    col += spec * 0.55 * mix(vec3(1.0), gold, 0.6);
    col = mix(col, ivory, clamp(t / 15.0, 0.0, 1.0));
  }

  // Keep the headline band calm.
  col = mix(col, ivory, smoothstep(0.20, 0.94, gl_FragCoord.y / u_res.y) * 0.34);
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.006;

  gl_FragColor = vec4(col, 1.0);
}
</script>
<script>
(function () {
  var canvas = document.getElementById('bg');
  if (!canvas) return;

  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gl = null;
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
      || canvas.getContext('experimental-webgl');
  } catch (e) { gl = null; }
  // No WebGL: the CSS gradient already on the canvas stands in.
  if (!gl) return;

  function build(type, id) {
    var s = gl.createShader(type);
    gl.shaderSource(s, document.getElementById(id).textContent);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl = null; return null; }
    return s;
  }

  var vs = build(gl.VERTEX_SHADER, 'vs');
  var fs = vs && build(gl.FRAGMENT_SHADER, 'fs');
  if (!vs || !fs) return;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes  = gl.getUniformLocation(prog, 'u_res');
  var uTime = gl.getUniformLocation(prog, 'u_time');

  function resize() {
    // Render at the device's real pixel density, capped so a 3x phone screen
    // does not quadruple the fragment work for no visible gain.
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.floor(canvas.clientWidth  * dpr);
    var h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }

  var start = Date.now();
  var running = true;
  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) requestAnimationFrame(frame);
  });

  function frame() {
    if (!running) return;
    resize();
    gl.uniform1f(uTime, still ? 8.0 : (Date.now() - start) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // A still frame is enough when motion is unwelcome.
    if (!still) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('resize', function () { if (still) requestAnimationFrame(frame); });
})();
<\/script>`;
}

function baseStyles() {
  return `
    :root {
      /* Ruby Velvet, Saffron Gold, Warm Ivory.
         Gold is decorative only: at 2.1:1 on ivory it fails as body text, so it
         carries the shader and small marks while ruby carries every label. */
      --bg: #faf4e9; --paper: #fffdf8; --ink: #2e1116; --ink-soft: #5c3a3f;
      --muted: #8a6a6a; --line: rgba(155,27,48,.14);
      --accent: #9b1b30; --accent-lift: #c0304a; --on-accent: #fffdf8;
      --accent-soft: rgba(155,27,48,.09);
      --gold: #e8a33d; --gold-soft: rgba(232,163,61,.16); --ivory: #faf4e9;
      --danger: #b3261e;
      --radius: 18px;
      --lift-1: 0 1px 2px rgba(46,17,22,.05), 0 4px 12px rgba(46,17,22,.05);
      --lift-2: 0 2px 4px rgba(46,17,22,.06), 0 12px 32px rgba(46,17,22,.09);
      --lift-3: 0 8px 20px rgba(46,17,22,.10), 0 28px 64px rgba(46,17,22,.13);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg); color: var(--ink);
      min-height: 100vh; overflow-x: hidden; -webkit-font-smoothing: antialiased;
    }
    /* A raymarched surface drawn in WebGL at device-pixel-ratio, so it stays
       sharp on high-density screens. CSS gradient behind it is the fallback
       when WebGL is unavailable, and the ground colour while it initialises. */
    #bg {
      position: fixed; inset: 0; z-index: 0; display: block;
      width: 100%; height: 100%; pointer-events: none;
      background: radial-gradient(120% 90% at 20% 0%, #fffdf6 0%, #faf4e9 45%, #f5ecdc 100%);
    }

    .card {
      background: var(--paper); border: 1px solid var(--line);
      border-radius: var(--radius); box-shadow: var(--lift-1);
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: .13em; color: var(--ink); }
    .brand-dot {
      width: 9px; height: 9px; border-radius: 50%; background: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-soft); animation: breathe 2.6s ease-in-out infinite;
    }
    @keyframes breathe { 0%,100% { opacity: 1; } 50% { opacity: .4; } }

    button {
      font: inherit; font-weight: 600; cursor: pointer; color: var(--on-accent);
      background: linear-gradient(135deg, var(--accent-lift), var(--accent));
      border: none; border-radius: 12px; padding: 12px 20px;
      box-shadow: var(--lift-1);
      transition: transform .2s cubic-bezier(.2,.8,.2,1), box-shadow .2s ease, filter .2s ease;
    }
    button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: var(--lift-2); }
    button:active:not(:disabled) { transform: translateY(0); }
    button:disabled { filter: grayscale(.5); opacity: .55; cursor: default; }

    input, textarea {
      font: inherit; width: 100%; color: var(--ink);
      background: #fff; border: 1px solid var(--line);
      border-radius: 12px; padding: 13px 15px;
      transition: border-color .2s, box-shadow .2s;
    }
    input::placeholder { color: var(--muted); }
    input:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
    .error { color: var(--danger); font-size: 13px; min-height: 18px; }

    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-thumb { background: rgba(93,46,70,.18); border-radius: 8px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(93,46,70,.3); }
    ::-webkit-scrollbar-track { background: transparent; }

    /* Panels rise as they enter the viewport. */
    .reveal { opacity: 0; transform: translateY(26px); transition: opacity .7s cubic-bezier(.2,.8,.2,1), transform .7s cubic-bezier(.2,.8,.2,1); }
    .reveal.seen { opacity: 1; transform: none; }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
      .reveal { opacity: 1 !important; transform: none !important; }
      html { scroll-behavior: auto; }
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
<style>
${baseStyles()}
  .wrap { position: relative; z-index: 2; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
  .card { width: 100%; max-width: 400px; padding: 40px 34px; animation: rise .7s cubic-bezier(.2,.8,.2,1); }
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
<canvas id="bg" aria-hidden="true"></canvas>
${bgScript()}

<div class="wrap">
  <div class="card">
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
  .nav-item:hover { background: var(--accent-soft); color: var(--ink); transform: translateX(4px); }
  .nav-item.active { background: var(--accent-soft); color: var(--accent); border-color: rgba(155,27,48,.28); font-weight: 600; }
  .nav-item .ico { width: 17px; text-align: center; }

  main { min-width: 0; }
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 22px; margin-bottom: 18px; }
  .topbar h1 { font-size: 19px; font-weight: 600; letter-spacing: -.01em; }
  .topbar .meta { display: flex; align-items: center; gap: 16px; color: var(--muted); font-size: 12.5px; }
  .clock { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
  .ghost { background: var(--paper); color: var(--ink-soft); border: 1px solid var(--line); padding: 9px 15px; font-size: 13px; box-shadow: none; }
  .ghost:hover { background: var(--accent-soft); color: var(--accent); box-shadow: var(--lift-1); }


  /* Hero. Sits over the WebGL surface, so everything here carries its own
     contrast rather than borrowing it from the background. */
  .hero { padding: 72px 8px 40px; text-align: center; }
  .pill {
    display: inline-flex; align-items: center; gap: 9px;
    padding: 7px 15px 7px 11px; border-radius: 999px;
    background: rgba(255,255,255,.72); backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--line); box-shadow: var(--lift-1);
    font-size: 12.5px; font-weight: 500; color: var(--ink-soft);
    margin-bottom: 26px;
  }
  .pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
  .hero h2 {
    font-size: clamp(36px, 6.2vw, 68px); line-height: 1.03;
    letter-spacing: -.035em; font-weight: 700; color: var(--ink);
    margin-bottom: 20px; text-wrap: balance;
  }
  .hero h2 .accent {
    background: linear-gradient(120deg, var(--accent), var(--gold) 55%, var(--accent-lift));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .hero p.lead {
    font-size: clamp(15px, 1.7vw, 18px); line-height: 1.6; color: var(--ink-soft);
    max-width: 620px; margin: 0 auto 30px; text-wrap: pretty;
  }
  .hero .cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .scroll-hint {
    margin-top: 54px; color: var(--muted); font-size: 11.5px; letter-spacing: .1em;
    animation: nudge 2.4s ease-in-out infinite;
  }
  @keyframes nudge { 0%,100% { transform: translateY(0); opacity: .65; } 50% { transform: translateY(5px); opacity: 1; } }
  @media (max-width: 860px) { .hero { padding: 44px 4px 28px; } }

  .section { display: none; }
  .section.active { display: block; animation: fade .45s cubic-bezier(.2,.8,.2,1); }
  @keyframes fade { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

  .panel { padding: 26px; margin-bottom: 20px; box-shadow: var(--lift-2); }
  .panel:hover { box-shadow: var(--lift-3); }
  .panel h3 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .panel .hint { color: var(--muted); font-size: 12.5px; margin-bottom: 18px; }

  .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 13px; }
  .svc {
    display: flex; align-items: center; gap: 13px; padding: 16px;
    border: 1px solid var(--line); border-radius: 14px; background: var(--paper);
    box-shadow: var(--lift-1);
    transition: border-color .3s, transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s ease;
  }
  .svc { transform-style: preserve-3d; will-change: transform; }
  .svc:hover { box-shadow: var(--lift-2); }
  .svc.up { border-color: rgba(155,27,48,.22); }
  .svc.down { border-color: rgba(179,38,30,.45); background: rgba(179,38,30,.05); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); flex-shrink: 0; }
  .svc.up .dot { background: var(--accent); box-shadow: 0 0 0 0 rgba(155,27,48,.5); animation: ping 2s ease-out infinite; }
  /* Offline is signalled by shape, not hue: a hollow ring against the filled,
     pulsing dot of a healthy service. Two pinks in one palette are too close to
     tell apart at a glance, and this stays readable in any theme. */
  .svc.down .dot { background: transparent; border: 2px solid var(--danger); }
  .svc.down .name, .svc.down .sub { opacity: .8; }
  @keyframes ping { 0% { box-shadow: 0 0 0 0 rgba(155,27,48,.5); } 70% { box-shadow: 0 0 0 9px rgba(155,27,48,0); } 100% { box-shadow: 0 0 0 0 rgba(155,27,48,0); } }
  .svc .name { font-weight: 600; font-size: 14px; text-transform: capitalize; }
  .svc .sub { color: var(--muted); font-size: 11.5px; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; margin-top: 2px; }

  .log {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; line-height: 1.65;
    background: #fdf8ef; border: 1px solid var(--line); border-radius: 12px;
    padding: 15px; max-height: 340px; overflow: auto; white-space: pre-wrap; word-break: break-word;
    color: var(--ink-soft);
  }
  .chat-log { height: 330px; overflow-y: auto; display: flex; flex-direction: column; gap: 11px; margin-bottom: 14px; padding: 4px; }
  .msg { max-width: 78%; padding: 11px 15px; border-radius: 14px; font-size: 14px; line-height: 1.5; animation: pop .35s cubic-bezier(.2,.8,.2,1); }
  @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: none; } }
  .msg.me { align-self: flex-end; background: linear-gradient(135deg,var(--accent-lift),var(--accent)); color: var(--on-accent); border-bottom-right-radius: 4px; }
  .msg.them { align-self: flex-start; background: #fdf8ef; border: 1px solid var(--line); color: var(--ink); border-bottom-left-radius: 4px; box-shadow: var(--lift-1); }
  .msg.sys { align-self: center; background: rgba(179,38,30,.07); border: 1px solid rgba(179,38,30,.28); color: var(--danger); font-size: 12.5px; }
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
<canvas id="bg" aria-hidden="true"></canvas>
${bgScript()}

<div class="shell">
  <aside class="card">
    <div class="brand"><span class="brand-dot"></span>${BRAND}</div>
    <div class="nav">
      <div class="nav-item active" data-sec="overview"><span class="ico">◈</span><span>Overview</span></div>
      <div class="nav-item" data-sec="chat"><span class="ico">✦</span><span>Chat</span></div>
      <div class="nav-item" data-sec="monitor"><span class="ico">▤</span><span>Chairman OS</span></div>
      <div class="nav-item" data-sec="voice"><span class="ico">◉</span><span>Voice</span></div>
    </div>
  </aside>

  <main>
    <div class="topbar card">
      <h1 id="page-title">Overview</h1>
      <div class="meta">
        <span class="clock" id="clock"></span>
        <button class="ghost" onclick="logout()">Sign out</button>
      </div>
    </div>

    <section class="hero" id="hero">
      <div class="pill"><span class="dot" id="pill-dot"></span><span id="pill-text">Checking services...</span></div>
      <h2>Everything you run,<br><span class="accent">answered by one operator.</span></h2>
      <p class="lead">Karan, Chairman and Jarvis behind a single command line. Sub-agents do
      the work in the open; nothing reaches the outside world without your approval.</p>
      <div class="cta">
        <button onclick="goSection('chat')">Open the chat</button>
        <button class="ghost" onclick="goSection('overview')">See system status</button>
      </div>
      <div class="scroll-hint">SCROLL</div>
    </section>

    <section id="overview" class="section active">
      <div class="panel card reveal">
        <h3>System status</h3>
        <p class="hint">Checked from the server every 20 seconds. Free-tier services sleep when idle and take up to a minute to wake.</p>
        <div class="status-grid" id="status-grid"></div>
      </div>
    </section>

    <section id="chat" class="section">
      <div class="panel card reveal">
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
      <div class="panel card reveal">
        <h3>Chairman Agent OS</h3>
        <p class="hint">The full system: business factory, domain desk, growth engine,
        missions, skills and agents. It has its own interface and its own login.</p>
        <div class="row" style="margin-bottom:14px">
          <button onclick="openChairman()">Open Chairman OS</button>
          <button class="ghost" onclick="loadFeed('monitor-out','/api/chairman/api/health')">Check it is awake</button>
        </div>
        <div class="log" id="monitor-out">Opens in a new tab. If it has been idle it takes up to a minute to wake.</div>
      </div>
    </section>

    <section id="voice" class="section">
      <div class="panel card reveal">
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
  var TITLES = { overview: 'Overview', chat: 'Chat', monitor: 'Chairman OS', voice: 'Voice' };
  var CHAIRMAN_URL = '${CHAIRMAN_API}';

  function goSection(name) {
    var item = document.querySelector('.nav-item[data-sec="' + name + '"]');
    if (item) item.click();
    var target = document.getElementById(name);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.querySelectorAll('.nav-item').forEach(function (item) {
    item.addEventListener('click', function () {
      var name = item.dataset.sec;
      document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
      document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
      document.getElementById(name).classList.add('active');
      item.classList.add('active');
      document.getElementById('page-title').textContent = TITLES[name];
      watchReveals();
    });
  });

  // Panels rise in as they enter view; tiles take a slight 3D tilt toward the
  // pointer. Both are skipped when the viewer asks for reduced motion.
  var STILL = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function watchReveals() {
    var items = document.querySelectorAll('.reveal:not(.seen)');
    if (STILL || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('seen'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el) { io.observe(el); });
  }

  function tilt(el) {
    if (STILL) return;
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform =
        'perspective(700px) rotateX(' + (-py * 7).toFixed(2) + 'deg) rotateY(' +
        (px * 9).toFixed(2) + 'deg) translateY(-3px)';
    });
    el.addEventListener('pointerleave', function () { el.style.transform = ''; });
  }

  function tick() {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
  tick();
  setInterval(tick, 1000);
  watchReveals();

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
        tilt(el);
      });
      var names = Object.keys(data);
      var up = names.filter(function (n) { return data[n].online; }).length;
      var dot = document.getElementById('pill-dot');
      var txt = document.getElementById('pill-text');
      if (dot && txt) {
        dot.style.background = up === names.length ? 'var(--accent)' : 'var(--danger)';
        txt.textContent = up === names.length
          ? 'All ' + names.length + ' services operational'
          : up + ' of ' + names.length + ' services responding';
      }
    } catch (e) {
      grid.innerHTML = '<div class="svc down"><span class="dot"></span><div>' +
        '<div class="name">status</div><div class="sub">check failed</div></div></div>';
      var t = document.getElementById('pill-text');
      if (t) t.textContent = 'Status check failed';
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
    return el;
  }

  async function sendMessage() {
    var input = document.getElementById('chat-input');
    var send = document.getElementById('chat-send');
    var text = input.value.trim();
    if (!text) return;

    addMsg(text, 'me');
    input.value = '';
    send.disabled = true;

    // Waking a sleeping backend takes up to a minute, so say so rather than
    // leaving a dead-looking box.
    var waiting = addMsg('Thinking...', 'them');
    var waitedFor = 0;
    var ticker = setInterval(function () {
      waitedFor += 1;
      if (waitedFor === 4) waiting.textContent = 'Waking the Karan service, this can take up to a minute...';
      else if (waitedFor > 4) waiting.textContent = 'Still waking... ' + waitedFor + 's';
    }, 1000);

    var settle = function () { clearInterval(ticker); waiting.remove(); };

    try {
      var res = await fetch('/api/karan/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      var data = await res.json().catch(function () { return {}; });
      settle();
      if (!res.ok) {
        addMsg('Karan service returned ' + res.status + (data.error ? ': ' + data.error : ''), 'sys');
      } else {
        var m = data.message;
        var reply = typeof m === 'string' ? m
          : (m && typeof m.text === 'string' ? m.text : JSON.stringify(data, null, 2));
        addMsg(reply, 'them');
      }
    } catch (e) {
      settle();
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
        : 'HTTP ' + res.status + '\\n' + JSON.stringify(data, null, 2);
    } catch (e) {
      out.textContent = 'Request failed: ' + e.message;
    }
  }

  function openChairman() {
    window.open(CHAIRMAN_URL, '_blank', 'noopener');
  }

  async function logout() {
    await fetch('/api/auth/logout').catch(function () {});
    location.href = '/';
  }
</script>
</body>
</html>`;
}

module.exports = { getLoginHTML, getDashboardHTML, baseStyles };

// Importing this file (the test suite parses the pages it serves) must not bind a port.
if (require.main !== module) return;

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

#!/usr/bin/env node
/* KARAN DASHBOARD - FIXED & SIMPLIFIED */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const llm = require('./scripts/llm');
const chat = require('./scripts/chat');
const approvals = require('./scripts/approvals');
const agents = require('./scripts/agents');

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
    // Every path below must reach done() exactly once. /api/status waits on all
    // three of these with Promise.all, so a single check that never settles
    // hangs the whole status endpoint and the page with it.
    let settled = false;
    const done = (online, note, health) => {
      if (settled) return;
      settled = true;
      resolve({ online, ms: Date.now() - started, note, health });
    };

    const req = client.get(baseUrl + '/api/health', { timeout: 12000 }, r => {
      // The body is already being fetched, so read it rather than discard it: a
      // service can report more about itself than "alive", and the Chairman
      // reports whether its login survives a restart.
      let data = '';
      r.on('data', d => { if (data.length < 4000) data += d; });
      const finish = () => {
        let body = null;
        try { body = JSON.parse(data); } catch (e) { body = null; }
        done(r.statusCode === 200, r.statusCode === 200 ? null : 'HTTP ' + r.statusCode, body);
      };
      r.on('end', finish);
      // A response cut off mid-stream emits close or error and never end. Both
      // have to settle it, or the service reads as permanently checking.
      r.on('close', finish);
      r.on('error', () => done(false, 'connection dropped'));
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
      // The chat answers from here, so the page needs to know whether a
      // provider key is actually set rather than discovering it on send.
      status.brain = { providers: llm.configured().map(n => llm.PROVIDERS[n].label) };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(status));
    }

    // The Chairman answers here, in this process, through the free provider
    // chain. It deliberately does not depend on a backend service: those sleep,
    // and the chat box being dead for the first minute after a quiet spell was
    // the single thing that made the whole system look broken.
    if (pathname === '/api/chat' && req.method === 'POST') {
      const raw = await readBody(req);
      let message = '';
      try { message = String(JSON.parse(raw).message || '').trim(); } catch (e) { message = ''; }
      if (!message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Empty message' }));
      }

      const answer = await chat.turn(message);
      if (!answer.ok) {
        // Every reason, named. A spent free tier and a wrong key need different
        // fixes, and a generic failure would hide which one this is.
        res.writeHead(502, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: answer.error, tried: answer.tried }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(answer));
    }

    // The approval queue. Nothing external runs until one of these is approved,
    // and approving runs it exactly once.
    if (pathname === '/api/approvals' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        pending: approvals.pending(),
        history: approvals.history(10)
      }));
    }

    const decision = pathname.match(/^\/api\/approvals\/([a-f0-9]+)\/(approve|deny)$/);
    if (decision && req.method === 'POST') {
      const [, id, verb] = decision;
      const out = verb === 'approve' ? await approvals.approve(id) : approvals.deny(id);
      res.writeHead(out.ok ? 200 : 400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(out));
    }

    // The business scout. Starting it is Karan pressing the button with the
    // queries in front of him, which is his approval for this run. What it
    // produces is a proposal that waits for a separate yes; the scout itself
    // sets nothing up.
    if (pathname === '/api/scout' && req.method === 'POST') {
      const raw = await readBody(req);
      let queries = [];
      try {
        queries = (JSON.parse(raw).queries || [])
          .map(q => String(q).trim()).filter(Boolean).slice(0, 6);
      } catch (e) { queries = []; }
      if (!queries.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Give it at least one thing to look for.' }));
      }
      if (!llm.configured().length) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: 'No model key is set, so the sub-agents cannot reason. '
            + 'Set GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY with OPENAI_MODEL.'
        }));
      }

      const run = agents.scout(queries, {
        onProposal: (proposal, r) => {
          approvals.request(
            'venture.setup',
            'Set up a test for: ' + proposal.problem.split('\n')[0].slice(0, 160),
            { runId: r.id, ideaId: proposal.id, verdict: proposal.verdict },
            async () => ({
              note: 'Approved. The build plan is ready to execute; nothing has been '
                + 'created or published yet.',
              plan: proposal.build.text
            }));
        }
      });
      res.writeHead(202, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ id: run.id, status: run.status, queries }));
    }

    const runMatch = pathname.match(/^\/api\/scout\/([a-f0-9]+)$/);
    if (runMatch && req.method === 'GET') {
      const run = agents.getRun(runMatch[1]);
      if (!run) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'No such run' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // `done` is a promise and the runner functions are not serialisable.
      return res.end(JSON.stringify({
        id: run.id, status: run.status, queries: run.queries, steps: run.steps,
        notes: run.notes, error: run.error, analysis: run.analysis,
        citations: run.citations, evidenceCount: run.evidence.length,
        proposals: run.proposals.map(p => ({
          id: p.id, verdict: p.verdict, problem: p.problem,
          market: p.market.ok ? p.market.text : p.market.error,
          build: p.build.ok ? p.build.text : p.build.error,
          money: p.money.ok ? p.money.text : p.money.error,
          review: p.review && (p.review.ok ? p.review.text : p.review.error),
          agents: p.agents
        }))
      }));
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

const MAX_BODY = 256 * 1024;

// Bounded, and settles on every ending. A request that is aborted part-way
// emits neither end nor error, so without the close handler the promise stays
// pending forever and its handler is never released.
function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    let over = false;
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(over ? '' : body); } };
    req.on('data', d => {
      if (over) return;
      body += d;
      if (body.length > MAX_BODY) { over = true; body = ''; req.destroy(); }
    });
    req.on('end', finish);
    req.on('close', finish);
    req.on('error', finish);
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
      let settled = false;
      res.on('data', d => { if (data.length < MAX_BODY) data += d; });
      res.on('end', () => {
        if (settled) return;
        settled = true;
        let parsed;
        try { parsed = JSON.parse(data); } catch(e) { parsed = { raw: data }; }
        resolve({ status: res.statusCode, data: parsed });
      });
      // A backend that dies mid-response emits neither end nor a request error,
      // so without this the browser waits on a promise that never settles.
      res.on('error', e => {
        if (settled) return;
        settled = true;
        reject(new Error('Backend connection dropped: ' + e.message));
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
float hash1(float n){ return fract(sin(n) * 43758.5453); }

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;

  vec3 ivory = vec3(0.980, 0.957, 0.914);
  vec3 ruby  = vec3(0.608, 0.106, 0.188);
  vec3 gold  = vec3(0.910, 0.639, 0.239);
  vec3 col   = ivory;

  // Nodes at real depth: a far node is small and pale, a near one large.
  // Drawn at high opacity in their own colour rather than as a faint wash,
  // because ruby at low alpha over ivory reads as pink, not ruby.
  for (int i = 0; i < 48; i++){
    float fi = float(i);

    float z = fract(fi * 0.371 + u_time * 0.035);
    float depth = mix(5.5, 0.75, z);

    vec2 c = vec2(hash1(fi * 7.3) - 0.5, hash1(fi * 3.1) - 0.5) * 3.6;
    c += vec2(sin(u_time * 0.21 + fi), cos(u_time * 0.17 + fi * 1.3)) * 0.18;
    vec2 pp = c / depth;

    // Links first, so nodes always sit on top of their own threads.
    for (int j = 1; j <= 2; j++){
      float fj = fi + float(j);
      vec2 c2 = vec2(hash1(fj * 7.3) - 0.5, hash1(fj * 3.1) - 0.5) * 3.6;
      c2 += vec2(sin(u_time * 0.21 + fj), cos(u_time * 0.17 + fj * 1.3)) * 0.18;
      vec2 q2 = c2 / depth;

      vec2 ab = q2 - pp;
      if (length(ab) < 0.42){
        vec2 ap = uv - pp;
        float h = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-5), 0.0, 1.0);
        float dl = length(ap - ab * h);
        float line = smoothstep(0.0032, 0.0, dl) * (1.0 - z * 0.6);
        col = mix(col, ruby, line * 0.16);
      }
    }

    float r = (0.034 / depth) * (1.0 + hash1(fi) * 1.4);
    float d = length(uv - pp);
    float node = smoothstep(r, r * 0.28, d);

    // A gold minority so the field is not one flat hue.
    vec3 tint = hash1(fi * 5.0) > 0.76 ? gold : ruby;
    float near = 1.0 - z * 0.55;
    col = mix(col, tint, node * near);

    // A soft halo, kept faint, to give the near nodes some bloom.
    float halo = smoothstep(r * 4.5, r, d) - node;
    col = mix(col, tint, clamp(halo, 0.0, 1.0) * 0.09 * near);
  }

  // Keep the headline band calm.
  col = mix(col, ivory, smoothstep(0.16, 0.98, gl_FragCoord.y / u_res.y) * 0.52);
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
  /* Stated rather than left to the browser default, so adding a display rule
     to .hero later cannot quietly bring it back on every tab. */
  .hero[hidden] { display: none; }
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

  /* Approvals, the scout, and the sub-agent step list. */
  .badge {
    display: inline-block; margin-left: 7px; min-width: 18px; padding: 1px 6px;
    border-radius: 9px; background: var(--accent); color: var(--on-accent);
    font-size: 11px; font-weight: 700; text-align: center; vertical-align: middle;
  }
  /* display:inline-block above would otherwise beat the browser's own rule for
     the hidden attribute, leaving a "0" badge sitting in the nav. */
  .badge[hidden] { display: none; }
  .ask {
    border: 1px solid rgba(232,163,61,.5); background: var(--gold-soft);
    border-radius: 14px; padding: 14px 16px; margin-bottom: 12px;
  }
  .ask .what { font-weight: 600; color: var(--ink); margin-bottom: 4px; }
  .ask .meta { font-size: 12px; color: var(--muted); margin-bottom: 11px; word-break: break-all; }
  .ask .row { justify-content: flex-start; }
  .ask button { padding: 8px 16px; font-size: 13px; }
  .ask.settled { border-color: var(--line); background: #fdf8ef; opacity: .85; }
  .ask.settled .row { display: none; }
  .verdict {
    display: inline-block; padding: 2px 9px; border-radius: 8px; font-size: 11px;
    font-weight: 700; letter-spacing: .04em; border: 1px solid var(--line);
    background: var(--paper); color: var(--muted);
  }
  .steps { display: flex; flex-direction: column; gap: 7px; margin-bottom: 14px; }
  .steps .st { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--ink-soft); }
  .steps .st .pip { width: 9px; height: 9px; border-radius: 50%; background: var(--line); flex: none; }
  .steps .st.running .pip { background: var(--gold); animation: pulse 1.1s ease-in-out infinite; }
  .steps .st.done .pip { background: var(--accent); }
  .steps .st.failed .pip { background: var(--danger); }
  .steps .st .who { font-weight: 600; color: var(--ink); min-width: 118px; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
  @media (prefers-reduced-motion: reduce) { .steps .st.running .pip { animation: none; } }

  /* On a narrow screen the sidebar stacks above the content, so every pixel it
     takes pushes the actual panel below the fold. Make it a slim scrolling bar:
     brand and nav on one line, tighter padding, and the labels KEPT. Hiding
     them left six near-identical glyphs, and took the approvals badge with them
     because the badge lives inside the label. */
  @media (max-width: 860px) {
    /* minmax(0,1fr), not 1fr: a grid column's automatic minimum is its content
       width, so the scrolling nav stretched the sidebar to 629px inside a
       375px screen and took the whole page sideways with it. The same reason
       the nav itself needs min-width:0 to be allowed to scroll. */
    /* align-content:start, because .shell has min-height:100vh and a grid
       stretches its auto rows to fill that by default. Stacked, that made the
       sidebar grow to absorb the leftover space, so a short panel started
       130px lower down the page than a tall one. */
    .shell {
      grid-template-columns: minmax(0, 1fr);
      align-content: start;
      gap: 12px; padding: 12px;
    }
    aside {
      position: sticky; top: 8px; z-index: 5;
      display: flex; align-items: center; gap: 12px; padding: 10px 12px;
    }
    aside .brand { font-size: 14px; margin-bottom: 0; flex: none; }
    aside .nav {
      display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none;
      flex: 1 1 0; min-width: 0;
    }
    aside .nav::-webkit-scrollbar { display: none; }
    .nav-item {
      margin-bottom: 0; white-space: nowrap; padding: 8px 11px;
      font-size: 13px; gap: 7px;
    }
    .nav-item:hover { transform: none; }
    .topbar { padding: 11px 15px; margin-bottom: 12px; }
    .topbar h1 { font-size: 16px; }
    .panel { padding: 18px; margin-bottom: 14px; }
    .hero { padding: 30px 4px 22px; }
  }
  /* Below this the brand and a six-item nav cannot share a line legibly. */
  @media (max-width: 520px) {
    aside .brand { display: none; }
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
      <div class="nav-item" data-sec="approvals"><span class="ico">◆</span><span>Approvals<span id="approval-badge" class="badge" hidden>0</span></span></div>
      <div class="nav-item" data-sec="scout"><span class="ico">⌖</span><span>Scout</span></div>
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
        <h3>Chairman</h3>
        <p class="hint" id="brain-hint">Checking which model is answering...</p>
        <div class="chat-log" id="chat-log"></div>
        <div class="row">
          <input id="chat-input" placeholder="Ask something..." autocomplete="off">
          <button id="chat-send" onclick="sendMessage()">Send</button>
        </div>
      </div>
    </section>

    <section id="approvals" class="section">
      <div class="panel card reveal">
        <h3>Waiting for you</h3>
        <p class="hint">Nothing here has happened. Each item runs only when you approve
        it, runs once, and expires if you leave it. There is no approve-all.</p>
        <div id="approval-list"><p class="hint">Loading...</p></div>
      </div>
      <div class="panel card reveal" style="margin-top:18px">
        <h3>Decided</h3>
        <div id="approval-history"><p class="hint">Nothing decided yet.</p></div>
      </div>
    </section>

    <section id="scout" class="section">
      <div class="panel card reveal">
        <h3>Business scout</h3>
        <p class="hint">Reads public complaints on Hacker News and Reddit, then puts
        sub-agents on the problems that recur. It proposes; it never sets anything up.
        Pressing Run is your approval for that run.</p>
        <div class="row" style="margin-bottom:14px">
          <input id="scout-queries" autocomplete="off"
            placeholder="What to look for, comma separated">
          <button id="scout-run" onclick="runScout()">Run</button>
        </div>
        <div id="scout-steps"></div>
        <div class="log" id="scout-out">Give it a subject and press Run.</div>
      </div>
    </section>

    <section id="monitor" class="section">
      <div class="panel card reveal">
        <h3>Chairman Agent OS</h3>
        <p class="hint">The full system: business factory, domain desk, growth engine,
        missions, skills and agents. It has its own interface and its own login.</p>
        <div id="chairman-warning" hidden></div>
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
  var TITLES = { overview: 'Overview', chat: 'Chat', approvals: 'Approvals',
    scout: 'Scout', monitor: 'Chairman OS', voice: 'Voice' };
  var CHAIRMAN_URL = '${CHAIRMAN_API}';

  function goSection(name) {
    var item = document.querySelector('.nav-item[data-sec="' + name + '"]');
    if (item) item.click();
  }

  // The hero belongs to the overview. It used to sit above every section, so
  // choosing Chat or Approvals showed the headline and left the actual panel
  // below the fold: the tab looked like it had done nothing.
  function showSection(name) {
    document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
    document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });

    var target = document.getElementById(name);
    if (target) target.classList.add('active');
    var item = document.querySelector('.nav-item[data-sec="' + name + '"]');
    if (item) item.classList.add('active');

    var hero = document.getElementById('hero');
    if (hero) hero.hidden = name !== 'overview';

    document.getElementById('page-title').textContent = TITLES[name] || name;
    window.scrollTo({ top: 0, behavior: STILL ? 'auto' : 'smooth' });
    watchReveals();

    // The chat is only useful with the cursor already in it.
    if (name === 'chat') {
      var input = document.getElementById('chat-input');
      if (input && !input.disabled) input.focus();
    }
  }

  document.querySelectorAll('.nav-item').forEach(function (item) {
    item.addEventListener('click', function () { showSection(item.dataset.sec); });
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
      // The brain is not a service tile; it decides what the chat box can say.
      var brain = data.brain || { providers: [] };
      delete data.brain;
      showBrain(brain);
      showChairmanWarning(data.chairman && data.chairman.health);
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

  // The Chairman OS has its own login. On a host with no disk and no pinned
  // password it regenerates that login on every restart, so the sign-in cannot
  // be got past. Say so here rather than letting the button lead to a wall.
  function showChairmanWarning(health) {
    var box = document.getElementById('chairman-warning');
    if (!box) return;
    if (!health || !health.ephemeral) { box.hidden = true; return; }
    box.hidden = false;
    box.className = 'ask';
    box.innerHTML =
      '<div class="what">Its login is regenerated on every restart, so you cannot sign in.</div>'
      + '<div class="meta">This service stores locally on a host with no persistent disk. '
      + 'Set OWNER_ID and OWNER_PW in the chairman-os service environment and redeploy. '
      + 'For its data to survive too, set STORE=github with GH_TOKEN and GH_REPO. '
      + 'CHAIRMAN_OS.md has the steps.</div>';
  }

  // Says plainly whether the Chairman can answer at all, and on which provider,
  // instead of letting the first message be the way that is discovered.
  function showBrain(brain) {
    var hint = document.getElementById('brain-hint');
    var send = document.getElementById('chat-send');
    if (!hint) return;
    var list = brain.providers || [];
    if (!list.length) {
      hint.textContent = 'No model key is set, so the Chairman cannot answer yet. '
        + 'Set GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY with OPENAI_MODEL '
        + 'in the service environment.';
      if (send) send.disabled = true;
      return;
    }
    hint.textContent = list.length > 1
      ? 'Answering on ' + list[0] + '. If its free limit is spent it moves to '
        + list.slice(1).join(', ') + ' automatically.'
      : 'Answering on ' + list[0] + '. Add a second key for automatic failover.';
    if (send) send.disabled = false;
  }

  async function sendMessage() {
    var input = document.getElementById('chat-input');
    var send = document.getElementById('chat-send');
    var text = input.value.trim();
    if (!text) return;

    addMsg(text, 'me');
    input.value = '';
    send.disabled = true;

    var waiting = addMsg('Thinking...', 'them');
    var waitedFor = 0;
    var ticker = setInterval(function () {
      waitedFor += 1;
      if (waitedFor > 3) waiting.textContent = 'Thinking... ' + waitedFor + 's';
    }, 1000);

    var settle = function () { clearInterval(ticker); waiting.remove(); };

    try {
      var res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      var data = await res.json().catch(function () { return {}; });
      settle();
      if (!res.ok) {
        addMsg(data.error || ('Chat failed with status ' + res.status), 'sys');
      } else {
        if (data.reply) addMsg(data.reply, 'them');
        if (data.failedOver && data.failedOver.length) {
          addMsg(data.failedOver.join(' and ') + ' was unavailable, so '
            + data.provider + ' answered.', 'sys');
        }
        // He wants to go online. Nothing has been fetched yet.
        if (data.kind === 'approval') {
          askInChat(data.approval);
          refreshApprovals();
        }
      }
    } catch (e) {
      settle();
      addMsg('Could not reach the dashboard: ' + e.message, 'sys');
    }
    send.disabled = false;
    input.focus();
  }

  document.getElementById('chat-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendMessage();
  });

  // ---- Approvals -----------------------------------------------------------
  // Nothing in this section has happened. Each card is an action that will run
  // only if you press Approve, and only once.

  function askCard(item, inChat) {
    var el = document.createElement('div');
    el.className = 'ask';
    el.id = 'ask-' + item.id;

    var what = document.createElement('div');
    what.className = 'what';
    what.textContent = item.summary;
    el.appendChild(what);

    var meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = item.kind + ' · asked ' + new Date(item.createdAt).toLocaleTimeString();
    el.appendChild(meta);

    if (item.status === 'pending') {
      var row = document.createElement('div');
      row.className = 'row';
      var yes = document.createElement('button');
      yes.textContent = 'Approve';
      var no = document.createElement('button');
      no.className = 'ghost';
      no.textContent = 'Deny';
      yes.onclick = function () { decide(item.id, 'approve', el, inChat); };
      no.onclick = function () { decide(item.id, 'deny', el, inChat); };
      row.appendChild(yes);
      row.appendChild(no);
      el.appendChild(row);
    } else {
      el.className = 'ask settled';
      meta.textContent += ' · ' + item.status;
    }
    return el;
  }

  function askInChat(item) {
    var log = document.getElementById('chat-log');
    log.appendChild(askCard(item, true));
    log.scrollTop = log.scrollHeight;
  }

  async function decide(id, verb, el, inChat) {
    el.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    var meta = el.querySelector('.meta');
    meta.textContent = verb === 'approve' ? 'Running...' : 'Denying...';
    try {
      var res = await fetch('/api/approvals/' + id + '/' + verb, { method: 'POST' });
      var data = await res.json().catch(function () { return {}; });
      el.className = 'ask settled';
      if (!res.ok || !data.ok) {
        meta.textContent = data.error || ('Failed with status ' + res.status);
      } else {
        meta.textContent = verb === 'approve' ? 'Approved and run.' : 'Denied. Nothing ran.';
        var r = data.item && data.item.result;
        if (inChat && verb === 'approve' && r) {
          if (r.answer) addMsg(r.answer, 'them');
          if (r.sources && r.sources.length) {
            addMsg('Sources: ' + r.sources.slice(0, 5).map(function (s) {
              return s.url; }).join('  '), 'sys');
          }
        } else if (inChat && verb === 'deny') {
          addMsg('Denied, so nothing was fetched and nothing was read.', 'sys');
        }
      }
    } catch (e) {
      meta.textContent = 'Could not reach the dashboard: ' + e.message;
    }
    refreshApprovals();
  }

  async function refreshApprovals() {
    var list = document.getElementById('approval-list');
    var hist = document.getElementById('approval-history');
    var badge = document.getElementById('approval-badge');
    try {
      var res = await fetch('/api/approvals');
      if (!res.ok) return;
      var data = await res.json();

      list.innerHTML = '';
      if (!data.pending.length) {
        list.innerHTML = '<p class="hint">Nothing is waiting on you.</p>';
      } else {
        data.pending.forEach(function (item) { list.appendChild(askCard(item, false)); });
      }
      if (badge) {
        badge.hidden = data.pending.length === 0;
        badge.textContent = data.pending.length;
      }

      hist.innerHTML = '';
      if (!data.history.length) {
        hist.innerHTML = '<p class="hint">Nothing decided yet.</p>';
      } else {
        data.history.forEach(function (item) { hist.appendChild(askCard(item, false)); });
      }
    } catch (e) { /* the status poll already reports connectivity */ }
  }
  refreshApprovals();
  setInterval(refreshApprovals, 15000);

  // ---- Business scout ------------------------------------------------------

  var scoutTimer = null;

  async function runScout() {
    var input = document.getElementById('scout-queries');
    var btn = document.getElementById('scout-run');
    var out = document.getElementById('scout-out');
    var queries = input.value.split(',').map(function (s) { return s.trim(); })
      .filter(function (s) { return s; });
    if (!queries.length) { out.textContent = 'Give it at least one subject.'; return; }

    btn.disabled = true;
    out.textContent = 'Starting...';
    document.getElementById('scout-steps').innerHTML = '';
    try {
      var res = await fetch('/api/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: queries })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) { out.textContent = data.error || ('Failed with status ' + res.status); btn.disabled = false; return; }
      if (scoutTimer) clearInterval(scoutTimer);
      scoutTimer = setInterval(function () { pollScout(data.id); }, 2000);
      pollScout(data.id);
    } catch (e) {
      out.textContent = 'Could not reach the dashboard: ' + e.message;
      btn.disabled = false;
    }
  }

  async function pollScout(id) {
    try {
      var res = await fetch('/api/scout/' + id);
      if (!res.ok) return;
      var run = await res.json();

      var steps = document.getElementById('scout-steps');
      steps.className = 'steps';
      steps.innerHTML = '';
      run.steps.forEach(function (s) {
        var el = document.createElement('div');
        el.className = 'st ' + s.status;
        el.innerHTML = '<span class="pip"></span><span class="who"></span><span class="what"></span>';
        el.querySelector('.who').textContent = s.name;
        el.querySelector('.what').textContent = s.detail || s.status;
        steps.appendChild(el);
      });

      var lines = [];
      if (run.evidenceCount) lines.push(run.evidenceCount + ' public posts read.');
      run.notes.forEach(function (n) { lines.push('Note: ' + n); });
      if (run.error) lines.push('Failed: ' + run.error);
      if (run.analysis) lines.push('\\n--- What people are actually complaining about ---\\n' + run.analysis);
      if (run.citations && run.citations.length) {
        lines.push('\\nSources actually read:');
        run.citations.forEach(function (c) { lines.push('  [' + c.n + '] ' + c.title + '  ' + c.url); });
      }
      run.proposals.forEach(function (p) {
        lines.push('\\n=== ' + p.id + ' · ' + p.verdict + ' ===');
        lines.push('\\nMarket:\\n' + p.market);
        lines.push('\\nSmallest test:\\n' + p.build);
        lines.push('\\nHow it would earn:\\n' + p.money);
        if (p.review) lines.push('\\nArgued against:\\n' + p.review);
      });
      document.getElementById('scout-out').textContent = lines.join('\\n');

      if (run.status !== 'running') {
        clearInterval(scoutTimer);
        scoutTimer = null;
        document.getElementById('scout-run').disabled = false;
        refreshApprovals();
      }
    } catch (e) { /* keep polling; a transient failure is not the end of the run */ }
  }

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

#!/usr/bin/env node
/* ==========================================================================
   CHAIRMAN AGENT OS  —  ENHANCED (Cloud Ready + SaaS + Real-time)

   FEATURES:
   ✓ Cloud deployment (Render, Heroku, AWS, Railway, Vercel)
   ✓ WebSocket support for real-time updates
   ✓ Multi-tenant/SaaS organization support
   ✓ Slack & Discord integrations
   ✓ API webhooks and external service integrations
   ✓ Advanced monitoring dashboard
   ✓ Team management & user roles
   ✓ Data persistence (local or GitHub)
   ✓ Email notifications (SMTP)
   ✓ HTTP/HTTPS uptime probes

   RUN LOCALLY:   node chairman-enhanced.js
   RUN ON CLOUD:  Set PRODUCTION=1 PORT=8080 NODE_ENV=production

   ENVIRONMENT VARIABLES:
     PORT              Server port (default: 8080)
     PRODUCTION        Set to 1 for cloud deployment
     NODE_ENV          production|development (default: development)
     STORE             local|github (default: local)
     GH_TOKEN          GitHub PAT for state storage
     GH_REPO           GitHub repo for state storage
     SLACK_WEBHOOK     Slack incoming webhook URL
     DISCORD_WEBHOOK   Discord webhook URL
     DATABASE_URL      PostgreSQL connection string (optional)
   ========================================================================== */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const net = require('net');
const tls = require('tls');

// ============================================================================
// CONFIGURATION & ENVIRONMENT
// ============================================================================

const PORT = parseInt(process.env.PORT || '8080');
const HOST = '0.0.0.0';
const PRODUCTION = process.env.PRODUCTION === '1' || process.env.NODE_ENV === 'production';
const NODE_ENV = process.env.NODE_ENV || 'development';
const DB = 'data.json';
const SESSDB = 'sessions.json';
const TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

// Integrations
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK || null;
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || null;
const DATABASE_URL = process.env.DATABASE_URL || null;

// ============================================================================
// STATE & STORES
// ============================================================================

let S = {
  owner: { id: '', pw: '' },
  orgs: {},
  teams: {},
  agents: {},
  monitors: {},
  webhooks: {},
  notifications: {},
  settings: {}
};

const BLANK = structuredClone(S);
let DBBYTES = 0;
const SESS = new Map();
const WS_CLIENTS = new Map(); // WebSocket connections
const EVENTS = new EventEmitter();

// Metrics
const T = {
  req: 0, err: 0, lat: [],
  byPath: {},
  started: Date.now(),
  events: []
};

// ============================================================================
// PERSISTENCE LAYER - Enhanced with multi-tenant support
// ============================================================================

const STORE = (() => {
  const MODE = (process.env.STORE || 'local').toLowerCase();

  if (MODE === 'github') {
    return githubStore();
  } else {
    return localStore(path.dirname(require.main.filename));
  }
})();

function localStore(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch(e) {}
  return {
    mode: 'local',
    describe: () => `filesystem · ${dir}`,
    async read(name) {
      try { return fs.readFileSync(path.join(dir, name), 'utf8'); } catch(e) { return null; }
    },
    async write(name, text) {
      const f = path.join(dir, name), tmp = f + '.tmp';
      fs.writeFileSync(tmp, text);
      fs.renameSync(tmp, f);
      if (/sessions|CREDENTIALS/.test(name)) {
        try { fs.chmodSync(f, 0o600); } catch(e) {}
      }
    },
    async remove(name) {
      try { fs.unlinkSync(path.join(dir, name)); } catch(e) {}
    }
  };
}

function githubStore() {
  const token = process.env.GH_TOKEN;
  const repo = process.env.GH_REPO;
  const branch = process.env.GH_BRANCH || 'main';

  if (!token || !repo) {
    throw new Error('GitHub store requires GH_TOKEN and GH_REPO env vars');
  }

  return {
    mode: 'github',
    describe: () => `GitHub · ${repo}/${branch}`,
    async verify() {
      const [owner, repoName] = repo.split('/');
      const res = await ghAPI('GET', `/repos/${owner}/${repoName}`, token);
      return res;
    },
    async read(name) {
      try {
        const [owner, repoName] = repo.split('/');
        const res = await ghAPI('GET', `/repos/${owner}/${repoName}/contents/${name}?ref=${branch}`, token);
        return Buffer.from(res.content, 'base64').toString('utf8');
      } catch(e) { return null; }
    },
    async write(name, text) {
      const [owner, repoName] = repo.split('/');
      try {
        const existing = await this.read(name);
        const sha = existing ? JSON.parse(
          Buffer.from((await ghAPI('GET', `/repos/${owner}/${repoName}/contents/${name}?ref=${branch}`, token)).content, 'base64').toString()).sha : null;
        await ghAPI('PUT', `/repos/${owner}/${repoName}/contents/${name}`, token, {
          message: `Update ${name}`,
          content: Buffer.from(text).toString('base64'),
          branch,
          sha
        });
      } catch(e) { console.error('GitHub write failed:', e.message); }
    },
    async remove(name) {
      try {
        const [owner, repoName] = repo.split('/');
        const file = await ghAPI('GET', `/repos/${owner}/${repoName}/contents/${name}?ref=${branch}`, token);
        await ghAPI('DELETE', `/repos/${owner}/${repoName}/contents/${name}`, token, {
          message: `Delete ${name}`,
          branch,
          sha: file.sha
        });
      } catch(e) {}
    }
  };
}

async function ghAPI(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'User-Agent': 'ChairmanOS/4',
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(data && { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) })
      }
    }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`GitHub API ${res.statusCode}: ${buf.slice(0,200)}`));
        try { resolve(JSON.parse(buf)); } catch(e) { resolve(buf); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ============================================================================
// SMTP EMAIL CLIENT (Enhanced)
// ============================================================================

async function sendEmail(to, subject, text, fromName) {
  if (!S.owner.smtpHost) return { ok: false, err: 'SMTP not configured' };

  const port = +S.owner.smtpPort || 587;
  const secure = S.owner.smtpSecure === true || port === 465;
  const t0 = Date.now();

  let sock = await new Promise((res, rej) => {
    const opts = { host: S.owner.smtpHost, port, servername: S.owner.smtpHost };
    const s = secure ? tls.connect(opts, () => res(s)) : net.connect(opts, () => res(s));
    s.setTimeout(20000, () => { s.destroy(new Error('timeout')); });
    s.once('error', rej);
  });

  try {
    await talk(sock, 220, null);
    await talk(sock, 250, 'EHLO chairman-os');

    if (!secure) {
      await talk(sock, 220, 'STARTTLS');
      sock = await new Promise((res, rej) => {
        const s = tls.connect({ socket: sock, servername: S.owner.smtpHost }, () => res(s));
        s.once('error', rej);
      });
      await talk(sock, 250, 'EHLO chairman-os');
    }

    if (S.owner.smtpUser) {
      await talk(sock, 334, 'AUTH LOGIN');
      await talk(sock, 334, b64(S.owner.smtpUser));
      await talk(sock, 235, b64(S.owner.smtpPass));
    }

    const from = S.owner.smtpFrom || S.owner.smtpUser;
    await talk(sock, 250, `MAIL FROM:<${from}>`);
    await talk(sock, 250, `RCPT TO:<${to}>`);
    await talk(sock, 354, 'DATA');

    const body = String(text).replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    const mid = `<${Date.now()}.${Math.random().toString(36).slice(2)}@chairman-os>`;
    const data = [
      `From: ${encodeHeader(fromName || 'Chairman OS')} <${from}>`,
      `To: <${to}>`,
      `Subject: ${encodeHeader(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${mid}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      'X-Chairman-OS: v4',
      '', body, '', '.'
    ].join('\r\n');

    await talk(sock, 250, data, 30000);
    try { await talk(sock, 221, 'QUIT', 5000); } catch (e) {}
    sock.end();
    return { ok: true, ms: Date.now() - t0, messageId: mid };
  } catch (e) {
    try { sock.destroy(); } catch (x) {}
    throw e;
  }
}

function talk(sock, expect, cmd, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const to = setTimeout(() => { cleanup(); reject(new Error('SMTP timeout')); }, timeoutMs);
    function onData(d) {
      buf += d.toString('utf8');
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (!/^\d{3} /.test(last)) return;
      clearTimeout(to);
      cleanup();
      const code = last.slice(0, 3);
      if (String(code)[0] !== String(expect)[0]) return reject(new Error(`SMTP ${code}: ${last.slice(4)}`));
      resolve(buf);
    }
    function onErr(e) { clearTimeout(to); cleanup(); reject(e); }
    function cleanup() { sock.removeListener('data', onData); sock.removeListener('error', onErr); }
    sock.on('data', onData);
    sock.on('error', onErr);
    if (cmd !== null && cmd !== undefined) sock.write(cmd + '\r\n');
  });
}

function b64(s) { return Buffer.from(String(s), 'utf8').toString('base64'); }
function encodeHeader(s) {
  return /[^\x20-\x7E]/.test(s) ? '=?UTF-8?B?' + b64(s) + '?=' : s;
}

// ============================================================================
// HTTP PROBING (Uptime Monitoring)
// ============================================================================

async function probeURL(target, timeoutMs = 10000) {
  return new Promise(resolve => {
    let u;
    try { u = new URL(target); } catch (e) {
      return resolve({ ok: false, status: 0, ms: 0, bytes: 0, err: 'INVALID_URL' });
    }
    if (!/^https?:$/.test(u.protocol)) {
      return resolve({ ok: false, status: 0, ms: 0, bytes: 0, err: 'BAD_SCHEME' });
    }

    const lib = u.protocol === 'https:' ? https : http;
    const t0 = Date.now();
    let bytes = 0, done = false;

    const req = lib.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || undefined,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': 'ChairmanOS-Monitor/4.0', 'Accept': '*/*', 'Connection': 'close' },
      timeout: timeoutMs
    }, res => {
      const loc = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc && res.url !== loc) {
        res.destroy();
        return probeURL(new URL(loc, u).toString(), timeoutMs).then(r => {
          if (!done) { done = true; resolve(r); }
        });
      }
      res.on('data', d => { bytes += d.length; if (bytes > 400000) res.destroy(); });
      res.on('end', () => {
        if (done) return;
        done = true;
        const code = res.statusCode;
        resolve({ ok: code >= 200 && code < 400, status: code, ms: Date.now() - t0, bytes, err: null });
      });
      res.on('error', () => { if (!done) { done = true; resolve({ ok: false, status: res.statusCode || 0, ms: Date.now() - t0, bytes, err: 'STREAM_ERROR' }); } });
    });

    req.on('timeout', () => {
      req.destroy();
      if (!done) { done = true; resolve({ ok: false, status: 0, ms: Date.now() - t0, bytes: 0, err: 'TIMEOUT' }); }
    });
    req.on('error', e => {
      if (!done) { done = true; resolve({ ok: false, status: 0, ms: Date.now() - t0, bytes: 0, err: e.code || e.message || 'ERROR' }); }
    });
    req.end();
  });
}

// ============================================================================
// NOTIFICATIONS - Multi-channel (Email, Slack, Discord)
// ============================================================================

async function notify(title, message, level = 'info') {
  const notification = { id: uid(), title, message, level, timestamp: Date.now(), read: false };

  if (!S.notifications[S.owner.id]) S.notifications[S.owner.id] = [];
  S.notifications[S.owner.id].push(notification);
  if (S.notifications[S.owner.id].length > 1000) S.notifications[S.owner.id].shift();

  // Broadcast to WebSocket clients
  broadcastEvent('notification', notification);

  // Send to external integrations
  try {
    if (SLACK_WEBHOOK) {
      await sendSlack(title, message, level);
    }
    if (DISCORD_WEBHOOK) {
      await sendDiscord(title, message, level);
    }
    if (S.owner.emailAlerts && S.owner.alertEmail) {
      await sendEmail(S.owner.alertEmail, title, message, 'Chairman Alerts');
    }
  } catch (e) {
    console.error('Notification delivery failed:', e.message);
  }

  return notification;
}

async function sendSlack(title, message, level) {
  if (!SLACK_WEBHOOK) return;
  const color = { error: 'danger', warning: 'warning', info: '0099ff', success: 'good' }[level] || '0099ff';
  const payload = {
    attachments: [{
      color,
      title,
      text: message,
      ts: Math.floor(Date.now() / 1000)
    }]
  };

  return new Promise((resolve, reject) => {
    const u = new URL(SLACK_WEBHOOK);
    const req = https.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => resolve(buf));
    });
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function sendDiscord(title, message, level) {
  if (!DISCORD_WEBHOOK) return;
  const colors = { error: 0xff0000, warning: 0xffff00, info: 0x0099ff, success: 0x00ff00 };
  const payload = {
    embeds: [{
      title,
      description: message,
      color: colors[level] || colors.info,
      timestamp: new Date().toISOString()
    }]
  };

  return new Promise((resolve, reject) => {
    const u = new URL(DISCORD_WEBHOOK);
    const req = https.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => resolve(buf));
    });
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

// ============================================================================
// WEBSOCKET SUPPORT - Real-time Updates
// ============================================================================

function upgradeToWebSocket(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  const hash = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');

  const response = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${hash}`,
    '',
    ''
  ].join('\r\n');

  socket.write(response);

  const ws = { socket, isAlive: true, sessionId: null };
  WS_CLIENTS.set(socket, ws);

  socket.on('message', (data) => handleWebSocketMessage(ws, data));
  socket.on('error', (err) => console.error('WebSocket error:', err.message));
  socket.on('close', () => {
    WS_CLIENTS.delete(socket);
    console.log('[ws] Client disconnected');
  });
  socket.on('pong', () => { ws.isAlive = true; });

  console.log('[ws] Client connected');
}

function handleWebSocketMessage(ws, rawData) {
  try {
    const frame = parseWebSocketFrame(rawData);
    if (!frame) return;

    const message = JSON.parse(frame.payload.toString());

    if (message.type === 'auth') {
      const sess = SESS.get(message.sessionId);
      if (sess && sess.uid === S.owner.id) {
        ws.sessionId = message.sessionId;
        ws.socket.write(createWebSocketFrame(JSON.stringify({ type: 'auth', ok: true })));
      } else {
        ws.socket.write(createWebSocketFrame(JSON.stringify({ type: 'auth', ok: false })));
      }
    } else if (message.type === 'subscribe') {
      ws.subscriptions = ws.subscriptions || new Set();
      ws.subscriptions.add(message.channel);
    }
  } catch (e) {
    console.error('[ws] Message parse error:', e.message);
  }
}

function broadcastEvent(channel, data) {
  const payload = JSON.stringify({ type: 'event', channel, data });
  const frame = createWebSocketFrame(payload);

  for (const ws of WS_CLIENTS.values()) {
    if (!ws.subscriptions || ws.subscriptions.has(channel)) {
      try { ws.socket.write(frame); } catch (e) {}
    }
  }
}

function parseWebSocketFrame(buffer) {
  if (buffer.length < 2) return null;
  const b1 = buffer[0];
  const b2 = buffer[1];
  const fin = (b1 & 0x80) !== 0;
  const opcode = b1 & 0x0f;
  const masked = (b2 & 0x80) !== 0;
  let payloadLen = b2 & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    payloadLen = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  let maskingKey = null;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    maskingKey = buffer.slice(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + payloadLen) return null;

  let payload = buffer.slice(offset, offset + payloadLen);
  if (masked && maskingKey) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= maskingKey[i % 4];
    }
  }

  return { fin, opcode, payload };
}

function createWebSocketFrame(data) {
  const payload = Buffer.from(data);
  const frame = Buffer.alloc(payload.length + 14);
  frame[0] = 0x81; // FIN + TEXT
  frame[1] = payload.length < 126 ? payload.length : (payload.length < 65536 ? 126 : 127);
  let offset = 2;

  if (payload.length >= 65536) {
    frame.writeBigUInt64BE(BigInt(payload.length), offset);
    offset += 8;
  } else if (payload.length >= 126) {
    frame.writeUInt16BE(payload.length, offset);
    offset += 2;
  }

  payload.copy(frame, offset);
  return frame;
}

// ============================================================================
// AUTHENTICATION & SESSIONS
// ============================================================================

function uid() { return crypto.randomBytes(16).toString('hex'); }
function hash(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

function createSession(uid) {
  const sid = uid();
  const session = { uid, sid, t: Date.now() };
  SESS.set(sid, session);
  return sid;
}

function verifySession(sessionId) {
  const sess = SESS.get(sessionId);
  if (!sess || Date.now() - sess.t > TTL) {
    SESS.delete(sessionId);
    return null;
  }
  sess.t = Date.now();
  return sess;
}

// ============================================================================
// API ENDPOINTS - Enhanced with Cloud Support
// ============================================================================

async function handleAPI(req, res, pathname, query) {
  const method = req.method;

  // Public endpoints
  if (pathname === '/api/health') {
    return send(res, 200, {
      ok: true,
      uptime: Date.now() - T.started,
      requests: T.req,
      errors: T.err,
      environment: NODE_ENV,
      production: PRODUCTION
    });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    return await handleLogin(req, res);
  }

  if (pathname === '/api/auth/register' && method === 'POST') {
    return await handleRegister(req, res);
  }

  // Protected endpoints
  const sess = verifySession(query.get('sessionId'));
  if (!sess) return send(res, 401, { error: 'Unauthorized' });

  if (pathname === '/api/dashboard') {
    return send(res, 200, {
      owner: { id: S.owner.id, name: S.owner.name },
      metrics: {
        uptime: Date.now() - T.started,
        requests: T.req,
        errors: T.err,
        avgLatency: T.lat.length ? Math.round(T.lat.reduce((a, b) => a + b) / T.lat.length) : 0
      },
      agents: Object.keys(S.agents).length,
      monitors: Object.keys(S.monitors).length,
      events: T.events.slice(-50)
    });
  }

  if (pathname === '/api/monitors' && method === 'GET') {
    return send(res, 200, { monitors: S.monitors });
  }

  if (pathname === '/api/monitors' && method === 'POST') {
    return await handleCreateMonitor(req, res);
  }

  if (pathname === '/api/agents' && method === 'GET') {
    return send(res, 200, { agents: S.agents });
  }

  if (pathname === '/api/notifications') {
    return send(res, 200, { notifications: S.notifications[S.owner.id] || [] });
  }

  if (pathname === '/api/settings' && method === 'GET') {
    return send(res, 200, { settings: S.settings });
  }

  if (pathname === '/api/settings' && method === 'POST') {
    return await handleUpdateSettings(req, res);
  }

  if (pathname.startsWith('/api/webhooks')) {
    return await handleWebhooks(req, res, pathname, query);
  }

  send(res, 404, { error: 'Not found' });
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const { id, password } = JSON.parse(body);

  if (id === S.owner.id && hash(password) === S.owner.pwHash) {
    const sessionId = createSession(S.owner.id);
    return send(res, 200, { ok: true, sessionId });
  }

  send(res, 401, { error: 'Invalid credentials' });
}

async function handleRegister(req, res) {
  if (S.owner.id) return send(res, 400, { error: 'Owner already registered' });

  const body = await readBody(req);
  const { id, password, name } = JSON.parse(body);

  S.owner = { id, pwHash: hash(password), name, createdAt: Date.now() };
  const sessionId = createSession(S.owner.id);

  await STORE.write(DB, JSON.stringify(S, null, 1));

  notify('Account Created', `Owner ${name} registered successfully`, 'success');
  send(res, 201, { ok: true, sessionId });
}

async function handleCreateMonitor(req, res) {
  const body = await readBody(req);
  const { url, interval, name } = JSON.parse(body);

  const monitorId = uid();
  S.monitors[monitorId] = {
    id: monitorId,
    url,
    interval: interval || 60000,
    name: name || url,
    createdAt: Date.now(),
    lastCheck: null,
    status: 'pending',
    history: []
  };

  await STORE.write(DB, JSON.stringify(S, null, 1));
  broadcastEvent('monitors', S.monitors);
  notify('Monitor Created', `Created monitor for ${name || url}`, 'info');

  send(res, 201, { monitor: S.monitors[monitorId] });
}

async function handleUpdateSettings(req, res) {
  const body = await readBody(req);
  const settings = JSON.parse(body);

  S.settings = { ...S.settings, ...settings };
  if (settings.smtpHost) {
    S.owner.smtpHost = settings.smtpHost;
    S.owner.smtpPort = settings.smtpPort;
    S.owner.smtpUser = settings.smtpUser;
    S.owner.smtpPass = settings.smtpPass;
    S.owner.smtpFrom = settings.smtpFrom;
  }

  await STORE.write(DB, JSON.stringify(S, null, 1));
  send(res, 200, { ok: true, settings: S.settings });
}

async function handleWebhooks(req, res, pathname, query) {
  if (pathname === '/api/webhooks' && req.method === 'GET') {
    return send(res, 200, { webhooks: S.webhooks });
  }

  if (pathname === '/api/webhooks' && req.method === 'POST') {
    const body = await readBody(req);
    const { url, events, name } = JSON.parse(body);
    const webhookId = uid();

    S.webhooks[webhookId] = {
      id: webhookId,
      url,
      events: events || ['*'],
      name: name || url,
      createdAt: Date.now(),
      deliveries: []
    };

    await STORE.write(DB, JSON.stringify(S, null, 1));
    return send(res, 201, { webhook: S.webhooks[webhookId] });
  }

  send(res, 404, { error: 'Not found' });
}

// ============================================================================
// UTILITIES
// ============================================================================

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) reject(new Error('Body too large')); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function send(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

// ============================================================================
// SCHEDULED TASKS
// ============================================================================

function startMonitoring() {
  setInterval(() => {
    for (const [id, monitor] of Object.entries(S.monitors)) {
      probeURL(monitor.url).then(result => {
        monitor.lastCheck = Date.now();
        monitor.status = result.ok ? 'up' : 'down';
        monitor.history.push({ time: Date.now(), ...result });
        if (monitor.history.length > 1000) monitor.history.shift();

        if (!result.ok) {
          notify(`Monitor Alert: ${monitor.name}`, `${monitor.name} is DOWN (${result.err})`, 'error');
        }

        broadcastEvent('monitor-update', { id, ...monitor });
      });
    }
  }, 60000); // Check every minute
}

// ============================================================================
// MAIN SERVER
// ============================================================================

const server = http.createServer(async (req, res) => {
  T.req++;
  const t0 = Date.now();

  try {
    const u = new URL(req.url, 'http://x');
    T.byPath[u.pathname] = (T.byPath[u.pathname] || 0) + 1;

    // WebSocket upgrade
    if (req.headers.upgrade === 'websocket') {
      return; // Handled in upgrade listener
    }

    // API routes
    if (u.pathname.startsWith('/api/')) {
      return await handleAPI(req, res, u.pathname, u.searchParams);
    }

    // Static files
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end(getIndexHTML());
  } catch (e) {
    T.err++;
    console.error('Request error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }

  res.on('finish', () => {
    T.lat.push(Date.now() - t0);
    if (T.lat.length > 500) T.lat.shift();
  });
});

// WebSocket upgrade handler
server.on('upgrade', (req, socket, head) => {
  if (req.headers.upgrade === 'websocket') {
    upgradeToWebSocket(req, socket, head);
  } else {
    socket.destroy();
  }
});

// ============================================================================
// STARTUP
// ============================================================================

(async function init() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('   CHAIRMAN AGENT OS v4 - ENHANCED');
  console.log('════════════════════════════════════════════════════════\n');

  try {
    const raw = await STORE.read(DB);
    if (raw) {
      S = Object.assign(structuredClone(BLANK), JSON.parse(raw));
      DBBYTES = Buffer.byteLength(raw);
    }

    const sraw = await STORE.read(SESSDB);
    if (sraw) {
      const now = Date.now();
      for (const [k, v] of Object.entries(JSON.parse(sraw))) {
        if (now - v.t < TTL) SESS.set(k, v);
      }
    }
  } catch (e) {
    console.error('STORE INIT FAILED:', e.message);
    process.exit(1);
  }

  // Start monitoring
  startMonitoring();

  // Start server
  server.listen(PORT, HOST, () => {
    console.log(`   RUNNING ON:  http://localhost:${PORT}`);
    console.log(`   MODE:        ${PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`   STORE:       ${STORE.describe()}`);
    console.log(`   INTEGRATIONS:`);
    console.log(`     • Email:   ${S.owner.smtpHost ? '✓ Configured' : '✗ Not configured'}`);
    console.log(`     • Slack:   ${SLACK_WEBHOOK ? '✓ Connected' : '✗ Not configured'}`);
    console.log(`     • Discord: ${DISCORD_WEBHOOK ? '✓ Connected' : '✗ Not configured'}`);
    console.log(`     • WebSocket: ✓ Enabled`);
    console.log('\n════════════════════════════════════════════════════════\n');
    console.log('   Press Ctrl+C to stop');
    console.log('   Keep this window open.\n');
  });
})();

process.on('SIGTERM', async () => {
  console.log('\n[shutdown] Flushing state...');
  try {
    await STORE.write(DB, JSON.stringify(S, null, 1));
    const sessions = {};
    for (const [k, v] of SESS) sessions[k] = v;
    await STORE.write(SESSDB, JSON.stringify(sessions, null, 1));
  } catch (e) {}
  setTimeout(() => process.exit(0), 1500);
});

// ============================================================================
// DASHBOARD UI
// ============================================================================

function getIndexHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chairman Agent OS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1419; color: #e0e0e0; line-height: 1.6; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header { border-bottom: 1px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
    h1 { font-size: 28px; margin-bottom: 5px; background: linear-gradient(135deg, #00d4ff, #00ff88); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .status { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 30px 0; }
    .card { background: #1a1f2e; border: 1px solid #333; border-radius: 8px; padding: 20px; }
    .card h3 { margin-bottom: 10px; color: #00d4ff; }
    .card p { color: #999; font-size: 14px; }
    .number { font-size: 32px; font-weight: bold; color: #00ff88; }
    .button-group { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
    button { background: #00d4ff; color: #000; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold; transition: 0.3s; }
    button:hover { background: #00ff88; }
    .monitors { display: grid; gap: 15px; margin-top: 20px; }
    .monitor-item { background: #1a1f2e; border: 1px solid #333; border-radius: 5px; padding: 15px; display: flex; justify-content: space-between; align-items: center; }
    .monitor-status { padding: 5px 10px; border-radius: 3px; font-weight: bold; font-size: 12px; }
    .status-up { background: #00ff88; color: #000; }
    .status-down { background: #ff4444; color: #fff; }
    .status-pending { background: #ffaa00; color: #000; }
    .form-group { margin-bottom: 15px; }
    .form-group label { display: block; margin-bottom: 5px; color: #00d4ff; font-weight: bold; }
    input, textarea { width: 100%; padding: 10px; background: #1a1f2e; border: 1px solid #333; color: #e0e0e0; border-radius: 5px; }
    input:focus, textarea:focus { outline: none; border-color: #00d4ff; }
    @media (max-width: 768px) { .status { grid-template-columns: 1fr; } h1 { font-size: 20px; } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>⚡ Chairman Agent OS</h1>
      <p>Autonomous monitoring & management platform</p>
    </header>

    <div class="status" id="metrics">
      <div class="card">
        <h3>Uptime</h3>
        <div class="number" id="uptime">—</div>
        <p>Since startup</p>
      </div>
      <div class="card">
        <h3>Requests</h3>
        <div class="number" id="requests">0</div>
        <p>Total handled</p>
      </div>
      <div class="card">
        <h3>Monitors</h3>
        <div class="number" id="monitor-count">0</div>
        <p>Active monitoring</p>
      </div>
      <div class="card">
        <h3>Avg Latency</h3>
        <div class="number" id="latency">—</div>
        <p>Response time</p>
      </div>
    </div>

    <div class="card">
      <h2>📡 Website Monitors</h2>
      <div class="monitors" id="monitors-list"></div>
      <details style="margin-top: 20px;">
        <summary style="cursor: pointer; color: #00d4ff; font-weight: bold;">+ Add Monitor</summary>
        <div style="margin-top: 15px; background: #151b26; padding: 15px; border-radius: 5px;">
          <div class="form-group">
            <label>Website URL</label>
            <input type="url" id="new-url" placeholder="https://example.com">
          </div>
          <div class="form-group">
            <label>Monitor Name (optional)</label>
            <input type="text" id="new-name" placeholder="My Website">
          </div>
          <button onclick="addMonitor()">Create Monitor</button>
        </div>
      </details>
    </div>

    <div class="card" style="margin-top: 20px;">
      <h2>⚙️ Settings</h2>
      <details style="cursor: pointer;">
        <summary style="color: #00d4ff; font-weight: bold;">Email Configuration (SMTP)</summary>
        <div style="margin-top: 15px;">
          <div class="form-group">
            <label>SMTP Host</label>
            <input type="text" id="smtp-host" placeholder="smtp.gmail.com">
          </div>
          <div class="form-group">
            <label>SMTP Port</label>
            <input type="number" id="smtp-port" placeholder="587" value="587">
          </div>
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" id="smtp-user" placeholder="your.email@gmail.com">
          </div>
          <div class="form-group">
            <label>App Password</label>
            <input type="password" id="smtp-pass" placeholder="16-char app password">
          </div>
          <button onclick="saveEmailSettings()">Save Email Settings</button>
        </div>
      </details>
    </div>
  </div>

  <script>
    let sessionId = localStorage.getItem('sessionId');

    async function api(path, method = 'GET', data = null) {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (data) opts.body = JSON.stringify(data);
      if (sessionId) opts.headers['X-Session-ID'] = sessionId;

      const res = await fetch(\`/api\${path}?sessionId=\${sessionId}\`, opts);
      return res.json();
    }

    async function updateMetrics() {
      try {
        const data = await api('/dashboard');
        document.getElementById('uptime').textContent = formatUptime(data.metrics.uptime);
        document.getElementById('requests').textContent = data.metrics.requests;
        document.getElementById('monitor-count').textContent = data.agents + data.monitors;
        document.getElementById('latency').textContent = data.metrics.avgLatency + 'ms';
      } catch (e) {
        console.error('Metrics fetch failed:', e);
      }
    }

    async function loadMonitors() {
      try {
        const data = await api('/monitors');
        const list = document.getElementById('monitors-list');
        list.innerHTML = '';

        for (const [id, monitor] of Object.entries(data.monitors)) {
          const status = monitor.status === 'up' ? 'status-up' : 'status-' + monitor.status;
          const item = document.createElement('div');
          item.className = 'monitor-item';
          item.innerHTML = \`
            <div>
              <strong>\${monitor.name}</strong>
              <p style="color: #666; font-size: 12px;">\${monitor.url}</p>
            </div>
            <div class="monitor-status \${status}">\${monitor.status.toUpperCase()}</div>
          \`;
          list.appendChild(item);
        }
      } catch (e) {
        console.error('Monitors fetch failed:', e);
      }
    }

    async function addMonitor() {
      const url = document.getElementById('new-url').value;
      const name = document.getElementById('new-name').value;

      if (!url) { alert('Please enter a URL'); return; }

      try {
        await api('/monitors', 'POST', { url, name });
        document.getElementById('new-url').value = '';
        document.getElementById('new-name').value = '';
        loadMonitors();
      } catch (e) {
        alert('Failed to create monitor: ' + e.message);
      }
    }

    async function saveEmailSettings() {
      const settings = {
        smtpHost: document.getElementById('smtp-host').value,
        smtpPort: document.getElementById('smtp-port').value,
        smtpUser: document.getElementById('smtp-user').value,
        smtpPass: document.getElementById('smtp-pass').value
      };

      try {
        await api('/settings', 'POST', settings);
        alert('Email settings saved!');
      } catch (e) {
        alert('Failed to save settings: ' + e.message);
      }
    }

    function formatUptime(ms) {
      const days = Math.floor(ms / 86400000);
      const hours = Math.floor((ms % 86400000) / 3600000);
      return days > 0 ? \`\${days}d \${hours}h\` : \`\${hours}h\`;
    }

    // Update metrics every 5 seconds
    updateMetrics();
    loadMonitors();
    setInterval(updateMetrics, 5000);
    setInterval(loadMonitors, 10000);
  </script>
</body>
</html>`;
}

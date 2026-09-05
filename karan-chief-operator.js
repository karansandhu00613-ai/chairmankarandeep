#!/usr/bin/env node
/* ==========================================================================
   KARAN CHIEF OPERATOR v1.0

   Personal AI Assistant Platform with:
   • Natural language chat interface
   • Task automation & scheduling
   • Project Jarvis voice/AI integration
   • Chairman Agent OS monitoring capabilities
   • Real-time notifications
   • Team collaboration

   RUN:  node karan-chief-operator.js
   Then: open http://localhost:9000
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
// CONFIGURATION
// ============================================================================

const PORT = parseInt(process.env.PORT || '9000');
const HOST = '0.0.0.0';
const PRODUCTION = process.env.PRODUCTION === '1';
const NODE_ENV = process.env.NODE_ENV || 'development';
const DB = 'karan-data.json';
const SESSDB = 'karan-sessions.json';
const TTL = 30 * 24 * 60 * 60 * 1000;

// Integrations
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK || null;
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || null;
const JARVIS_API = process.env.JARVIS_API || null;
const CHAIRMAN_API = process.env.CHAIRMAN_API || null;

// ============================================================================
// STATE & STORES
// ============================================================================

let S = {
  owner: { id: '', pw: '', name: 'Karan', email: '' },
  team: [],
  tasks: {},
  projects: {},
  conversations: {},
  automations: {},
  integrations: {},
  settings: {},
  jarvis: { enabled: false, apiKey: '' },
  chairman: { enabled: false, config: {} }
};

const BLANK = structuredClone(S);
let DBBYTES = 0;
const SESS = new Map();
const WS_CLIENTS = new Map();
const EVENTS = new EventEmitter();
const AI_CONTEXT = [];

const T = {
  req: 0, err: 0, lat: [],
  byPath: {},
  started: Date.now(),
  events: []
};

// ============================================================================
// PERSISTENCE LAYER
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
    throw new Error('GitHub store requires GH_TOKEN and GH_REPO');
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
        'User-Agent': 'KaranChiefOperator/1.0',
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(data && { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) })
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
    if (data) req.write(data);
    req.end();
  });
}

// ============================================================================
// AI CHAT ENGINE - Karan's Chief Operator
// ============================================================================

async function processMessage(text, userId) {
  const message = {
    id: uid(),
    text,
    userId,
    timestamp: Date.now(),
    type: 'user'
  };

  // Add to context
  AI_CONTEXT.push(message);
  if (AI_CONTEXT.length > 50) AI_CONTEXT.shift();

  // Parse intent
  const intent = parseIntent(text);
  let response = null;

  try {
    switch (intent.type) {
      case 'task':
        response = await handleTaskIntent(intent, userId);
        break;
      case 'project':
        response = await handleProjectIntent(intent, userId);
        break;
      case 'monitor':
        response = await handleMonitorIntent(intent, userId);
        break;
      case 'jarvis':
        response = await handleJarvisIntent(intent, text, userId);
        break;
      case 'schedule':
        response = await handleScheduleIntent(intent, userId);
        break;
      case 'query':
        response = await handleQueryIntent(intent, userId);
        break;
      default:
        response = await handleGeneralConversation(text, userId);
    }
  } catch (e) {
    response = { text: `Sorry, I encountered an error: ${e.message}`, type: 'error' };
  }

  const reply = {
    id: uid(),
    text: response.text,
    type: response.type || 'assistant',
    userId: 'karan-operator',
    timestamp: Date.now(),
    action: response.action,
    data: response.data
  };

  // Save conversation
  if (!S.conversations[userId]) S.conversations[userId] = [];
  S.conversations[userId].push(message);
  S.conversations[userId].push(reply);
  if (S.conversations[userId].length > 1000) S.conversations[userId].shift();

  broadcastEvent('message', reply);
  return reply;
}

function parseIntent(text) {
  text = text.toLowerCase();

  // Task intents
  if (text.includes('create task') || text.includes('add task') || text.includes('new task')) {
    return { type: 'task', action: 'create' };
  }
  if (text.includes('complete task') || text.includes('finish task') || text.includes('done')) {
    return { type: 'task', action: 'complete' };
  }
  if (text.includes('list tasks') || text.includes('show tasks') || text.includes('my tasks')) {
    return { type: 'task', action: 'list' };
  }

  // Project intents
  if (text.includes('create project') || text.includes('new project') || text.includes('start project')) {
    return { type: 'project', action: 'create' };
  }
  if (text.includes('show projects') || text.includes('list projects') || text.includes('my projects')) {
    return { type: 'project', action: 'list' };
  }

  // Monitoring intents
  if (text.includes('monitor') || text.includes('uptime') || text.includes('status')) {
    return { type: 'monitor', action: 'check' };
  }

  // Jarvis intents
  if (text.includes('jarvis') || text.includes('voice') || text.includes('listen')) {
    return { type: 'jarvis', action: 'engage' };
  }

  // Schedule intents
  if (text.includes('schedule') || text.includes('remind') || text.includes('set timer')) {
    return { type: 'schedule', action: 'create' };
  }

  // Query intents
  if (text.includes('how many') || text.includes('count') || text.includes('statistics')) {
    return { type: 'query', action: 'stats' };
  }

  return { type: 'general', action: 'chat' };
}

async function handleTaskIntent(intent, userId) {
  const action = intent.action;

  if (action === 'create') {
    return { text: 'I can help you create a task. What would you like to track?', type: 'prompt' };
  }

  if (action === 'list') {
    const tasks = Object.values(S.tasks).filter(t => t.userId === userId);
    const active = tasks.filter(t => !t.completed).length;
    const completed = tasks.filter(t => t.completed).length;
    return {
      text: `You have ${active} active tasks and ${completed} completed. Would you like me to show details?`,
      type: 'assistant',
      data: { active, completed, total: tasks.length }
    };
  }

  if (action === 'complete') {
    return { text: 'Which task would you like to mark as complete?', type: 'prompt' };
  }

  return { text: 'How can I help with your tasks?', type: 'assistant' };
}

async function handleProjectIntent(intent, userId) {
  const action = intent.action;

  if (action === 'create') {
    return { text: 'Exciting! What is the name of your new project?', type: 'prompt' };
  }

  if (action === 'list') {
    const projects = Object.values(S.projects).filter(p => p.userId === userId);
    return {
      text: `You have ${projects.length} projects. ${projects.map(p => p.name).join(', ') || 'No projects yet.'}`,
      type: 'assistant',
      data: { projects }
    };
  }

  return { text: 'How can I help with your projects?', type: 'assistant' };
}

async function handleMonitorIntent(intent, userId) {
  if (!S.chairman.enabled) {
    return { text: 'Chairman monitoring is not configured. Would you like to set it up?', type: 'assistant' };
  }

  return {
    text: 'Checking your monitors now...',
    type: 'assistant',
    action: 'fetch_monitors',
    data: { endpoint: '/api/monitors' }
  };
}

async function handleJarvisIntent(intent, text, userId) {
  if (!S.jarvis.enabled) {
    return { text: 'Jarvis is not configured. Would you like to enable it?', type: 'assistant' };
  }

  return {
    text: 'Jarvis is ready to assist. You can give voice commands or type instructions.',
    type: 'assistant',
    action: 'activate_jarvis'
  };
}

async function handleScheduleIntent(intent, userId) {
  return { text: 'What would you like me to schedule or remind you about?', type: 'prompt' };
}

async function handleQueryIntent(intent, userId) {
  const tasks = Object.values(S.tasks).filter(t => t.userId === userId);
  const projects = Object.values(S.projects).filter(p => p.userId === userId);

  return {
    text: `Statistics: ${tasks.length} tasks, ${projects.length} projects`,
    type: 'assistant',
    data: { stats: { tasks: tasks.length, projects: projects.length } }
  };
}

async function handleGeneralConversation(text, userId) {
  // Simple conversation logic
  const responses = {
    'hi': 'Hello! I\'m your Chief Operator. How can I help?',
    'hello': 'Hi there! What can I do for you?',
    'help': 'I can help you with tasks, projects, monitoring, and automation.',
    'how are you': 'I\'m functioning perfectly, thank you for asking! How can I assist you?',
    'what can you do': 'I can manage tasks & projects, monitor systems, schedule automations, and integrate with Jarvis voice assistant.',
    'default': 'That\'s interesting! Can you tell me more?'
  };

  const lowerText = text.toLowerCase();
  for (const [key, resp] of Object.entries(responses)) {
    if (lowerText.includes(key)) return { text: resp, type: 'assistant' };
  }

  return { text: responses.default, type: 'assistant' };
}

// ============================================================================
// TASK & PROJECT MANAGEMENT
// ============================================================================

function createTask(userId, title, description = '', dueDate = null) {
  const taskId = uid();
  S.tasks[taskId] = {
    id: taskId,
    userId,
    title,
    description,
    dueDate,
    priority: 'medium',
    completed: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  return S.tasks[taskId];
}

function createProject(userId, name, description = '') {
  const projectId = uid();
  S.projects[projectId] = {
    id: projectId,
    userId,
    name,
    description,
    status: 'active',
    tasks: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  return S.projects[projectId];
}

// ============================================================================
// WEBSOCKET SUPPORT
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

  socket.on('error', (err) => console.error('WebSocket error:', err.message));
  socket.on('close', () => {
    WS_CLIENTS.delete(socket);
    console.log('[ws] Client disconnected');
  });

  console.log('[ws] Client connected');
}

function broadcastEvent(channel, data) {
  const payload = JSON.stringify({ type: 'event', channel, data });
  const frame = createWebSocketFrame(payload);

  for (const ws of WS_CLIENTS.values()) {
    try { ws.socket.write(frame); } catch (e) {}
  }
}

function createWebSocketFrame(data) {
  const payload = Buffer.from(data);
  const frame = Buffer.alloc(payload.length + 14);
  frame[0] = 0x81;
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
// API ENDPOINTS
// ============================================================================

async function handleAPI(req, res, pathname, query) {
  const method = req.method;

  // Public endpoints
  if (pathname === '/api/health') {
    return send(res, 200, { ok: true, uptime: Date.now() - T.started });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await readBody(req);
    const { id, password } = JSON.parse(body);

    if (id === S.owner.id && hash(password) === S.owner.pwHash) {
      const sessionId = createSession(S.owner.id);
      return send(res, 200, { ok: true, sessionId });
    }

    return send(res, 401, { error: 'Invalid credentials' });
  }

  if (pathname === '/api/auth/register' && method === 'POST') {
    if (S.owner.id) return send(res, 400, { error: 'Owner already registered' });

    const body = await readBody(req);
    const { id, password, name } = JSON.parse(body);

    S.owner = { id, pwHash: hash(password), name, email: '', createdAt: Date.now() };
    const sessionId = createSession(S.owner.id);

    await STORE.write(DB, JSON.stringify(S, null, 1));

    send(res, 201, { ok: true, sessionId });
    broadcastEvent('auth', { type: 'registered', owner: name });
  }

  // Protected endpoints
  const sess = verifySession(query.get('sessionId'));
  if (!sess) return send(res, 401, { error: 'Unauthorized' });

  if (pathname === '/api/chat' && method === 'POST') {
    const body = await readBody(req);
    const { message } = JSON.parse(body);

    const reply = await processMessage(message, S.owner.id);
    await STORE.write(DB, JSON.stringify(S, null, 1));

    return send(res, 200, { message: reply });
  }

  if (pathname === '/api/conversations') {
    const convs = S.conversations[S.owner.id] || [];
    return send(res, 200, { conversations: convs.slice(-50) });
  }

  if (pathname === '/api/tasks' && method === 'GET') {
    const tasks = Object.values(S.tasks).filter(t => t.userId === S.owner.id);
    return send(res, 200, { tasks });
  }

  if (pathname === '/api/tasks' && method === 'POST') {
    const body = await readBody(req);
    const { title, description, dueDate } = JSON.parse(body);

    const task = createTask(S.owner.id, title, description, dueDate);
    await STORE.write(DB, JSON.stringify(S, null, 1));

    broadcastEvent('task-created', task);
    return send(res, 201, { task });
  }

  if (pathname === '/api/projects' && method === 'GET') {
    const projects = Object.values(S.projects).filter(p => p.userId === S.owner.id);
    return send(res, 200, { projects });
  }

  if (pathname === '/api/projects' && method === 'POST') {
    const body = await readBody(req);
    const { name, description } = JSON.parse(body);

    const project = createProject(S.owner.id, name, description);
    await STORE.write(DB, JSON.stringify(S, null, 1));

    broadcastEvent('project-created', project);
    return send(res, 201, { project });
  }

  if (pathname === '/api/integrations') {
    return send(res, 200, {
      chairman: S.chairman.enabled,
      jarvis: S.jarvis.enabled,
      slack: !!SLACK_WEBHOOK,
      discord: !!DISCORD_WEBHOOK
    });
  }

  if (pathname === '/api/settings' && method === 'GET') {
    return send(res, 200, { settings: S.settings });
  }

  if (pathname === '/api/settings' && method === 'POST') {
    const body = await readBody(req);
    S.settings = Object.assign(S.settings, JSON.parse(body));
    await STORE.write(DB, JSON.stringify(S, null, 1));
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: 'Not found' });
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

// ============================================================================
// MAIN SERVER
// ============================================================================

const server = http.createServer(async (req, res) => {
  T.req++;
  const t0 = Date.now();

  try {
    const u = new URL(req.url, 'http://x');
    T.byPath[u.pathname] = (T.byPath[u.pathname] || 0) + 1;

    if (u.pathname.startsWith('/api/')) {
      return await handleAPI(req, res, u.pathname, u.searchParams);
    }

    // Serve HTML dashboard
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end(getIndexHTML());
  } catch (e) {
    T.err++;
    console.error('Error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal error' }));
  }

  res.on('finish', () => {
    T.lat.push(Date.now() - t0);
    if (T.lat.length > 500) T.lat.shift();
  });
});

server.on('upgrade', (req, socket, head) => {
  if (req.headers.upgrade === 'websocket') {
    upgradeToWebSocket(req, socket, head);
  }
});

// ============================================================================
// STARTUP
// ============================================================================

(async function init() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('   KARAN CHIEF OPERATOR v1.0');
  console.log('════════════════════════════════════════════════════════\n');

  try {
    const raw = await STORE.read(DB);
    if (raw) {
      S = Object.assign(structuredClone(BLANK), JSON.parse(raw));
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
    process.exit(1);
  }

  server.listen(PORT, HOST, () => {
    console.log(`   RUNNING ON:  http://localhost:${PORT}`);
    console.log(`   MODE:        ${PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`   STORE:       ${STORE.describe()}`);
    console.log('\n   Features:`);
    console.log(`     • Chat Interface: ✓ Active`);
    console.log(`     • Task Management: ✓ Ready`);
    console.log(`     • Project Management: ✓ Ready`);
    console.log(`     • Chairman Integration: ${S.chairman.enabled ? '✓' : '✗'} ${S.chairman.enabled ? 'Connected' : 'Available'}`);
    console.log(`     • Jarvis Integration: ${S.jarvis.enabled ? '✓' : '✗'} ${S.jarvis.enabled ? 'Connected' : 'Available'}`);
    console.log('\n════════════════════════════════════════════════════════\n');
  });
})();

process.on('SIGTERM', async () => {
  console.log('\n[shutdown] Flushing state...');
  try {
    await STORE.write(DB, JSON.stringify(S, null, 1));
  } catch (e) {}
  setTimeout(() => process.exit(0), 1500);
});

// ============================================================================
// WEB DASHBOARD
// ============================================================================

function getIndexHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Karan Chief Operator</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #e0e0e0; height: 100vh; overflow: hidden; }

    .container { display: flex; height: 100vh; }

    .sidebar { width: 280px; background: #0f3460; border-right: 1px solid #444; padding: 20px; overflow-y: auto; }
    .sidebar h2 { color: #00d4ff; margin-bottom: 20px; font-size: 18px; }
    .sidebar-item { padding: 12px; margin-bottom: 8px; background: #1a2e4a; border-left: 3px solid #00d4ff; cursor: pointer; border-radius: 4px; transition: 0.2s; }
    .sidebar-item:hover { background: #253d57; }
    .sidebar-item.active { background: #00d4ff; color: #000; font-weight: bold; }

    .main { flex: 1; display: flex; flex-direction: column; }
    .header { background: #16213e; border-bottom: 1px solid #444; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { color: #00d4ff; font-size: 24px; }
    .header-info { display: flex; gap: 20px; align-items: center; }
    .status-badge { background: #00ff88; color: #000; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }

    .content { flex: 1; display: flex; overflow: hidden; }

    .chat-area { flex: 1; display: flex; flex-direction: column; border-right: 1px solid #444; }
    .messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
    .message { padding: 12px 16px; border-radius: 8px; max-width: 70%; }
    .message.user { align-self: flex-end; background: #00d4ff; color: #000; font-weight: 500; }
    .message.assistant { align-self: flex-start; background: #1a2e4a; color: #e0e0e0; border-left: 3px solid #00d4ff; }
    .message.error { align-self: flex-start; background: #4a1a1a; color: #ff6b6b; }

    .chat-input { padding: 20px; border-top: 1px solid #444; display: flex; gap: 10px; }
    .chat-input input { flex: 1; padding: 12px; background: #1a2e4a; border: 1px solid #444; color: #e0e0e0; border-radius: 6px; font-size: 14px; }
    .chat-input input:focus { outline: none; border-color: #00d4ff; }
    .chat-input button { padding: 12px 24px; background: #00d4ff; color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition: 0.2s; }
    .chat-input button:hover { background: #00ff88; }

    .sidebar-panel { width: 320px; background: #0f3460; border-left: 1px solid #444; padding: 20px; overflow-y: auto; display: none; }
    .sidebar-panel.show { display: block; }
    .panel-title { color: #00d4ff; margin-bottom: 15px; font-weight: bold; }
    .panel-item { padding: 12px; background: #1a2e4a; margin-bottom: 10px; border-radius: 4px; border-left: 2px solid #00ff88; }

    .action-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px; }
    .btn-small { padding: 8px 12px; background: #00d4ff; color: #000; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; }
    .btn-small:hover { background: #00ff88; }

    @media (max-width: 1024px) {
      .sidebar-panel { display: none; }
      .message { max-width: 90%; }
    }

    @media (max-width: 768px) {
      .sidebar { display: none; }
      .chat-area { border: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Sidebar -->
    <div class="sidebar">
      <h2>⚡ KARAN OPERATOR</h2>
      <div class="sidebar-item active" onclick="setPanel('chat')">💬 Chat</div>
      <div class="sidebar-item" onclick="setPanel('tasks')">✓ Tasks</div>
      <div class="sidebar-item" onclick="setPanel('projects')">📁 Projects</div>
      <div class="sidebar-item" onclick="setPanel('monitor')">📡 Monitoring</div>
      <div class="sidebar-item" onclick="setPanel('jarvis')">🎤 Jarvis</div>
      <div class="sidebar-item" onclick="setPanel('settings')">⚙️ Settings</div>
    </div>

    <!-- Main Content -->
    <div class="main">
      <div class="header">
        <h1>Chief Operator</h1>
        <div class="header-info">
          <span id="status">Initializing...</span>
          <div class="status-badge" id="status-badge">● READY</div>
        </div>
      </div>

      <div class="content">
        <!-- Chat Area -->
        <div class="chat-area">
          <div class="messages" id="messages"></div>
          <div class="chat-input">
            <input type="text" id="message-input" placeholder="Tell me what to do..." onkeypress="if(event.key==='Enter') sendMessage()">
            <button onclick="sendMessage()">Send</button>
          </div>
        </div>

        <!-- Right Panel -->
        <div class="sidebar-panel show" id="tasks-panel">
          <div class="panel-title">📋 Tasks</div>
          <div id="tasks-list"></div>
          <div class="action-buttons">
            <button class="btn-small" onclick="addTask()">+ New Task</button>
          </div>
        </div>

        <div class="sidebar-panel" id="projects-panel">
          <div class="panel-title">📁 Projects</div>
          <div id="projects-list"></div>
          <div class="action-buttons">
            <button class="btn-small" onclick="addProject()">+ New Project</button>
          </div>
        </div>

        <div class="sidebar-panel" id="monitor-panel">
          <div class="panel-title">📡 Monitoring</div>
          <div id="monitor-list">Chairman integration available</div>
        </div>

        <div class="sidebar-panel" id="jarvis-panel">
          <div class="panel-title">🎤 Jarvis Integration</div>
          <div id="jarvis-status">Voice assistant ready</div>
        </div>

        <div class="sidebar-panel" id="settings-panel">
          <div class="panel-title">⚙️ Settings</div>
          <div class="panel-item">
            <label>Chairman Agent OS</label>
            <input type="checkbox" id="chairman-toggle" onchange="toggleChairman()">
          </div>
          <div class="panel-item">
            <label>Jarvis Voice Assistant</label>
            <input type="checkbox" id="jarvis-toggle" onchange="toggleJarvis()">
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let sessionId = localStorage.getItem('sessionId');
    const messagesDiv = document.getElementById('messages');

    async function api(path, method = 'GET', data = null) {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (data) opts.body = JSON.stringify(data);
      const res = await fetch(\`/api\${path}?sessionId=\${sessionId}\`, opts);
      return res.json();
    }

    function addMessage(text, type = 'assistant') {
      const div = document.createElement('div');
      div.className = 'message ' + type;
      div.textContent = text;
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    async function sendMessage() {
      const input = document.getElementById('message-input');
      const text = input.value.trim();
      if (!text) return;

      addMessage(text, 'user');
      input.value = '';

      try {
        const data = await api('/chat', 'POST', { message: text });
        addMessage(data.message.text, data.message.type);
      } catch (e) {
        addMessage('Error: ' + e.message, 'error');
      }
    }

    function setPanel(panel) {
      document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('show'));
      document.getElementById(panel + '-panel').classList.add('show');
      document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
      event.target.classList.add('active');
    }

    function addTask() {
      const title = prompt('Task name:');
      if (title) api('/tasks', 'POST', { title });
    }

    function addProject() {
      const name = prompt('Project name:');
      if (name) api('/projects', 'POST', { name });
    }

    function toggleChairman() {
      console.log('Chairman toggle');
    }

    function toggleJarvis() {
      console.log('Jarvis toggle');
    }

    // Load initial data
    (async () => {
      try {
        const data = await api('/health');
        if (!data.ok) location.reload();
      } catch (e) {
        console.error('Init failed:', e);
      }
    })();
  </script>
</body>
</html>`;
}

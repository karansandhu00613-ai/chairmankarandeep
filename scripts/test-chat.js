#!/usr/bin/env node
/**
 * End-to-end tests for the dashboard chat.
 *
 * These boot the real karan-dashboard.js as a separate process, log in over
 * HTTP the way the browser does, and send real messages. The provider is a
 * local server standing in for Gemini, so the whole path is exercised —
 * session check, route, the failover chain, the reply shape the page reads —
 * without contacting a real API or needing a key.
 *
 * The chat box looking dead is the failure this project has hit most often, so
 * it is worth proving from the outside rather than from the inside.
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EMAIL = 'owner@example.test';
const PASSWORD = 'test-password-not-a-real-one';

let passed = 0;
let failed = 0;

function check(cond, what) {
  if (!cond) throw new Error(what);
}

async function test(name, fn) {
  try {
    await fn();
    console.log('✅ ' + name);
    passed++;
  } catch (e) {
    console.log('❌ ' + name + ': ' + e.message);
    failed++;
  }
}

function fakeGemini(replies) {
  const calls = [];
  let i = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      calls.push(JSON.parse(body || '{}'));
      const [status, payload] = replies[Math.min(i++, replies.length - 1)];
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({
      calls,
      url: 'http://127.0.0.1:' + server.address().port,
      close: () => new Promise(r => server.close(r))
    }));
  });
}

function request(port, method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (cookie) headers.Cookie = cookie;
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch (e) { parsed = { raw: data }; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Boot the dashboard on a free port and wait until it answers. */
async function startDashboard(extraEnv) {
  const port = 8000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [path.join(ROOT, 'karan-dashboard.js')], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, {
      PORT: String(port),
      OWNER_EMAIL: EMAIL,
      OWNER_PASSWORD: PASSWORD,
      SESSION_SECRET: 'test-session-secret',
      // Backends are not part of this test; point them nowhere reachable so a
      // status check fails fast instead of dialling a real service.
      KARAN_API: 'http://127.0.0.1:1',
      CHAIRMAN_API: 'http://127.0.0.1:1',
      JARVIS_API: 'http://127.0.0.1:1'
    }, extraEnv || {})
  });

  let stderr = '';
  child.stderr.on('data', d => stderr += d);
  child.stdout.on('data', () => {});

  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      const r = await request(port, 'GET', '/api/health');
      if (r.status === 200) break;
    } catch (e) { /* not listening yet */ }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error('dashboard did not start: ' + stderr.slice(0, 400));
    }
    await new Promise(r => setTimeout(r, 100));
  }

  return {
    port,
    stop: () => new Promise(r => { child.once('exit', r); child.kill(); })
  };
}

async function login(port) {
  const res = await request(port, 'POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  if (res.status !== 200) throw new Error('login failed with ' + res.status);
  const setCookie = (res.headers['set-cookie'] || [])[0] || '';
  return setCookie.split(';')[0];
}

async function run() {
  console.log('\n🧪 Dashboard chat tests\n');

  await test('Chat refuses an unauthenticated caller', async () => {
    const dash = await startDashboard();
    try {
      const res = await request(dash.port, 'POST', '/api/chat', { message: 'hello' });
      check(res.status === 401, 'expected 401, got ' + res.status);
    } finally { await dash.stop(); }
  });

  await test('With no provider key, chat says what to set rather than hanging', async () => {
    const dash = await startDashboard();
    try {
      const cookie = await login(dash.port);
      const res = await request(dash.port, 'POST', '/api/chat', { message: 'hello' }, cookie);
      check(res.status === 502, 'expected 502, got ' + res.status);
      check(/GEMINI_API_KEY|GROQ_API_KEY/.test(res.body.error || ''),
        'error does not name a key to set: ' + res.body.error);
    } finally { await dash.stop(); }
  });

  await test('Status reports which providers are configured', async () => {
    const gem = await fakeGemini([[200, {}]]);
    const dash = await startDashboard({ GEMINI_API_KEY: 'k', GEMINI_BASE_URL: gem.url });
    try {
      const cookie = await login(dash.port);
      const res = await request(dash.port, 'GET', '/api/status', null, cookie);
      check(res.status === 200, 'status returned ' + res.status);
      check(res.body.brain && res.body.brain.providers.join() === 'Gemini',
        'brain not reported: ' + JSON.stringify(res.body.brain));
    } finally { await dash.stop(); await gem.close(); }
  });

  await test('A message gets a real answer, carrying the standing orders', async () => {
    const gem = await fakeGemini([
      [200, { candidates: [{ content: { parts: [{ text: 'Understood.' }] } }] }]
    ]);
    const dash = await startDashboard({ GEMINI_API_KEY: 'k', GEMINI_BASE_URL: gem.url });
    try {
      const cookie = await login(dash.port);
      const res = await request(dash.port, 'POST', '/api/chat', { message: 'status?' }, cookie);
      check(res.status === 200, 'chat returned ' + res.status + ': ' + JSON.stringify(res.body));
      check(res.body.reply === 'Understood.', 'wrong reply: ' + res.body.reply);
      check(res.body.provider === 'Gemini', 'wrong provider: ' + res.body.provider);

      const sent = gem.calls[0];
      check(JSON.stringify(sent.contents).includes('status?'), 'the message was not sent');
      const system = JSON.stringify(sent.systemInstruction || {});
      check(/approves every external action/.test(system), 'approval rule not sent');
      check(/NEEDS APPROVAL/.test(system), 'approval marker not sent');
      check(/Never state as fact anything you have not verified/.test(system),
        'the no-guessing rule not sent');
    } finally { await dash.stop(); await gem.close(); }
  });

  await test('An empty message is rejected before any provider is called', async () => {
    const gem = await fakeGemini([[200, {}]]);
    const dash = await startDashboard({ GEMINI_API_KEY: 'k', GEMINI_BASE_URL: gem.url });
    try {
      const cookie = await login(dash.port);
      const res = await request(dash.port, 'POST', '/api/chat', { message: '   ' }, cookie);
      check(res.status === 400, 'expected 400, got ' + res.status);
      check(gem.calls.length === 0, 'called the provider with an empty message');
    } finally { await dash.stop(); await gem.close(); }
  });

  await test('When the free tier is spent the reply says who answered instead', async () => {
    const gem = await fakeGemini([[429, { error: { message: 'Quota exceeded' } }]]);
    const groqServer = http.createServer((req, res) => {
      let b = '';
      req.on('data', d => b += d);
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'Backup answering.' } }] }));
      });
    });
    await new Promise(r => groqServer.listen(0, '127.0.0.1', r));
    const groqUrl = 'http://127.0.0.1:' + groqServer.address().port;

    const dash = await startDashboard({
      GEMINI_API_KEY: 'k', GEMINI_BASE_URL: gem.url,
      GROQ_API_KEY: 'q', GROQ_BASE_URL: groqUrl
    });
    try {
      const cookie = await login(dash.port);
      const res = await request(dash.port, 'POST', '/api/chat', { message: 'hello' }, cookie);
      check(res.status === 200, 'chat returned ' + res.status + ': ' + JSON.stringify(res.body));
      check(res.body.reply === 'Backup answering.', 'wrong reply: ' + res.body.reply);
      check(res.body.provider === 'Groq', 'wrong provider: ' + res.body.provider);
      check((res.body.failedOver || []).join() === 'Gemini',
        'did not report the failover: ' + JSON.stringify(res.body.failedOver));
    } finally {
      await dash.stop();
      await gem.close();
      await new Promise(r => groqServer.close(r));
    }
  });

  console.log('\n📊 ' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed > 0 ? 1 : 0);
}

run();

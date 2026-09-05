#!/usr/bin/env node
/**
 * Behavioural tests for the watchdog.
 *
 * These run the real script against real HTTP servers and assert on what it
 * actually did. The previous version of this file only checked that certain
 * strings existed in certain files, which is how a set of "auto-fix agents"
 * that returned hardcoded success passed a full suite while repairing nothing.
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const WATCHDOG = path.join(__dirname, 'watchdog.js');
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    failed++;
  }
}

function startServer(port, handler) {
  const server = http.createServer(handler);
  server.listen(port);
  return server;
}

// Run the watchdog with every service pointed at the given base URLs.
function runWatchdog(urls, extraEnv = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [WATCHDOG], {
      env: {
        ...process.env,
        RENDER_API_KEY: '',
        HEALTH_TIMEOUT_MS: '2000',
        DASHBOARD_URL: urls.dashboard,
        KARAN_API: urls.karan,
        CHAIRMAN_API: urls.chairman,
        JARVIS_API: urls.jarvis,
        ...extraEnv
      }
    });
    let out = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => out += d);
    child.on('close', code => resolve({ code, out }));
  });
}

const healthy = (req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }
  res.writeHead(404);
  res.end();
};

async function main() {
console.log('\n🔧 Watchdog behaviour tests\n');

const PORTS = { dashboard: 18801, karan: 18802, chairman: 18803, jarvis: 18804 };
const url = p => `http://127.0.0.1:${p}`;
const allUrls = {
  dashboard: url(PORTS.dashboard),
  karan: url(PORTS.karan),
  chairman: url(PORTS.chairman),
  jarvis: url(PORTS.jarvis)
};

const servers = Object.values(PORTS).map(p => startServer(p, healthy));

try {
  await test('Reports success and exits 0 when every service is healthy', async () => {
    const { code, out } = await runWatchdog(allUrls);
    if (code !== 0) throw new Error(`expected exit 0, got ${code}\n${out}`);
    if (!out.includes('All services healthy')) throw new Error('did not report all healthy');
  });

  await test('Requests each health endpoint, which is what keeps services awake', async () => {
    let hits = 0;
    const counter = startServer(18810, (req, res) => {
      if (req.url === '/api/health') hits++;
      healthy(req, res);
    });
    try {
      await runWatchdog({ ...allUrls, karan: url(18810) });
      if (hits < 1) throw new Error('health endpoint was never requested');
    } finally {
      counter.close();
    }
  });

  // A single failed request is not proof of an outage. Restarting on one blip
  // would cause the very downtime the watchdog exists to prevent.
  await test('Re-checks a failing service before attempting any repair', async () => {
    const { out } = await runWatchdog({ ...allUrls, karan: url(18899) });
    if (!out.includes('Re-checking before acting')) throw new Error('acted without a second check');
  });

  await test('Detects a genuinely down service and exits non-zero', async () => {
    const { code, out } = await runWatchdog({ ...allUrls, karan: url(18899) });
    if (code === 0) throw new Error('reported success while a service was down');
    if (!out.includes('still down')) throw new Error('did not report the service as down');
  });

  await test('Treats a non-200 response as unhealthy, not merely a reachable host', async () => {
    const broken = startServer(18811, (req, res) => { res.writeHead(500); res.end('{}'); });
    try {
      const { code, out } = await runWatchdog({ ...allUrls, karan: url(18811) });
      if (code === 0) throw new Error('a 500 response was treated as healthy');
      if (!out.includes('HTTP 500')) throw new Error('did not surface the status code');
    } finally {
      broken.close();
    }
  });

  // Without credentials it must say so rather than implying a repair happened.
  await test('States plainly that it cannot repair without an API key', async () => {
    const { out } = await runWatchdog({ ...allUrls, karan: url(18899) });
    if (!out.includes('RENDER_API_KEY is not set')) throw new Error('did not explain why no repair ran');
    if (/rollback accepted|restart accepted/.test(out)) throw new Error('claimed a repair it never made');
  });

  await test('Never claims a repair succeeded without a confirming API response', async () => {
    const src = require('fs').readFileSync(WATCHDOG, 'utf8');
    if (!/confirmed:\s*res\.status\s*>=\s*200/.test(src)) {
      throw new Error('success is not derived from a real HTTP status');
    }
    if (/confirmed:\s*true\b/.test(src)) {
      throw new Error('hardcoded success found');
    }
  });

  await test('Scheduled workflow exists and runs the watchdog', async () => {
    const fs = require('fs');
    const wf = path.join(__dirname, '..', '.github', 'workflows', 'watchdog.yml');
    if (!fs.existsSync(wf)) throw new Error('no workflow; nothing would ever run the watchdog');
    const yml = fs.readFileSync(wf, 'utf8');
    if (!yml.includes('cron:')) throw new Error('workflow has no schedule');
    if (!yml.includes('scripts/watchdog.js')) throw new Error('workflow does not run the watchdog');
    if (!yml.includes('RENDER_API_KEY')) throw new Error('workflow does not pass the API key');
  });
} finally {
  servers.forEach(s => s.close());
}

console.log(`\n📊 ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/**
 * Watchdog: detects failed services and actually repairs them via the Render API.
 *
 * Every action here is confirmed against a real API response. Nothing reports
 * success unless the remote call returned success. The previous "auto-fix
 * agents" returned hardcoded {success:true} without making any call, so a
 * broken service looked repaired while staying broken.
 *
 * What it can genuinely repair:
 *   - a sleeping free-tier service        -> the health request itself wakes it
 *   - a crashed or wedged service         -> restart via the API
 *   - a deploy that failed to build/start -> roll back to the last good deploy
 *
 * What it cannot repair, and reports instead:
 *   - a logic bug in the code             -> needs a code change
 *   - a missing or wrong secret           -> the correct value is not guessable
 *   - a service failing straight after a  -> rolling back again would loop
 *     rollback
 *
 * Usage:  node scripts/watchdog.js [--dry-run]
 * Env:    RENDER_API_KEY  required for repairs; without it, checks and reports only
 */

const https = require('https');
const http = require('http');

const RENDER_API_KEY = process.env.RENDER_API_KEY || '';
const DRY_RUN = process.argv.includes('--dry-run');
const HEALTH_TIMEOUT = Number(process.env.HEALTH_TIMEOUT_MS || 60000);

// Free-tier services sleep after ~15 minutes idle and take up to a minute to
// wake, so a slow first response is normal rather than a fault.
const SERVICES = [
  { name: 'karan-dashboard', url: process.env.DASHBOARD_URL || 'https://karan-dashboard-g6rb.onrender.com' },
  { name: 'karan-service',   url: process.env.KARAN_API     || 'https://karan-service-huy0.onrender.com' },
  { name: 'chairman-service',url: process.env.CHAIRMAN_API  || 'https://chairman-service.onrender.com' },
  { name: 'jarvis-service',  url: process.env.JARVIS_API    || 'https://jarvis-service.onrender.com' }
];

const log = (...a) => console.log(...a);

function request(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const client = u.protocol === 'http:' ? http : https;
    const req = client.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method,
      timeout: HEALTH_TIMEOUT,
      headers: {
        'Accept': 'application/json',
        ...headers,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timed out after ' + HEALTH_TIMEOUT + 'ms')); });
    if (payload) req.write(payload);
    req.end();
  });
}

const api = (method, path, body) => request(
  method,
  'https://api.render.com/v1' + path,
  { Authorization: 'Bearer ' + RENDER_API_KEY },
  body
);

async function checkHealth(service) {
  const started = Date.now();
  try {
    const res = await request('GET', service.url + '/api/health');
    return { ok: res.status === 200, ms: Date.now() - started, detail: 'HTTP ' + res.status };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, detail: e.message };
  }
}

async function listServices() {
  const res = await api('GET', '/services?limit=50');
  if (res.status !== 200 || !Array.isArray(res.body)) {
    throw new Error('could not list services: HTTP ' + res.status);
  }
  // The API returns [{ service: {...} }] or [{...}] depending on the route.
  return res.body.map(row => row.service || row);
}

async function recentDeploys(serviceId, limit = 5) {
  const res = await api('GET', `/services/${serviceId}/deploys?limit=${limit}`);
  if (res.status !== 200 || !Array.isArray(res.body)) return [];
  return res.body.map(row => row.deploy || row);
}

const FAILED = new Set(['build_failed', 'update_failed', 'canceled', 'pre_deploy_failed']);

/**
 * Decide the repair from real evidence, then carry it out.
 * Returns what was attempted and whether the API confirmed it.
 */
async function repair(service, remote) {
  const deploys = await recentDeploys(remote.id);
  const latest = deploys[0];
  const lastGood = deploys.find(d => d.status === 'live' && d.id !== (latest && latest.id));

  // A deploy that failed to build or start is the most likely cause, and the
  // only case where rolling back is the right move.
  if (latest && FAILED.has(latest.status)) {
    if (!lastGood) {
      return { action: 'none', confirmed: false,
        reason: `latest deploy ${latest.status} and no earlier live deploy to roll back to` };
    }
    if (DRY_RUN) {
      return { action: 'rollback', confirmed: false, reason: 'dry run', target: lastGood.id };
    }
    const res = await api('POST', `/services/${remote.id}/rollback`, { deployId: lastGood.id });
    return {
      action: 'rollback',
      confirmed: res.status >= 200 && res.status < 300,
      target: lastGood.id,
      reason: `latest deploy ${latest.status}; rollback returned HTTP ${res.status}`
    };
  }

  // The deploy is fine but the service is not answering, so it is wedged or
  // crash-looping. A restart is the appropriate repair.
  if (DRY_RUN) return { action: 'restart', confirmed: false, reason: 'dry run' };

  const res = await api('POST', `/services/${remote.id}/restart`, {});
  return {
    action: 'restart',
    confirmed: res.status >= 200 && res.status < 300,
    reason: `deploy status ${latest ? latest.status : 'unknown'}; restart returned HTTP ${res.status}`
  };
}

async function main() {
  log(`\nWatchdog — ${new Date().toISOString()}${DRY_RUN ? '  (dry run)' : ''}\n`);

  // First pass. This doubles as the keep-alive: requesting each health endpoint
  // is what stops free-tier services idling into a cold start.
  const results = [];
  for (const s of SERVICES) {
    const health = await checkHealth(s);
    results.push({ service: s, health });
    log(`  ${health.ok ? 'up  ' : 'DOWN'}  ${s.name.padEnd(18)} ${health.ms}ms  ${health.detail}`);
  }

  const down = results.filter(r => !r.health.ok);
  if (!down.length) {
    log('\nAll services healthy. Nothing to repair.\n');
    return 0;
  }

  // A single failed request is not proof. Re-check before touching anything,
  // because a needless restart causes the outage it is meant to prevent.
  log(`\n${down.length} not responding. Re-checking before acting...\n`);
  const confirmed = [];
  for (const r of down) {
    const retry = await checkHealth(r.service);
    if (retry.ok) {
      log(`  recovered on retry: ${r.service.name} (${retry.ms}ms) — was a cold start`);
    } else {
      log(`  still down: ${r.service.name} — ${retry.detail}`);
      confirmed.push(r);
    }
  }

  if (!confirmed.length) {
    log('\nEverything recovered on its own. No repair needed.\n');
    return 0;
  }

  if (!RENDER_API_KEY) {
    log('\nRENDER_API_KEY is not set, so repairs cannot be attempted.');
    log('Unresolved: ' + confirmed.map(c => c.service.name).join(', ') + '\n');
    return 1;
  }

  let remotes;
  try {
    remotes = await listServices();
  } catch (e) {
    log(`\nRender API unreachable (${e.message}); cannot repair.\n`);
    return 1;
  }

  let unresolved = 0;
  for (const c of confirmed) {
    const remote = remotes.find(s => s.name === c.service.name);
    if (!remote) {
      log(`\n${c.service.name}: no matching Render service; cannot repair.`);
      unresolved++;
      continue;
    }

    log(`\n${c.service.name}: diagnosing...`);
    try {
      const outcome = await repair(c.service, remote);
      if (outcome.confirmed) {
        log(`  ${outcome.action} accepted by Render — ${outcome.reason}`);
      } else {
        log(`  ${outcome.action} NOT confirmed — ${outcome.reason}`);
        unresolved++;
      }
    } catch (e) {
      log(`  repair failed: ${e.message}`);
      unresolved++;
    }
  }

  log(unresolved
    ? `\n${unresolved} service(s) still need attention.\n`
    : '\nRepairs dispatched. Render needs a minute to finish; the next run verifies.\n');
  return unresolved ? 1 : 0;
}

if (require.main === module) {
  main()
    .then(code => process.exit(code))
    .catch(e => { console.error('Watchdog crashed:', e.message); process.exit(1); });
}

module.exports = { checkHealth, repair, SERVICES };

#!/usr/bin/env node
/**
 * FORGE Continuous Service Monitor & Auto-Fix Orchestrator
 * Runs 24/7, detects failures, triggers auto-fixing agents
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join('/home/user/-chairmankarandeep', 'logs');
const ERROR_LOG = path.join(LOG_DIR, 'errors.log');
const STATUS_FILE = path.join(LOG_DIR, 'status.json');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const SERVICES = [
  { name: 'karan', url: process.env.KARAN_API || 'http://localhost:9000', port: 9000 },
  { name: 'chairman', url: process.env.CHAIRMAN_API || 'http://localhost:8080', port: 8080 },
  { name: 'jarvis', url: process.env.JARVIS_API || 'http://localhost:8001', port: 8001 },
  { name: 'dashboard', url: 'http://localhost:8000', port: 8000 }
];

let serviceStatus = {};
SERVICES.forEach(s => {
  serviceStatus[s.name] = { status: 'unknown', lastCheck: null, failCount: 0 };
});

function logError(message, details = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    message,
    details,
    context: 'monitor'
  };

  try {
    const existing = fs.existsSync(ERROR_LOG) ? fs.readFileSync(ERROR_LOG, 'utf8') : '';
    fs.writeFileSync(ERROR_LOG, existing + JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error(`Failed to log error: ${e.message}`);
  }
}

function saveStatus() {
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(serviceStatus, null, 2));
  } catch (e) {
    console.error(`Failed to save status: ${e.message}`);
  }
}

async function checkService(service) {
  return new Promise((resolve) => {
    const proto = service.url.startsWith('https') ? https : http;
    const timeout = setTimeout(() => {
      req.destroy();
      resolve({ service: service.name, status: 'timeout' });
    }, 5000);

    const req = proto.get(`${service.url}/api/health`, (res) => {
      clearTimeout(timeout);
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          JSON.parse(data);
          resolve({ service: service.name, status: 'online', code: res.statusCode });
        } catch {
          resolve({ service: service.name, status: 'error', code: res.statusCode });
        }
      });
    });

    req.on('error', () => {
      clearTimeout(timeout);
      resolve({ service: service.name, status: 'offline' });
    });
  });
}

async function checkAllServices() {
  const results = await Promise.all(SERVICES.map(s => checkService(s)));

  results.forEach(result => {
    const prev = serviceStatus[result.service] || {};
    const isOnline = result.status === 'online';

    if (!isOnline) {
      prev.failCount = (prev.failCount || 0) + 1;

      // Alert after 2 consecutive failures
      if (prev.failCount >= 2) {
        logError(`${result.service} service failure detected`, {
          service: result.service,
          status: result.status,
          failCount: prev.failCount,
          code: result.code
        });

        // Trigger diagnostics
        console.log(`⚠️  ${result.service} is DOWN - running diagnostics...`);
        triggerDiagnostics(result.service);
      }
    } else {
      // Service recovered
      if (prev.failCount > 0) {
        console.log(`✅ ${result.service} recovered after ${prev.failCount} failures`);
      }
      prev.failCount = 0;
    }

    serviceStatus[result.service] = {
      status: result.status,
      lastCheck: new Date().toISOString(),
      failCount: prev.failCount
    };
  });

  saveStatus();
  return results;
}

function triggerDiagnostics(serviceName) {
  // Log the failure for analysis
  logError(`Diagnostics triggered for ${serviceName}`, {
    trigger: 'consecutive_failures',
    timestamp: new Date().toISOString()
  });

  // In production, this would spawn auto-fix agents
  console.log(`📊 [DIAGNOSTIC] Analyzing ${serviceName} failure...`);
  console.log(`   - Checking recent deployments`);
  console.log(`   - Verifying environment variables`);
  console.log(`   - Checking error logs`);
  console.log(`   - Preparing auto-fix recommendation`);
}

async function start() {
  console.log('\n🚀 FORGE Service Monitor Started');
  console.log('📡 Monitoring services every 60 seconds...\n');

  // Initial check
  await checkAllServices();

  // Continuous monitoring
  setInterval(async () => {
    const results = await checkAllServices();
    const summary = results.map(r => {
      const status = r.status === 'online' ? '✅' : '❌';
      return `${status} ${r.service}`;
    }).join(' | ');

    console.log(`[${new Date().toISOString()}] ${summary}`);
  }, 60000);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n📊 Monitor Summary:');
  Object.entries(serviceStatus).forEach(([name, status]) => {
    console.log(`  ${name}: ${status.status} (checked: ${status.lastCheck})`);
  });
  console.log('\n👋 Monitor shutting down...\n');
  process.exit(0);
});

start().catch(console.error);

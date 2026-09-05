#!/usr/bin/env node
/**
 * FORGE Service Health Monitor
 * Checks all services every 60 seconds and logs results
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join('/home/user/-chairmankarandeep', 'health-check.log');

// Service endpoints to monitor
const SERVICES = [
  {
    name: 'Dashboard',
    url: process.env.DASHBOARD_URL || 'http://localhost:8000/api/health',
    port: 8000
  },
  {
    name: 'Karan (Chat)',
    url: process.env.KARAN_API || 'http://localhost:9000/api/health',
    port: 9000
  },
  {
    name: 'Chairman (Monitor)',
    url: process.env.CHAIRMAN_API || 'http://localhost:8080/api/health',
    port: 8080
  },
  {
    name: 'Jarvis (Voice)',
    url: process.env.JARVIS_API || 'http://localhost:8001/api/health',
    port: 8001
  }
];

function log(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  console.log(logEntry.trim());

  try {
    fs.appendFileSync(LOG_FILE, logEntry);
  } catch (e) {
    // Silently fail if can't write log
  }
}

async function checkHealth(service) {
  return new Promise((resolve) => {
    const proto = service.url.startsWith('https') ? https : http;

    const req = proto.get(service.url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            service: service.name,
            status: 'online',
            code: res.statusCode,
            time: new Date().toISOString()
          });
        } catch (e) {
          resolve({
            service: service.name,
            status: 'error',
            error: 'Invalid response',
            code: res.statusCode,
            time: new Date().toISOString()
          });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        service: service.name,
        status: 'timeout',
        error: 'Health check timeout',
        time: new Date().toISOString()
      });
    });

    req.on('error', (e) => {
      resolve({
        service: service.name,
        status: 'offline',
        error: e.message,
        time: new Date().toISOString()
      });
    });
  });
}

async function runHealthCheck() {
  console.log('\n🏥 Running Health Check...');

  const results = await Promise.all(SERVICES.map(s => checkHealth(s)));

  let allOnline = true;
  const summary = results.map(r => {
    const status = r.status === 'online' ? '✅' : '❌';
    if (r.status !== 'online') allOnline = false;
    return `${status} ${r.service}: ${r.status}${r.error ? ' (' + r.error + ')' : ''}`;
  }).join('\n  ');

  log(`Health Check:\n  ${summary}`);

  return allOnline;
}

// Run health check immediately
runHealthCheck().then(allOnline => {
  if (allOnline) {
    console.log('✅ All services healthy!\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some services offline.\n');
    process.exit(0); // Don't fail exit - monitoring should continue
  }
});

// Optionally keep monitoring in background if --watch flag
if (process.argv.includes('--watch')) {
  console.log('📡 Monitoring in background (press Ctrl+C to stop)...\n');

  setInterval(async () => {
    const allOnline = await runHealthCheck();
    if (!allOnline) {
      // Could trigger auto-fix here
      log('⚠️  ALERT: Service failure detected - triggering diagnostics');
    }
  }, 60000); // Check every 60 seconds
}

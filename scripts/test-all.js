#!/usr/bin/env node
/**
 * FORGE Test Suite
 * Runs all validations before deployment
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    failed++;
  }
}

console.log('\n🧪 Test suite running...\n');

// Test 1: Check all required files exist
test('Required files exist', () => {
  const files = [
    'karan-dashboard.js',
    'karan-chief-operator.js',
    'chairman-enhanced.js',
    'jarvis.js',
    'Dockerfile.karan',
    'Dockerfile.chairman',
    'Dockerfile.jarvis'
  ];
  files.forEach(f => {
    if (!fs.existsSync(path.join('/home/user/-chairmankarandeep', f))) {
      throw new Error(`Missing: ${f}`);
    }
  });
});

// Every other test in this file only greps source text, which cannot catch a file
// that Node refuses to parse. Two shipped syntax errors passed the whole suite
// before this check existed.
test('All service files parse', () => {
  const services = [
    'karan-dashboard.js',
    'karan-chief-operator.js',
    'chairman-enhanced.js',
    'jarvis.js'
  ];
  services.forEach(f => {
    const result = spawnSync(process.execPath, ['--check', path.join('/home/user/-chairmankarandeep', f)]);
    if (result.status !== 0) {
      throw new Error(`${f}: ${result.stderr.toString().split('\n').slice(0, 3).join(' ').trim()}`);
    }
  });
});

// Test 2: Check Dashboard authentication code
test('Dashboard has login endpoint', () => {
  const code = fs.readFileSync('/home/user/-chairmankarandeep/karan-dashboard.js', 'utf8');
  if (!code.includes('/api/auth/login')) throw new Error('No login endpoint found');
  if (code.includes('/api/auth/register')) {
    throw new Error('Register endpoint present; dashboard is single-owner only');
  }
});

// Test 3: Check password hashing is implemented
test('Password hashing configured (PBKDF2)', () => {
  const code = fs.readFileSync('/home/user/-chairmankarandeep/karan-dashboard.js', 'utf8');
  if (!code.includes('pbkdf2Sync')) throw new Error('No PBKDF2 hashing found');
  if (!code.includes('100000')) throw new Error('Not using 100k iterations');
  if (/pbkdf2Sync\([^,]+,\s*['"]/.test(code)) throw new Error('Hardcoded password salt');
});

// Credentials must not be readable from the repo.
test('No credentials committed in source', () => {
  const code = fs.readFileSync('/home/user/-chairmankarandeep/karan-dashboard.js', 'utf8');
  ['OWNER_EMAIL', 'OWNER_PASSWORD', 'SESSION_SECRET'].forEach(name => {
    if (!code.includes(`process.env.${name}`)) throw new Error(`${name} not read from environment`);
    if (new RegExp(`${name}\\s*=\\s*['"][^'"]+['"]`).test(code)) {
      throw new Error(`${name} has a hardcoded value`);
    }
  });
});

// The stale-token redirect loop that made the deployed page spin forever.
test('Login page has no self-redirect loop', () => {
  const code = fs.readFileSync('/home/user/-chairmankarandeep/karan-dashboard.js', 'utf8');
  if (code.includes("localStorage.getItem('sessionId')")) {
    throw new Error('Login page still trusts localStorage for auth state');
  }
  if (code.includes("'/?sessionId='")) throw new Error('Session token passed via URL');
});

// The browser's JavaScript lives inside server-side template literals, so
// `node --check` on this file cannot see it. An escape like \n is consumed by the
// template and reaches the browser as a real newline, breaking the script silently:
// the page renders but no event handler ever attaches. Parse what is actually served.
test('Client-side JavaScript in both pages parses', () => {
  const dash = require('/home/user/-chairmankarandeep/karan-dashboard.js');
  const pages = { login: dash.getLoginHTML(), dashboard: dash.getDashboardHTML() };

  Object.entries(pages).forEach(([label, html]) => {
    const blocks = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
    if (!blocks.length) throw new Error(`${label} page has no script block`);

    blocks.forEach((block, i) => {
      const code = block.replace(/^<script>/, '').replace(/<\/script>$/, '');
      const r = spawnSync(process.execPath, ['--check'], { input: code });
      if (r.status !== 0) {
        const detail = r.stderr.toString().split('\n').filter(Boolean).slice(0, 4).join(' ').trim();
        throw new Error(`${label} page, script ${i + 1}: ${detail}`);
      }
    });
  });
});

// Test 4: Check session management
test('Session management implemented', () => {
  const code = fs.readFileSync('/home/user/-chairmankarandeep/karan-dashboard.js', 'utf8');
  if (!code.includes('createSession')) throw new Error('No session creation');
  if (!code.includes('verifySession')) throw new Error('No session verification');
  if (!code.includes('7 * 24')) throw new Error('No 7-day TTL');
});

// Test 5: Check proxy routes
test('Service proxy routes configured', () => {
  const code = fs.readFileSync('/home/user/-chairmankarandeep/karan-dashboard.js', 'utf8');
  if (!/karan\|chairman\|jarvis/.test(code)) throw new Error('No backend proxy route');
  if (!code.includes('x-service-token')) throw new Error('Proxy does not identify itself to backends');
  if (!code.includes("pathname === '/api/status'")) throw new Error('No server-side status endpoint');
});

// Health must be checked server-side; a browser fetch straight to the backends is
// cross-origin and silently fails for any service without CORS headers.
test('Status checks do not rely on backend CORS', () => {
  const code = fs.readFileSync('/home/user/-chairmankarandeep/karan-dashboard.js', 'utf8');
  if (/fetch\(\s*'?\$\{(KARAN|CHAIRMAN|JARVIS)_API\}/.test(code)) {
    throw new Error('Page fetches a backend URL directly from the browser');
  }
});

// Test 6: Check error handling
test('Proper error handling in place', () => {
  const code = fs.readFileSync('/home/user/-chairmankarandeep/karan-dashboard.js', 'utf8');
  if (!code.includes('try {') || !code.includes('catch(')) throw new Error('No try-catch blocks');
  if (!code.includes('statusCode') && !code.includes('res.ok')) throw new Error('No HTTP status checking');
});

// Test 7: Check Dockerfiles have health checks
test('Dockerfiles have health checks', () => {
  ['Dockerfile.karan', 'Dockerfile.chairman', 'Dockerfile.jarvis'].forEach(f => {
    const code = fs.readFileSync(path.join('/home/user/-chairmankarandeep', f), 'utf8');
    if (!code.includes('HEALTHCHECK')) throw new Error(`${f} missing HEALTHCHECK`);
  });
});

// Test 8: Check CORS headers
test('CORS headers configured', () => {
  const code = fs.readFileSync('/home/user/-chairmankarandeep/karan-dashboard.js', 'utf8');
  if (!code.includes('Access-Control-Allow-Origin')) throw new Error('No CORS header');
});

console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('❌ Tests failed. Fix errors before deploying.\n');
  process.exit(1);
} else {
  console.log('✅ All tests passed! Ready to deploy.\n');
  process.exit(0);
}

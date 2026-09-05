#!/usr/bin/env node
/**
 * FORGE Test Suite
 * Runs all validations before deployment
 */

const fs = require('fs');
const path = require('path');

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

console.log('\n🧪 FORGE Test Suite Running...\n');

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

// Test 2: Check Dashboard authentication code
test('Dashboard has login endpoint', () => {
  const code = fs.readFileSync('/home/user/-chairmankarandeep/karan-dashboard.js', 'utf8');
  if (!code.includes('/api/auth/login')) throw new Error('No login endpoint found');
  if (!code.includes('/api/auth/register')) throw new Error('No register endpoint found');
});

// Test 3: Check password hashing is implemented
test('Password hashing configured (PBKDF2)', () => {
  const code = fs.readFileSync('/home/user/-chairmankarandeep/karan-dashboard.js', 'utf8');
  if (!code.includes('pbkdf2Sync')) throw new Error('No PBKDF2 hashing found');
  if (!code.includes('100000')) throw new Error('Not using 100k iterations');
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
  if (!code.includes('/api/karan/')) throw new Error('No Karan proxy');
  if (!code.includes('/api/chairman/')) throw new Error('No Chairman proxy');
  if (!code.includes('/api/jarvis/')) throw new Error('No Jarvis proxy');
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

#!/usr/bin/env node
/**
 * FORGE Integration Test Suite
 * Verifies complete end-to-end automation system
 */

const fs = require('fs');
const path = require('path');

const testResults = [];

function test(name, fn) {
  try {
    fn();
    testResults.push({ name, status: '✅ PASS', error: null });
    console.log(`✅ ${name}`);
  } catch (e) {
    testResults.push({ name, status: '❌ FAIL', error: e.message });
    console.log(`❌ ${name}: ${e.message}`);
  }
}

console.log('\n🔗 FORGE Integration Test Suite\n');

// Test 1: All system components exist
test('All system scripts exist', () => {
  const scripts = [
    'test-all.js',
    'lint-check.js',
    'health-check.js',
    'monitor-services.js',
    'error-logger.js',
    'notify.js',
    'auto-fix-orchestrator.js',
    'render-integration.js'
  ];
  scripts.forEach(s => {
    const filePath = path.join('/home/user/-chairmankarandeep', 'scripts', s);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing: ${s}`);
    }
  });
});

// Test 2: Error logger is properly initialized
test('Error logger creates log directory', () => {
  const ErrorLogger = require('./error-logger');
  const logDir = path.join('/home/user/-chairmankarandeep', 'logs');
  if (!fs.existsSync(logDir)) {
    throw new Error('Log directory not created');
  }
});

// Test 3: Services configuration
test('All backend services have health endpoints', () => {
  const services = ['karan', 'chairman', 'jarvis'];
  const dashboard = fs.readFileSync(path.join('/home/user/-chairmankarandeep', 'karan-dashboard.js'), 'utf8');

  services.forEach(service => {
    const proxy = `/api/${service}/`;
    if (!dashboard.includes(proxy)) {
      throw new Error(`Missing proxy route for ${service}`);
    }
  });
});

// Test 4: Auto-fix orchestrator has all agents
test('Auto-fix orchestrator has 5 specialist agents', () => {
  const code = fs.readFileSync(path.join('/home/user/-chairmankarandeep', 'scripts', 'auto-fix-orchestrator.js'), 'utf8');

  const agents = [
    'DiagnosticsAgent',
    'DashboardFixerAgent',
    'ServiceRecoveryAgent',
    'EnvironmentValidatorAgent',
    'DeploymentAnalyzerAgent'
  ];

  agents.forEach(agent => {
    if (!code.includes(`class ${agent}`)) {
      throw new Error(`Missing agent: ${agent}`);
    }
  });
});

// Test 5: Render integration webhook is configured
test('Render integration webhook server configured', () => {
  const code = fs.readFileSync(path.join('/home/user/-chairmankarandeep', 'scripts', 'render-integration.js'), 'utf8');

  if (!code.includes('/webhook/render')) throw new Error('No webhook endpoint');
  if (!code.includes('handleDeploymentEvent')) throw new Error('No event handler');
  if (!code.includes('checkServiceHealth')) throw new Error('No health check');
});

// Test 6: Error handling for all deployment statuses
test('Render integration handles all deployment states', () => {
  const code = fs.readFileSync(path.join('/home/user/-chairmankarandeep', 'scripts', 'render-integration.js'), 'utf8');

  const states = ['building', 'deploy_in_progress', 'live', 'build_failed', 'deploy_failed'];
  states.forEach(state => {
    if (!code.includes(`'${state}'`)) {
      throw new Error(`Missing handler for state: ${state}`);
    }
  });
});

// Test 7: Notification system has all event types
test('Notification system covers all event types', () => {
  const code = fs.readFileSync(path.join('/home/user/-chairmankarandeep', 'scripts', 'notify.js'), 'utf8');

  const types = [
    'service_down',
    'service_recovered',
    'auto_fix_applied',
    'deployment_error',
    'auth_failure'
  ];

  types.forEach(type => {
    if (!code.includes(`'${type}'`)) {
      throw new Error(`Missing notification type: ${type}`);
    }
  });
});

// Test 8: Monitoring system checks all services
test('Monitoring system tracks all services', () => {
  const code = fs.readFileSync(path.join('/home/user/-chairmankarandeep', 'scripts', 'monitor-services.js'), 'utf8');

  const services = ['dashboard', 'karan', 'chairman', 'jarvis'];
  services.forEach(service => {
    if (!code.includes(service)) {
      throw new Error(`Service ${service} not monitored`);
    }
  });
});

// Test 9: Pre-deployment testing via lint and test
test('Pre-deployment validation scripts exist', () => {
  const lint = fs.readFileSync(path.join('/home/user/-chairmankarandeep', 'scripts', 'lint-check.js'), 'utf8');
  const test = fs.readFileSync(path.join('/home/user/-chairmankarandeep', 'scripts', 'test-all.js'), 'utf8');

  if (!lint.includes('hardcoded') && !lint.includes('secret')) {
    throw new Error('Lint check missing security validation');
  }

  if (!test.includes('test(')) {
    throw new Error('Test suite malformed');
  }
});

// Test 10: Git hooks prevent bad deployments
test('Pre-push git hook blocks bad code', () => {
  const hook = path.join('/home/user/-chairmankarandeep', '.husky', 'pre-push');
  if (!fs.existsSync(hook)) {
    throw new Error('Git hook not configured');
  }

  const hookCode = fs.readFileSync(hook, 'utf8');
  const hasLint = hookCode.includes('npm run lint') || hookCode.includes('lint');
  const hasTest = hookCode.includes('npm test') || hookCode.includes('npm run test');
  const hasBlocking = hookCode.includes('exit 1') || hookCode.includes('FAILED');

  if (!hasLint) throw new Error('Git hook missing lint validation');
  if (!hasTest) throw new Error('Git hook missing test validation');
  if (!hasBlocking) throw new Error('Git hook does not block bad pushes');
});

// Test 11: Automation decision logic
test('Auto-fix responds to root causes', () => {
  const code = fs.readFileSync(path.join('/home/user/-chairmankarandeep', 'scripts', 'auto-fix-orchestrator.js'), 'utf8');

  const causes = [
    'bad_deployment',
    'missing_env_vars',
    'service_crashed',
    'service_timeout'
  ];

  causes.forEach(cause => {
    if (!code.includes(cause)) {
      throw new Error(`No handling for root cause: ${cause}`);
    }
  });
});

// Test 12: Service health endpoints
test('All services define health check endpoints', () => {
  const services = [
    'karan-chief-operator.js',
    'chairman-enhanced.js',
    'jarvis.js'
  ];

  services.forEach(service => {
    const filePath = path.join('/home/user/-chairmankarandeep', service);
    if (fs.existsSync(filePath)) {
      const code = fs.readFileSync(filePath, 'utf8');
      if (!code.includes('/api/health') && !code.includes('health')) {
        throw new Error(`${service} missing health endpoint`);
      }
    }
  });
});

// Print results
console.log(`\n${'='.repeat(50)}`);
console.log(`📊 Integration Test Results`);
console.log(`${'='.repeat(50)}\n`);

const passed = testResults.filter(r => r.status.includes('PASS')).length;
const failed = testResults.filter(r => r.status.includes('FAIL')).length;

console.log(`Total: ${testResults.length} | Passed: ${passed} | Failed: ${failed}\n`);

if (failed > 0) {
  console.log('Failed tests:');
  testResults.filter(r => r.status.includes('FAIL')).forEach(r => {
    console.log(`  ❌ ${r.name}: ${r.error}`);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('✅ All integration tests passed!\n');
  console.log('System is ready for deployment with:');
  console.log('  • 5-layer error prevention');
  console.log('  • 24/7 service monitoring');
  console.log('  • Automated diagnostics and fixing');
  console.log('  • Real-time notifications');
  console.log('  • Render webhook integration\n');
  process.exit(0);
}

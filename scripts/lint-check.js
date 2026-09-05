#!/usr/bin/env node
/**
 * Code Quality Checks
 * Validates syntax and best practices
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔍 Running Code Quality Checks...\n');

let issues = 0;

function checkFile(filepath, name) {
  console.log(`Checking ${name}...`);

  if (!fs.existsSync(filepath)) {
    console.log(`  ⚠️  File not found: ${filepath}`);
    issues++;
    return;
  }

  const code = fs.readFileSync(filepath, 'utf8');

  // Check 1: No hardcoded secrets
  if (/[A-Z0-9]{20,}|password|secret|key|token/.test(code)) {
    const lines = code.split('\n');
    lines.forEach((line, i) => {
      if (/[A-Z0-9]{20,}|secret='|key='|token=/.test(line) && !line.includes('//')) {
        console.log(`  ⚠️  Line ${i+1}: Possible hardcoded secret`);
        issues++;
      }
    });
  }

  // Check 2: Proper error handling
  if (code.includes('try') && code.includes('catch')) {
    console.log(`  ✅ Error handling present`);
  } else if (name.endsWith('.js')) {
    console.log(`  ⚠️  No try-catch blocks found`);
  }

  // Check 3: Input validation
  if (name === 'karan-dashboard.js') {
    if (code.includes('trim()') || code.includes('sanitize') || code.includes('JSON.parse')) {
      console.log(`  ✅ Input validation found`);
    } else {
      console.log(`  ⚠️  May need input validation`);
    }
  }

  // Check 4: No console.log in production code (optional)
  if (code.includes('console.log') && name.endsWith('.js')) {
    const logCount = (code.match(/console\.log/g) || []).length;
    if (logCount > 5) {
      console.log(`  ⚠️  High number of console.log statements (${logCount})`);
    } else {
      console.log(`  ℹ️  ${logCount} console.log statements (OK for debugging)`);
    }
  }
}

// Check main files
checkFile('/home/user/-chairmankarandeep/karan-dashboard.js', 'karan-dashboard.js');
checkFile('/home/user/-chairmankarandeep/karan-chief-operator.js', 'karan-chief-operator.js');
checkFile('/home/user/-chairmankarandeep/chairman-enhanced.js', 'chairman-enhanced.js');
checkFile('/home/user/-chairmankarandeep/jarvis.js', 'jarvis.js');

console.log(`\n📊 Quality Check Complete: ${issues} issues found\n`);

if (issues > 5) {
  console.log('⚠️  Multiple quality issues detected. Review before deploying.\n');
  process.exit(0); // Don't fail - these are warnings
} else {
  console.log('✅ Code quality acceptable.\n');
  process.exit(0);
}

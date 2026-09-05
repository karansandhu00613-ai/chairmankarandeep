#!/usr/bin/env node
/**
 * FORGE Centralized Error Logger
 * Aggregates errors from all services and provides diagnostics
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join('/home/user/-chairmankarandeep', 'logs');
const ERRORS_FILE = path.join(LOG_DIR, 'errors.log');
const SUMMARY_FILE = path.join(LOG_DIR, 'error-summary.json');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

class ErrorLogger {
  static log(service, error, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      service,
      error: typeof error === 'string' ? error : error.message,
      stack: error.stack,
      context,
      severity: context.severity || 'medium'
    };

    try {
      fs.appendFileSync(ERRORS_FILE, JSON.stringify(entry) + '\n');
      this.updateSummary(service, error, context);
    } catch (e) {
      console.error(`Logger error: ${e.message}`);
    }
  }

  static updateSummary(service, error, context) {
    try {
      let summary = {};
      if (fs.existsSync(SUMMARY_FILE)) {
        summary = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8'));
      }

      if (!summary[service]) {
        summary[service] = {
          errorCount: 0,
          lastError: null,
          errors: []
        };
      }

      summary[service].errorCount++;
      summary[service].lastError = new Date().toISOString();
      summary[service].errors.push({
        timestamp: new Date().toISOString(),
        error: error.message || error,
        severity: context.severity || 'medium'
      });

      // Keep last 50 errors per service
      if (summary[service].errors.length > 50) {
        summary[service].errors = summary[service].errors.slice(-50);
      }

      fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
    } catch (e) {
      console.error(`Failed to update summary: ${e.message}`);
    }
  }

  static getRecentErrors(service, limit = 20) {
    try {
      if (!fs.existsSync(ERRORS_FILE)) return [];

      const lines = fs.readFileSync(ERRORS_FILE, 'utf8').split('\n').filter(l => l);
      const errors = lines.map(l => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      }).filter(e => e && (!service || e.service === service));

      return errors.slice(-limit);
    } catch (e) {
      console.error(`Failed to read errors: ${e.message}`);
      return [];
    }
  }

  static getSummary() {
    try {
      if (fs.existsSync(SUMMARY_FILE)) {
        return JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8'));
      }
    } catch (e) {
      console.error(`Failed to read summary: ${e.message}`);
    }
    return {};
  }

  static displayDashboard() {
    console.log('\n📊 FORGE Error Dashboard\n');
    const summary = this.getSummary();

    Object.entries(summary).forEach(([service, data]) => {
      console.log(`${service.toUpperCase()}`);
      console.log(`  Errors: ${data.errorCount}`);
      console.log(`  Last: ${data.lastError}`);
      console.log(`  Recent issues:`);

      data.errors.slice(-5).forEach(e => {
        console.log(`    • ${e.timestamp}: ${e.error} (${e.severity})`);
      });
      console.log('');
    });
  }
}

// CLI Interface
if (require.main === module) {
  const cmd = process.argv[2];

  switch (cmd) {
    case 'dashboard':
      ErrorLogger.displayDashboard();
      break;
    case 'recent':
      const service = process.argv[3];
      const errors = ErrorLogger.getRecentErrors(service, 20);
      console.log(JSON.stringify(errors, null, 2));
      break;
    case 'summary':
      console.log(JSON.stringify(ErrorLogger.getSummary(), null, 2));
      break;
    default:
      console.log('Usage:');
      console.log('  node error-logger.js dashboard');
      console.log('  node error-logger.js recent [service]');
      console.log('  node error-logger.js summary');
  }
}

module.exports = ErrorLogger;

#!/usr/bin/env node
/**
 * FORGE Notification System
 * Alerts user AFTER issues are detected and fixed
 */

const fs = require('fs');
const path = require('path');

class Notifier {
  static formatMessage(event) {
    const { type, service, error, fix, timestamp } = event;

    switch (type) {
      case 'service_down':
        return `⚠️ SERVICE ALERT: ${service} was offline\n` +
          `Issue: ${error}\n` +
          `Detected: ${timestamp}`;

      case 'service_recovered':
        return `✅ SERVICE RECOVERED: ${service}\n` +
          `Status: Back online after diagnostics\n` +
          `Fixed: ${timestamp}`;

      case 'auto_fix_applied':
        return `🔧 AUTO-FIX APPLIED: ${service}\n` +
          `Fix: ${fix}\n` +
          `Applied: ${timestamp}\n` +
          `Status: Service should be operational now`;

      case 'deployment_error':
        return `❌ DEPLOYMENT ISSUE: ${service}\n` +
          `Error: ${error}\n` +
          `Time: ${timestamp}`;

      case 'auth_failure':
        return `🔐 AUTH ISSUE DETECTED: ${service}\n` +
          `Details: ${error}\n` +
          `Status: Fix has been applied`;

      default:
        return `📢 FORGE Notification:\n${JSON.stringify(event, null, 2)}`;
    }
  }

  static createNotification(event) {
    const notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: event.type,
      service: event.service,
      message: this.formatMessage(event),
      timestamp: new Date().toISOString(),
      status: 'pending',
      severity: event.severity || 'medium'
    };

    return notification;
  }

  static sendNotification(notification) {
    // In production, this would integrate with:
    // - Email (Resend, SendGrid)
    // - SMS (Twilio)
    // - Slack/Discord webhooks
    // - Push notifications
    // - Dashboard alerts

    console.log('\n📬 FORGE NOTIFICATION');
    console.log('═'.repeat(50));
    console.log(notification.message);
    console.log('═'.repeat(50));
    console.log(`Status: ${notification.severity.toUpperCase()}`);
    console.log(`Time: ${notification.timestamp}\n`);

    // Save notification
    const logDir = path.join('/home/user/-chairmankarandeep', 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const notifFile = path.join(logDir, 'notifications.log');
    try {
      fs.appendFileSync(notifFile, JSON.stringify(notification) + '\n');
    } catch (e) {
      console.error(`Failed to save notification: ${e.message}`);
    }

    return notification;
  }

  static notifyDashboardDown() {
    const notification = this.createNotification({
      type: 'service_down',
      service: 'Dashboard',
      error: 'Service health check failed',
      severity: 'critical',
      timestamp: new Date().toISOString()
    });
    return this.sendNotification(notification);
  }

  static notifyServiceRecovered(service) {
    const notification = this.createNotification({
      type: 'service_recovered',
      service,
      severity: 'low',
      timestamp: new Date().toISOString()
    });
    return this.sendNotification(notification);
  }

  static notifyAutoFixApplied(service, fix) {
    const notification = this.createNotification({
      type: 'auto_fix_applied',
      service,
      fix,
      severity: 'medium',
      timestamp: new Date().toISOString()
    });
    return this.sendNotification(notification);
  }

  static notifyDeploymentError(service, error) {
    const notification = this.createNotification({
      type: 'deployment_error',
      service,
      error,
      severity: 'critical',
      timestamp: new Date().toISOString()
    });
    return this.sendNotification(notification);
  }

  static notifyAuthIssue(service, error) {
    const notification = this.createNotification({
      type: 'auth_failure',
      service,
      error,
      severity: 'high',
      timestamp: new Date().toISOString()
    });
    return this.sendNotification(notification);
  }
}

// Export for use in other modules
module.exports = Notifier;

// CLI usage
if (require.main === module) {
  const cmd = process.argv[2];
  const service = process.argv[3];
  const message = process.argv[4];

  if (cmd === 'test') {
    if (service === 'recovered') {
      Notifier.notifyServiceRecovered('Dashboard');
    } else if (service === 'down') {
      Notifier.notifyDashboardDown();
    } else if (service === 'fix') {
      Notifier.notifyAutoFixApplied(service, message || 'Restarted service');
    }
  }
}

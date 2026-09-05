#!/usr/bin/env node
/**
 * FORGE Render Integration
 * Connects to Render webhooks for deployment events
 * Triggers monitoring and auto-fix on deployment
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const ErrorLogger = require('./error-logger');
const Notifier = require('./notify');

const PORT = process.env.WEBHOOK_PORT || 3000;
const DEPLOYMENT_LOG = path.join('/home/user/-chairmankarandeep', 'logs', 'deployments.log');

class RenderIntegration {
  constructor() {
    this.deployments = {};
  }

  async handleDeploymentEvent(event) {
    const { service, status, commitSha, timestamp } = event;

    console.log(`\n📦 Render Deployment Event: ${service} - ${status}`);
    console.log(`   Commit: ${commitSha}`);

    this.logDeployment({ service, status, commitSha, timestamp });

    switch (status) {
      case 'building':
        console.log(`   🔨 Building...`);
        break;

      case 'deploy_in_progress':
        console.log(`   🚀 Deploying...`);
        break;

      case 'live':
        console.log(`   ✅ Deployment successful`);
        await this.onDeploymentSuccess(service, commitSha);
        break;

      case 'build_failed':
      case 'deploy_failed':
        console.log(`   ❌ Deployment failed`);
        await this.onDeploymentFailure(service, status, commitSha);
        break;
    }
  }

  async onDeploymentSuccess(service, commitSha) {
    console.log(`   📊 Running post-deployment checks...`);

    // Wait 10 seconds for service to stabilize
    await new Promise(r => setTimeout(r, 10000));

    // Run health checks
    const isHealthy = await this.checkServiceHealth(service);

    if (isHealthy) {
      console.log(`   ✅ ${service} is healthy after deployment`);
      Notifier.notifyServiceRecovered(service);
    } else {
      console.log(`   ⚠️  ${service} health check failed after deployment`);
      ErrorLogger.log(service, `Post-deployment health check failed for commit ${commitSha}`, {
        severity: 'high'
      });
      Notifier.notifyDeploymentError(service, 'Health check failed after deployment');
    }
  }

  async onDeploymentFailure(service, reason, commitSha) {
    console.log(`   🔄 Analyzing deployment failure...`);

    const analysis = {
      service,
      reason,
      commit: commitSha,
      recommendation: this.getRecoveryRecommendation(reason)
    };

    ErrorLogger.log(service, `Deployment failed: ${reason}`, analysis);
    Notifier.notifyDeploymentError(service, `Deployment failed (${reason}). Rolling back...`);

    // Attempt automatic rollback
    if (reason === 'build_failed') {
      console.log(`   ↩️  Triggering automatic rollback...`);
      await this.triggerRollback(service);
    }
  }

  async checkServiceHealth(service) {
    const healthUrl = {
      'karan': process.env.KARAN_API || 'http://localhost:9000',
      'chairman': process.env.CHAIRMAN_API || 'http://localhost:8080',
      'jarvis': process.env.JARVIS_API || 'http://localhost:8001',
      'dashboard': 'http://localhost:8000'
    }[service];

    if (!healthUrl) return false;

    return new Promise((resolve) => {
      const req = http.get(`${healthUrl}/api/health`, { timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try {
            JSON.parse(data);
            resolve(res.statusCode === 200);
          } catch {
            resolve(false);
          }
        });
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  getRecoveryRecommendation(reason) {
    const recommendations = {
      'build_failed': 'Check build logs. May need to fix dependencies or syntax errors.',
      'deploy_failed': 'Check deploy logs. May need to verify environment variables.',
      'health_check_failed': 'Service not responding to health checks. Check logs.'
    };
    return recommendations[reason] || 'Check deployment logs for details.';
  }

  async triggerRollback(service) {
    console.log(`   ⏮️  Rolling back ${service} to previous version...`);
    // In production: would call Render API to restart previous deployment
    // For now: just log the action
    this.logDeployment({
      service,
      action: 'rollback_triggered',
      timestamp: new Date().toISOString()
    });
  }

  logDeployment(entry) {
    try {
      fs.appendFileSync(DEPLOYMENT_LOG, JSON.stringify({
        timestamp: new Date().toISOString(),
        ...entry
      }) + '\n');
    } catch (e) {
      console.error(`Failed to log deployment: ${e.message}`);
    }
  }

  startWebhookServer() {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/webhook/render') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const event = JSON.parse(body);
            await this.handleDeploymentEvent(event);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            console.error(`Webhook error: ${e.message}`);
            res.writeHead(400);
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      } else if (req.url === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(PORT, () => {
      console.log(`\n🔗 Render Integration Webhook Server Running`);
      console.log(`   URL: http://localhost:${PORT}/webhook/render`);
      console.log(`   Health: http://localhost:${PORT}/health\n`);
    });

    process.on('SIGINT', () => {
      console.log('\n👋 Webhook server shutting down...');
      server.close();
      process.exit(0);
    });
  }
}

// Start if called directly
if (require.main === module) {
  const integration = new RenderIntegration();

  if (process.argv.includes('--server')) {
    integration.startWebhookServer();
  } else {
    console.log('Render Integration loaded (use --server to start webhook listener)');
  }
}

module.exports = RenderIntegration;

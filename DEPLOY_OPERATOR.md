# Karan Chief Operator - Deployment Guide

Complete guide to deploy Karan Chief Operator to any cloud platform.

## Quick Start (Local)

```bash
# Run immediately
node karan-chief-operator.js

# Open browser
open http://localhost:9000
```

## Cloud Deployment

### Option 1: Render (Recommended - Free)

1. **Create Repository**:
```bash
git add karan-chief-operator.js README_KARAN_OPERATOR.md .env.example
git commit -m "Add Karan Chief Operator"
git push origin main
```

2. **Deploy on Render**:
   - Go to https://render.com
   - Click "New Web Service"
   - Select your repository
   - Name: `karan-operator`
   - Runtime: Node
   - Build Command: (leave empty)
   - Start Command: `node karan-chief-operator.js`

3. **Environment Variables**:
```
PORT=10000
PRODUCTION=1
NODE_ENV=production
STORE=github
GH_TOKEN=ghp_xxxxxxxxx
GH_REPO=youruser/karan-state
CHAIRMAN_API=http://localhost:8080
JARVIS_API=http://localhost:8001
SLACK_WEBHOOK=https://hooks.slack.com/...
DISCORD_WEBHOOK=https://discordapp.com/...
```

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment
   - URL: `https://karan-operator-xxxx.onrender.com`

### Option 2: Railway.app

```bash
# 1. Go to https://railway.app
# 2. Create new project
# 3. Connect GitHub repo
# 4. Select Node.js
# 5. Set environment variables (same as Render)
# 6. Deploy
```

### Option 3: Heroku

```bash
# Install Heroku CLI
npm install -g heroku

# Login
heroku login

# Create app
heroku create karan-operator

# Set environment variables
heroku config:set PRODUCTION=1
heroku config:set NODE_ENV=production
heroku config:set STORE=github
heroku config:set GH_TOKEN=ghp_xxxxxx
heroku config:set GH_REPO=youruser/karan-state

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### Option 4: AWS EC2 + PM2

```bash
# SSH into EC2 instance
ssh -i key.pem ec2-user@instance-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Clone repo
git clone your-repo.git
cd your-repo

# Create .env file
cp .env.example .env
# Edit .env with your values

# Start with PM2
export PRODUCTION=1
export NODE_ENV=production
pm2 start karan-chief-operator.js --name "karan"
pm2 save
pm2 startup

# Map domain with Route53
```

### Option 5: Docker + Cloud Run

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY karan-chief-operator.js .
EXPOSE 9000
ENV PORT=9000 PRODUCTION=1
CMD ["node", "karan-chief-operator.js"]
```

Deploy to Google Cloud Run:
```bash
docker build -t karan:latest .
docker tag karan:latest gcr.io/your-project/karan:latest
docker push gcr.io/your-project/karan:latest

gcloud run deploy karan \
  --image gcr.io/your-project/karan:latest \
  --platform managed \
  --region us-central1 \
  --set-env-vars "PRODUCTION=1,STORE=github,GH_TOKEN=xxx,GH_REPO=xxx"
```

## Setup GitHub State Storage

Karan needs persistent storage (GitHub acts as the database):

1. **Create Private Repository**:
   - Go to https://github.com/new
   - Name: `karan-state`
   - Make PRIVATE
   - Initialize with README

2. **Create GitHub Token**:
   - Settings → Developer settings → Personal access tokens
   - Generate new token
   - Select `repo` scope
   - Copy token

3. **Set Environment Variables**:
   ```
   GH_TOKEN=ghp_xxxxxxxxxxxxx
   GH_REPO=youruser/karan-state
   GH_BRANCH=main
   ```

## Integration Setup

### Chairman Agent OS

If you're running Chairman on the same cloud provider:

1. **Configure Connection**:
   ```
   CHAIRMAN_API=http://localhost:8080
   ```

2. **In Karan Dashboard**:
   - Go to Settings
   - Enable "Chairman Agent OS"
   - Karan will sync with Chairman

3. **Features Available**:
   - View all monitors
   - Get status updates
   - Create monitors
   - Receive alerts

### Jarvis Voice Assistant

Setup voice commands:

1. **Ensure Jarvis is Running**:
   ```
   JARVIS_API=http://localhost:8001
   ```

2. **Enable in Karan**:
   - Settings → Jarvis
   - Toggle ON
   - Jarvis is now integrated

3. **Voice Commands**:
   - "Jarvis, create a reminder"
   - "Jarvis, add to my tasks"
   - "Jarvis, check status"

### Slack Notifications

1. **Create Incoming Webhook**:
   - Go to your Slack workspace
   - Manage Apps → Custom Integrations
   - Incoming Webhooks → Create New
   - Choose channel
   - Copy webhook URL

2. **Set Environment Variable**:
   ```
   SLACK_WEBHOOK=https://hooks.slack.com/services/...
   ```

3. **Notifications Sent To**:
   - New tasks created
   - Task completed
   - Alerts from Chairman
   - Jarvis updates

### Discord Notifications

1. **Create Webhook**:
   - Server Settings → Integrations
   - Webhooks → Create Webhook
   - Name: "Karan"
   - Copy webhook URL

2. **Set Environment Variable**:
   ```
   DISCORD_WEBHOOK=https://discordapp.com/api/webhooks/...
   ```

3. **Channel Activity**:
   - Task updates
   - Completion notifications
   - Monitoring alerts

## Environment Configuration

Complete `.env` file:

```bash
# Server
PORT=9000
NODE_ENV=production
PRODUCTION=1

# Storage
STORE=github
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GH_REPO=youruser/karan-state
GH_BRANCH=main

# Integrations
SLACK_WEBHOOK=https://hooks.slack.com/services/...
DISCORD_WEBHOOK=https://discordapp.com/api/webhooks/...

# External Services
CHAIRMAN_API=http://localhost:8080
JARVIS_API=http://localhost:8001

# Database (Optional - for future)
DATABASE_URL=postgresql://user:pass@localhost/karan
```

## Monitoring & Logs

### Render
- Dashboard → Logs
- Real-time streaming
- Filter by level

### Railway
- Deployments → Logs
- Copy log output
- Tail logs

### Heroku
```bash
heroku logs --tail
heroku logs --num 100
```

### AWS EC2
```bash
pm2 logs karan
pm2 logs karan --lines 100
```

### Google Cloud Run
```bash
gcloud run services describe karan --platform managed
gcloud run services logs read karan
```

## Scaling

### For Small Team (1-10 people)
- Render free tier (5GB RAM)
- Basic storage on GitHub
- No database needed

### For Medium Team (10-100 people)
- Render paid ($7/month+)
- PostgreSQL database
- Dedicated monitoring

### For Large Scale (100+ people)
- AWS ECS/EKS
- RDS PostgreSQL
- CloudFront CDN
- ElastiCache for sessions

## Security Checklist

✅ Keep GitHub token secret (use env vars)  
✅ Make karan-state repo PRIVATE  
✅ Use HTTPS in production  
✅ Enable 2FA on GitHub  
✅ Rotate credentials regularly  
✅ Monitor logs for errors  
✅ Use strong owner password  
✅ Enable Slack/Discord alerts  

## Troubleshooting

### Port Already in Use
```bash
# Change port
PORT=9001 node karan-chief-operator.js

# Or kill process
lsof -i :9000 | tail -1 | awk '{print $2}' | xargs kill -9
```

### Storage Init Failed
- ✅ GitHub repo exists (karan-state)
- ✅ Repository is PRIVATE
- ✅ GH_TOKEN is valid
- ✅ Token has `repo` scope
- ✅ Repo is accessible from server

### Chairman Not Connected
- ✅ Chairman is running on port 8080
- ✅ Network can reach Chairman API
- ✅ CHAIRMAN_API env var is set
- ✅ Chairman health check passes: `curl http://localhost:8080/api/health`

### Jarvis Not Working
- ✅ Jarvis is running on port 8001
- ✅ JARVIS_API env var is set
- ✅ Network can reach Jarvis
- ✅ Jarvis authentication works

### Slack/Discord Not Sending
- ✅ Webhook URLs are correct
- ✅ Webhooks are still valid (not revoked)
- ✅ Channel still exists
- ✅ Bot has permissions

### WebSocket Connection Fails
- ✅ Cloud provider supports WebSocket (all major ones do)
- ✅ Firewall not blocking upgrade
- ✅ /api/health endpoint works first

## Performance Optimization

1. **Use GitHub Storage** (auto-synced, no DB)
2. **Enable Caching** (sessions in memory)
3. **Monitor Response Times** (dashboard metrics)
4. **Scale Horizontally** (multiple instances)
5. **Use CDN** (static files)

## Continuous Deployment

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Karan

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Render
        run: curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}
```

### Render Auto-Deploy

1. Dashboard → Environment → Auto-Deploy
2. Select branch (main)
3. Auto-deploys on push

## Backup & Recovery

### Backup GitHub State

```bash
# Clone your karan-state repo
git clone https://github.com/youruser/karan-state.git karan-backup

# Keep it safe - this is your database!
```

### Recover from Backup

```bash
# If state gets corrupted:
git push origin HEAD --force
```

## Next Steps

1. ✅ Deploy Karan to your cloud provider
2. ✅ Configure GitHub state storage
3. ✅ Set up integrations (Slack/Discord)
4. ✅ Connect Chairman Agent OS
5. ✅ Enable Jarvis voice assistant
6. ✅ Start using Karan as your personal operator!

---

**Questions?** Check the logs, verify env vars, and ensure all integrations are configured.

**Ready to deploy?** Your Karan Chief Operator awaits! 🚀

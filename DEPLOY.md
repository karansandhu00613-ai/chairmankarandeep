# Chairman Agent OS - Deployment Guide

A comprehensive guide to deploy Chairman Agent OS to the cloud with all features enabled.

## Quick Start (Local Development)

```bash
# Install & run locally
node chairman-enhanced.js

# Open browser to http://localhost:8080
```

## Cloud Deployment Options

### Option 1: Render (Recommended - Free Tier Available)

1. **Create Render Account**: https://render.com

2. **Connect GitHub Repository**:
   - Go to Dashboard → New Web Service
   - Connect your GitHub repo
   - Select `main` branch

3. **Configure Service**:
   - **Name**: `chairman-agent-os`
   - **Runtime**: Node
   - **Build Command**: `npm install` (or leave empty)
   - **Start Command**: `node chairman-enhanced.js`

4. **Environment Variables**:
   ```
   PORT=10000
   PRODUCTION=1
   NODE_ENV=production
   STORE=github
   GH_TOKEN=<your_github_token>
   GH_REPO=<your_user>/<your_repo>
   SLACK_WEBHOOK=<optional_slack_url>
   DISCORD_WEBHOOK=<optional_discord_url>
   ```

5. **Deploy**: Click "Create Web Service" and watch logs

Your app will be live at `https://chairman-xxxxx.onrender.com`

---

### Option 2: Railway.app

1. **Connect Repository**: https://railway.app
2. **Add Service** → Select Node
3. **Environment Variables** (same as Render above)
4. **Deploy**: Push to `main` branch, auto-deploys

---

### Option 3: Heroku

```bash
# Install Heroku CLI
npm install -g heroku

# Login
heroku login

# Create app
heroku create chairman-agent-os

# Set environment variables
heroku config:set PRODUCTION=1 NODE_ENV=production
heroku config:set STORE=github GH_TOKEN=<token> GH_REPO=<repo>

# Deploy
git push heroku main
```

---

### Option 4: AWS (EC2 + PM2)

```bash
# SSH into EC2 instance
ssh -i your-key.pem ec2-user@your-instance

# Install Node
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Clone repo and start
git clone https://github.com/youruser/yourrepo.git
cd yourrepo
export PRODUCTION=1
export NODE_ENV=production
export STORE=github
export GH_TOKEN=your_token
export GH_REPO=youruser/yourrepo

# Start with PM2
pm2 start chairman-enhanced.js --name "chairman"
pm2 save
pm2 startup

# Map domain with Route53 or your DNS provider
```

---

### Option 5: Docker + Cloud Run (Google Cloud)

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY chairman-enhanced.js .
EXPOSE 8080
ENV PORT=8080 PRODUCTION=1
CMD ["node", "chairman-enhanced.js"]
```

Deploy:

```bash
# Build image
docker build -t chairman:latest .

# Push to Google Cloud Registry
docker push gcr.io/your-project/chairman:latest

# Deploy to Cloud Run
gcloud run deploy chairman --image gcr.io/your-project/chairman:latest \
  --platform managed \
  --region us-central1 \
  --set-env-vars "PRODUCTION=1,STORE=github,GH_TOKEN=xxx,GH_REPO=xxx"
```

---

## GitHub Setup for State Storage

Chairman needs a private GitHub repo to store its state (ephemeral cloud filesystems lose data on restart).

1. **Create Private Repo**: 
   ```bash
   # Go to https://github.com/new
   # Name it: chairman-state
   # Set to PRIVATE
   # Initialize with README
   ```

2. **Create Personal Access Token**:
   - Go to Settings → Developer settings → Personal access tokens
   - Click "Generate new token"
   - Select `repo` scope (read/write contents)
   - Copy token

3. **Set Environment Variables**:
   ```
   GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxx
   GH_REPO=youruser/chairman-state
   GH_BRANCH=main  # optional
   ```

---

## Integration Setup

### Slack Notifications

1. Go to your workspace → Manage Apps → Build
2. Click "Create New App" → "From scratch"
3. Name: `Chairman Agent OS`
4. Select your workspace
5. Go to "Incoming Webhooks" → Create New Webhook
6. Select channel (e.g., #alerts)
7. Copy webhook URL to `SLACK_WEBHOOK` env var

### Discord Notifications

1. Go to your Discord server → Settings → Integrations
2. Click "Webhooks" → Create Webhook
3. Name it `Chairman`
4. Copy webhook URL to `DISCORD_WEBHOOK` env var

### Email (SMTP)

For **Gmail**:
1. Enable 2FA on your Google account
2. Go to https://myaccount.google.com/apppasswords
3. Select "Mail" and "Windows Computer" (or Linux/Mac)
4. Generate 16-character password
5. Set environment variables:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your.email@gmail.com
   SMTP_PASS=<16-char password>
   ```

For **other providers**, use their SMTP details:
- SendGrid: `smtp.sendgrid.net:587`
- Mailgun: `smtp.mailgun.org:587`
- AWS SES: `email-smtp.region.amazonaws.com:587`

---

## Monitoring & Maintenance

### View Logs

**Render**: Dashboard → Logs  
**Railway**: Deployments → Logs  
**Heroku**: `heroku logs --tail`  
**AWS EC2**: `pm2 logs chairman`

### Scale Up

Most cloud providers auto-scale. For manual scaling:
- **Render Pro**: Increase instance size in settings
- **AWS**: Use Auto Scaling Groups
- **Kubernetes**: Deploy chairman as container, scale replicas

### Database (Optional PostgreSQL)

To add a real database instead of JSON files:

1. Provision PostgreSQL:
   - Render: Add PostgreSQL database
   - Railway: Add Postgres service
   - AWS RDS: Create database

2. Set `DATABASE_URL` env var to connection string

3. Modify STORE to use database (requires code changes)

---

## Security Best Practices

✅ **Do This**:
- Use HTTPS on production (auto on Render, Railway, Heroku)
- Keep GitHub token secret (use env vars, never commit)
- Make `chairman-state` repo PRIVATE
- Use strong owner password
- Enable Slack/Discord for alerts
- Monitor logs for errors

❌ **Don't Do This**:
- Commit `.env` files
- Use weak passwords
- Share GitHub tokens
- Run on public WiFi
- Disable HTTPS on production

---

## Troubleshooting

### "STORE INIT FAILED"
- GitHub repo doesn't exist
- GH_TOKEN is invalid
- Repo is public (make it private)

### "Port already in use"
- Change `PORT` env variable
- Kill process: `lsof -i :8080 | kill -9 <PID>`

### WebSocket connection fails
- Cloud provider must support WebSocket (all do)
- Check firewall rules
- Ensure `/api/` prefix works first

### Email not sending
- SMTP credentials wrong
- App password (Gmail) not set correctly
- Check spam folder
- Enable "Less secure app access" (Gmail)

### Monitors not running
- Check `/api/health` endpoint
- Verify URLs are valid
- Check logs for probe errors

---

## Useful Commands

```bash
# Test health endpoint
curl https://chairman-xxxxx.onrender.com/api/health

# View metrics
curl "https://chairman-xxxxx.onrender.com/api/dashboard?sessionId=xxxxx"

# Create monitor
curl -X POST https://chairman-xxxxx.onrender.com/api/monitors \
  -H "Content-Type: application/json" \
  -d '{"url":"https://google.com","name":"Google"}'
```

---

## Next Steps

1. Deploy to your chosen cloud provider
2. Open the dashboard
3. Set up email/Slack/Discord
4. Create your first monitors
5. Test notifications
6. Share with your team!

**Questions?** Check logs, verify env vars, and ensure GitHub repo is private.

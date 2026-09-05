# Deploy Karan Dashboard to Render (5 Minutes)

Complete step-by-step guide to deploy your AI operating system to production.

## Prerequisites

1. **GitHub Account** (repo already pushed ✓)
2. **Render Account** (free tier available): https://render.com
3. **GitHub Personal Access Token** (for state storage)

## Step 1: Create GitHub State Storage Repo

This is where your app stores persistent data (authentication, API keys, settings).

```bash
# On GitHub, create new private repository:
# Name: karan-state
# Description: Persistent storage for Karan Dashboard
# Privacy: PRIVATE (important!)
# Initialize with README
```

## Step 2: Generate GitHub Personal Access Token

```
Settings → Developer settings → Personal access tokens → Tokens (classic)
Click "Generate new token"

Scopes needed:
✓ repo (full control of private repositories)

Copy the token (shown once only!)
Store somewhere safe
```

## Step 3: Deploy to Render

### 3a. Connect GitHub
1. Go to https://render.com
2. Click "New" → "Web Service"
3. Select your repository: `karansandhu00613-ai/-chairmankarandeep`
4. Click "Connect"

### 3b. Configure Service

**Settings:**

| Field | Value |
|-------|-------|
| **Name** | karan-dashboard |
| **Runtime** | Node |
| **Build Command** | (leave empty) |
| **Start Command** | `node karan-dashboard.js` |
| **Plan** | Free (or Paid for more resources) |
| **Region** | Choose closest to you |

### 3c. Set Environment Variables

In Render dashboard, add these under "Environment":

```
PORT=8000
NODE_ENV=production
PRODUCTION=1
STORE=github
GH_TOKEN=ghp_xxxxxxxxxxxxx  (paste your token)
GH_REPO=your-username/karan-state
GH_BRANCH=main
KARAN_API=http://karan:9000
CHAIRMAN_API=http://chairman:8080
JARVIS_API=http://jarvis:8001
```

**Replace:**
- `ghp_xxxxxxxxxxxxx` with your GitHub token
- `your-username` with your GitHub username

### 3d. Deploy

Click "Create Web Service"

**Render will:**
1. Pull code from GitHub
2. Install Node.js
3. Start `karan-dashboard.js`
4. Assign a public URL (e.g., `https://karan-dashboard-abc123.onrender.com`)

**Wait 2-3 minutes for deployment.**

## Step 4: Verify Deployment

Once Render shows "Live" (green):

```bash
# Test the API
curl https://your-render-url.onrender.com/api/health

# Open in browser
https://your-render-url.onrender.com

# Register your account (first user = admin)
```

## Step 5: Run All Services

You now have the dashboard live! To run companion services:

### Option A: Local Services (Dashboard in cloud, others local)
```bash
# Terminal 1: Dashboard is on Render
# Terminal 2: Run locally
docker-compose up
```

Set these env vars in Render:
```
KARAN_API=http://localhost:9000
CHAIRMAN_API=http://localhost:8080
JARVIS_API=http://localhost:8001
```

### Option B: All Services on Cloud (Recommended)

Deploy each service separately on Render:

1. **Karan** (port 9000)
   - Start Command: `node karan-chief-operator.js`
   
2. **Chairman** (port 8080)
   - Start Command: `node chairman-enhanced.js`
   
3. **Jarvis** (port 8001)
   - Start Command: `node jarvis.js`

Then in dashboard environment variables, set:
```
KARAN_API=https://karan-xxxxx.onrender.com
CHAIRMAN_API=https://chairman-xxxxx.onrender.com
JARVIS_API=https://jarvis-xxxxx.onrender.com
```

## Step 6: Set Up Custom Domain (Optional)

In Render dashboard:
1. Go to Settings
2. Custom Domain
3. Add your domain (e.g., `karan.yourcompany.com`)
4. Follow DNS instructions
5. Wait 5-10 minutes for SSL

## Troubleshooting

### "Build failed"
- Check Render logs: Dashboard → Logs
- Verify `Start Command` is exactly: `node karan-dashboard.js`
- Ensure all required files are in repository

### "Cannot connect to services"
- If running locally: Set `KARAN_API=http://localhost:9000` etc.
- If in cloud: Set full URLs like `https://karan-xxxxx.onrender.com`
- Test connectivity: `curl https://your-url/api/health`

### "Cannot access state storage"
- Verify GH_TOKEN is correct and not expired
- Verify karan-state repo exists and is PRIVATE
- Check token has "repo" scope permission

### App loads but shows "Initializing..."
- Check browser console for errors (F12)
- Verify all environment variables are set
- Check Render logs for startup errors

## Monitoring

### View Live Logs
```
Render Dashboard → Logs tab
Streams in real-time as users interact
```

### Monitor Performance
```
Render Dashboard → Metrics tab
CPU, Memory, Network usage
```

### Check Service Health
```bash
curl https://your-render-url.onrender.com/api/health
```

## Cost Estimate

| Service | Render Free | Render Paid |
|---------|------------|-------------|
| Dashboard | $0 (500 hrs/mo) | $7/mo |
| Karan | $0 | $7/mo |
| Chairman | $0 | $7/mo |
| Jarvis | $0 | $7/mo |
| **Total** | **$0** | **$28/mo** |

**Free tier** includes 500 compute hours/month per service. Enough for testing and light usage.

**Paid tier** for production (24/7 uptime, more resources).

## Next Steps

### 1. First Users
- Share URL with team: `https://your-render-url.onrender.com`
- They can register and use dashboard

### 2. Generate API Keys
- Login as admin
- Go to Settings → API Keys
- Click "Generate Key"
- Share with developers for programmatic access

### 3. Connect Integrations
- Get Slack/Discord webhook URLs
- Add to Render environment variables
- Restart service

### 4. Monitor Production
- Check logs daily
- Watch error rates
- Track usage growth

### 5. Scale Up
When free tier isn't enough:
- Switch to Paid plan ($7/mo per service)
- Add database (PostgreSQL $15/mo)
- Use auto-scaling for traffic spikes

## Advanced: Staging Environment

Create separate staging instance:

1. Create new Render service (same as above)
2. Point to same GitHub repo
3. Set env var: `STAGE=staging`
4. Deploy to `karan-staging.onrender.com`

**Benefits:**
- Test changes before production
- No impact on live users
- Easy rollback

## Backup & Recovery

Your data is stored in GitHub (karan-state repo):

```bash
# Backup locally
git clone https://github.com/your-username/karan-state.git karan-backup

# Restore if needed
cp karan-backup/dashboard.json .
git add dashboard.json
git commit -m "Restore from backup"
git push
# Restart Render service
```

## Support

### Check Status
```bash
# Is dashboard online?
curl -I https://your-render-url.onrender.com

# API responding?
curl https://your-render-url.onrender.com/api/health
```

### Debug Issues
1. Check Render logs
2. Verify environment variables
3. Test locally: `npm test` or `node karan-dashboard.js`
4. Review GitHub issues

## Production Checklist

- ✓ GitHub token created and set
- ✓ karan-state repo created (PRIVATE)
- ✓ All env vars configured
- ✓ Service deployed (shows "Live")
- ✓ Can access dashboard
- ✓ Can register account
- ✓ Can generate API key
- ✓ Custom domain configured (optional)
- ✓ Backup strategy in place

---

**You're live!** Your AI operating system is now accessible worldwide at your Render URL.

Next: Invite team, generate API keys, start integrating with your workflows.

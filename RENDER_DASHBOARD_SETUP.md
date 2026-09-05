# Render Dashboard Deployment Guide

This guide shows how to deploy the FORGE Dashboard to Render.

## Step 1: Prerequisites

- GitHub repo pushed to: `karansandhu00613-ai/-chairmankarandeep`
- Render account at: https://render.com
- GitHub Personal Access Token with "repo" scope (save this securely)
- Private GitHub repo for state storage: `karan-state`

## Step 2: On Render Dashboard

1. Click **"New" → "Web Service"**
2. Select repository: **karansandhu00613-ai/-chairmankarandeep**
3. Click **"Connect"**

## Step 3: Configure Service

Fill in these exact values:

| Field | Value |
|-------|-------|
| Name | `karan-dashboard` |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `node karan-dashboard.js` |
| Plan | `Free` |
| Region | Closest to you (e.g., `us-east`, `eu-west`, `sin`) |
| Dockerfile Path | (leave empty - Render will auto-detect) |

Click **"Create Web Service"**

## Step 4: Add Environment Variables

Once service is created, go to **Settings → Environment** and add:

```
PORT=8000
NODE_ENV=production
PRODUCTION=1
STORE=github
GH_TOKEN=ghp_xxxxx (your GitHub token)
GH_REPO=your-username/karan-state
GH_BRANCH=main
KARAN_API=http://localhost:9000
CHAIRMAN_API=http://localhost:8080
JARVIS_API=http://localhost:8001
```

Click **"Save"**. Render will auto-restart.

## Step 5: Verify

Once Render shows "Live" (green):

1. Click the service name
2. Copy the URL (e.g., `https://karan-dashboard-abc123.onrender.com`)
3. Open in browser
4. You should see FORGE login page
5. Click "Create account" and register

## Step 6: Local Backend Services (Optional)

To run backend services locally while Dashboard is on Render:

```bash
docker-compose up
```

Then update Render environment to:
```
KARAN_API=http://localhost:9000
CHAIRMAN_API=http://localhost:8080
JARVIS_API=http://localhost:8001
```

## Troubleshooting

**"Deploy failed" or "Cannot find module"**
- Ensure Build Command is: `npm install`
- Ensure Start Command is: `node karan-dashboard.js`
- Check environment variables (typos in GH_TOKEN, GH_REPO, etc.)

**"Cannot connect to services"**
- Dashboard on Render cannot reach local services
- Either run backend on Render too, or keep them local in development
- Update KARAN_API, CHAIRMAN_API, JARVIS_API environment variables to match your setup

**GitHub state storage errors**
- Verify GH_TOKEN is valid (not expired)
- Verify karan-state repo exists and is PRIVATE
- Verify GH_REPO matches: `your-username/karan-state`

## Next Steps

1. **Add custom domain**: Go to Settings → Custom Domain, add `forge.ai`
2. **Deploy backend services**: Create separate Render services for Karan, Chairman, Jarvis
3. **Enable GitHub storage**: Once state syncs to karan-state repo, you have persistent backup
4. **Launch public**: Share your Render URL with team, then register domain

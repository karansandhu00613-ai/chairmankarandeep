# Phase 2: Deploy Backend Services to Render

This guide deploys the three core FORGE services to Render:
- **Karan** (Chat AI) - Port 9000
- **Chairman** (Monitoring) - Port 8080  
- **Jarvis** (Voice) - Port 8001

## Prerequisites

✅ You already have:
- Render account (from Phase 1)
- GitHub repo: `karansandhu00613-ai/-chairmankarandeep`
- GitHub Personal Access Token saved
- Dashboard running at: `https://karan-dashboard.onrender.com`

## Step 1: Deploy Karan Service (Chat)

### On Render Dashboard:

1. Click **"New" → "Web Service"**
2. Select repository: **karansandhu00613-ai/-chairmankarandeep**
3. Click **"Connect"**

### Configure Service:

| Field | Value |
|-------|-------|
| Name | `karan-service` |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `node karan-chief-operator.js` |
| Plan | `Free` |
| Region | Same as dashboard (e.g., `us-east`) |
| Dockerfile Path | `Dockerfile.karan` |

Click **"Create Web Service"**

### Add Environment Variables:

Once deployed, go to **Settings → Environment**:

```
PORT=9000
NODE_ENV=production
PRODUCTION=1
STORE=github
GH_TOKEN=ghp_xxxxx (your GitHub token)
GH_REPO=your-username/karan-state
GH_BRANCH=main
```

Click **"Save"** - Render auto-restarts

### Verify Karan is Live:

- Render shows service as "Live" (green)
- Copy URL (e.g., `https://karan-service-xyz123.onrender.com`)
- Test endpoint: `https://karan-service-xyz123.onrender.com/api/health`
  - Should return: `{"status":"ok"}`

**Save this URL for Step 4.**

---

## Step 2: Deploy Chairman Service (Monitoring)

### On Render Dashboard:

1. Click **"New" → "Web Service"**
2. Select repository: **karansandhu00613-ai/-chairmankarandeep**
3. Click **"Connect"**

### Configure Service:

| Field | Value |
|-------|-------|
| Name | `chairman-service` |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `node chairman-enhanced.js` |
| Plan | `Free` |
| Region | Same as dashboard |
| Dockerfile Path | `Dockerfile.chairman` |

Click **"Create Web Service"**

### Add Environment Variables:

Once deployed, go to **Settings → Environment**:

```
PORT=8080
NODE_ENV=production
PRODUCTION=1
STORE=github
GH_TOKEN=ghp_xxxxx (your GitHub token)
GH_REPO=your-username/karan-state
GH_BRANCH=main
```

Click **"Save"** - Render auto-restarts

### Verify Chairman is Live:

- Render shows service as "Live" (green)
- Copy URL (e.g., `https://chairman-service-xyz123.onrender.com`)
- Test endpoint: `https://chairman-service-xyz123.onrender.com/api/health`
  - Should return: `{"status":"ok"}`

**Save this URL for Step 4.**

---

## Step 3: Deploy Jarvis Service (Voice)

### On Render Dashboard:

1. Click **"New" → "Web Service"**
2. Select repository: **karansandhu00613-ai/-chairmankarandeep**
3. Click **"Connect"**

### Configure Service:

| Field | Value |
|-------|-------|
| Name | `jarvis-service` |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `node jarvis.js` |
| Plan | `Free` |
| Region | Same as dashboard |
| Dockerfile Path | `Dockerfile.jarvis` |

Click **"Create Web Service"**

### Add Environment Variables:

Once deployed, go to **Settings → Environment**:

```
PORT=8001
NODE_ENV=production
PRODUCTION=1
STORE=github
GH_TOKEN=ghp_xxxxx (your GitHub token)
GH_REPO=your-username/karan-state
GH_BRANCH=main
```

Click **"Save"** - Render auto-restarts

### Verify Jarvis is Live:

- Render shows service as "Live" (green)
- Copy URL (e.g., `https://jarvis-service-xyz123.onrender.com`)
- Test endpoint: `https://jarvis-service-xyz123.onrender.com/api/health`
  - Should return: `{"status":"ok"}`

**Save this URL for Step 4.**

---

## Step 4: Connect Services to Dashboard

Now update your **karan-dashboard** service with the backend URLs.

### On Render Dashboard:

1. Click on **`karan-dashboard`** service
2. Go to **Settings → Environment**
3. Update/add these variables:

```
KARAN_API=https://karan-service-xyz123.onrender.com
CHAIRMAN_API=https://chairman-service-xyz123.onrender.com
JARVIS_API=https://jarvis-service-xyz123.onrender.com
```

Replace `xyz123` with your actual service URLs from Steps 1-3.

4. Click **"Save"** - Dashboard auto-restarts

### Verify Connection:

- Open dashboard: `https://karan-dashboard.onrender.com`
- Log in with your account
- Try each feature:
  - **Chat**: Should connect to Karan service
  - **Monitoring**: Should connect to Chairman service
  - **Voice**: Should connect to Jarvis service

---

## Troubleshooting

### Service shows "Deploy Failed"

**Check Render logs:**
1. Click service name
2. Go to "Logs" tab
3. Look for error messages

**Common fixes:**
- Ensure **Dockerfile path** is correct (e.g., `Dockerfile.karan`)
- Ensure **Start Command** matches service (e.g., `node karan-chief-operator.js`)
- Ensure **Build Command** is `npm install`
- Check environment variables have no typos

### Services deployed but Dashboard shows errors

**Verify inter-service communication:**
1. Check each service health endpoint:
   - `https://karan-service-xyz123.onrender.com/api/health`
   - `https://chairman-service-xyz123.onrender.com/api/health`
   - `https://jarvis-service-xyz123.onrender.com/api/health`
   
2. All should return `{"status":"ok"}`

3. If any fails, check that service's Render logs

**Update environment variables:**
- Go back to Step 4
- Verify URLs are correct
- No trailing slashes
- Click "Save" and wait for restart

### "Cannot connect to service" in Dashboard logs

**Causes:**
- Wrong service URL in KARAN_API/CHAIRMAN_API/JARVIS_API
- Service not yet deployed and live
- Typo in environment variable name

**Solution:**
- Re-check URLs from Render dashboard
- Ensure all three services show "Live" status
- Update variables and click "Save"

---

## What's Next?

✅ **Phase 2 Complete:** All backend services are deployed and connected

### Phase 3: ProductHunt Launch (Next)

1. Create ProductHunt account
2. List FORGE on ProductHunt
3. Launch Wednesday 9am PT
4. Share on Twitter, HackerNews, Dev.to

### Phase 4: Stripe Monetization

1. Set up Stripe account
2. Add $29/month Pro tier
3. Integrate billing into Dashboard

---

## Service Architecture

```
┌─────────────────────────────────────────┐
│     FORGE Dashboard (Port 8000)         │
│     https://karan-dashboard.onrender.com │
└────────────┬────────────┬────────────────┘
             │            │
      ┌──────▼───┐  ┌──────▼───┐
      │  Karan   │  │ Chairman │  ┌─────────┐
      │ (9000)   │  │  (8080)  │  │ Jarvis  │
      │  Chat    │  │Monitor   │  │ (8001)  │
      │          │  │          │  │ Voice   │
      └──────────┘  └──────────┘  └─────────┘

All services use:
- GitHub state storage (karan-state repo)
- Multi-user authentication
- API key management
- WebSocket real-time updates
```

---

## Monitoring Services

Check service health from Render dashboard:

1. **Metrics Tab:**
   - CPU usage
   - Memory usage
   - Request count

2. **Logs Tab:**
   - Real-time service logs
   - Errors and warnings

3. **Events Tab:**
   - Deployment history
   - Restarts and failures

---

## Cost Summary (Free Tier)

- Dashboard: Free (500 hrs/month)
- Karan: Free (500 hrs/month)
- Chairman: Free (500 hrs/month)
- Jarvis: Free (500 hrs/month)
- **Total: $0 during beta** 🎉

Once you have paying customers, upgrade to paid plans:
- Each service: $7/month minimum
- **Total: $28/month for all 4 services**

---

## Questions?

Refer back to:
- Phase 1 guide: `RENDER_DASHBOARD_SETUP.md`
- Local setup: `QUICKSTART.md`
- API docs: Check each service's `/api` endpoint

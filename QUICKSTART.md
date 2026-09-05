# FORGE - Quick Start Guide

The self-contained AI operating system. Complete control, zero external dependencies.

*Formerly: Karan Dashboard (internal codename)*

## 🚀 One-Command Start

```bash
docker-compose up
```

That's it. Wait 30 seconds for services to initialize.

## 🌐 Access

Open your browser:
- **Unified Dashboard**: http://localhost:8000
- **API Docs**: http://localhost:9000 (Karan backend)
- **Monitoring**: http://localhost:8080 (Chairman)
- **Voice**: http://localhost:8001 (Jarvis)

## 📋 First Steps

### 1. Register Your Account
- Go to http://localhost:8000
- Click "Create account"
- Set your email and password
- You become admin (first user)

### 2. Generate API Keys (Admin)
- Go to Settings → API Keys
- Click "Generate Key"
- Save it securely (shown once)
- Use for programmatic access

### 3. Start Using
- **Chat**: Type messages to Karan
- **Monitor**: See Chairman dashboards
- **Tasks**: Create and manage tasks
- **Voice**: Use Jarvis for voice commands
- **Integrations**: Connect Slack, Discord, email (optional)

## 🔧 Configuration

### Environment Variables (.env file)

**Local Development** (default):
```bash
# Storage
STORE=local

# Services
KARAN_API=http://localhost:9000
CHAIRMAN_API=http://localhost:8080
JARVIS_API=http://localhost:8001
```

**Cloud Deployment** (set these):
```bash
# Storage (GitHub)
STORE=github
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxx
GH_REPO=youruser/karan-state
GH_BRANCH=main

# Notifications (optional)
SLACK_WEBHOOK=https://hooks.slack.com/services/...
DISCORD_WEBHOOK=https://discordapp.com/api/webhooks/...

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=app-password
```

### Docker Compose Customization

Edit `docker-compose.yml` to change ports, volumes, or service options.

Example - Change dashboard port to 3000:
```yaml
dashboard:
  ports:
    - "3000:8000"  # Now accessible at localhost:3000
```

## 📦 What's Included

### Services
1. **Karan Dashboard** (8000) - Unified web interface
2. **Karan Chief Operator** (9000) - AI chat & task management
3. **Chairman Agent OS** (8080) - Monitoring & automation
4. **Jarvis** (8001) - Voice assistant

### Features
- ✅ Multi-user authentication with API keys
- ✅ Real-time WebSocket updates
- ✅ Task & project management
- ✅ Service monitoring
- ✅ Voice command integration
- ✅ Webhook integrations (Slack, Discord)
- ✅ Persistent state storage (local or GitHub)
- ✅ Role-based access control (admin/user)

## 🚀 Deployment

### Local
```bash
docker-compose up
```

### Cloud (Render, Railway, AWS)
1. Push code to GitHub
2. Set environment variables
3. Deploy container
4. Access at your cloud URL

### Recommended Cloud Providers
- **Render**: https://render.com (free tier available)
- **Railway**: https://railway.app
- **AWS EC2**: Configure security groups for ports 8000-8001, 8080, 9000
- **DigitalOcean**: Docker + 1-click deployment

## 🔐 Security Notes

- **First user becomes admin** - guards against unauthorized access
- **API keys are hashed** - never stored in plain text
- **Sessions expire after 7 days** - automatic cleanup
- **HTTPS recommended for cloud** - use reverse proxy (nginx, Caddy)
- **GitHub storage is private** - only you control the repo

### Quick Cloud Setup (Render)

1. Push to GitHub
2. Create `.env.production` with:
   ```
   PORT=8000
   PRODUCTION=1
   STORE=github
   GH_TOKEN=ghp_xxxxx
   GH_REPO=youruser/karan-state
   ```
3. Deploy on Render as Node.js service
4. Set environment variables in Render dashboard
5. Access at `https://your-app.onrender.com`

## 📞 API Usage

### Login
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password"}'
```

### Generate API Key (admin only)
```bash
curl -X POST http://localhost:8000/api/keys/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SESSION_ID" \
  -d '{"targetUserId":"user123"}'
```

### Use API Key for Requests
```bash
curl http://localhost:8000/api/chairman/monitors?apiKey=YOUR_API_KEY
```

### Send Message via API
```bash
curl -X POST http://localhost:9000/api/chat \
  -H "Content-Type: application/json" \
  -H "apiKey: YOUR_API_KEY" \
  -d '{"message":"what is the status"}'
```

## 🐛 Troubleshooting

**Dashboard won't connect**
- Check all services are running: `docker ps`
- Verify port 8000 is free: `lsof -i :8000`
- Check logs: `docker logs karan-dashboard`

**Can't login**
- Is the dashboard service running? `docker ps | grep dashboard`
- Check database file: `ls -la dashboard.json`
- Try clearing browser localStorage and refresh

**Services not communicating**
- Verify network: `docker network ls`
- Check service health: `curl http://localhost:9000/api/health`
- Review docker-compose.yml for correct service names

**Out of storage**
- Clean old logs: `docker logs --tail=100 karan-dashboard > /dev/null`
- Check disk usage: `df -h`
- Move database to external storage

## 📊 Monitoring

### View Live Logs
```bash
docker-compose logs -f dashboard
docker-compose logs -f karan
docker-compose logs -f chairman
docker-compose logs -f jarvis
```

### System Status
```bash
docker stats
```

## 🔄 Updates

### Update All Services
```bash
git pull
docker-compose down
docker-compose build --no-cache
docker-compose up
```

### Backup Your Data
```bash
cp dashboard.json dashboard.json.backup
cp karan-chief-operator.js karan-chief-operator.js.backup
```

## 💡 Tips

1. **Run in background**: `docker-compose up -d`
2. **Stop all services**: `docker-compose down`
3. **Remove data**: `docker-compose down -v`
4. **See what's running**: `docker ps`
5. **SSH into container**: `docker exec -it karan-dashboard sh`

## 📚 Architecture

```
┌─────────────────────────────────────────────┐
│        KARAN DASHBOARD (8000)               │
│     Single Entry Point for Everything       │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Karan   │  │ Chairman │  │  Jarvis  │ │
│  │  (9000)  │  │  (8080)  │  │ (8001)   │ │
│  └──────────┘  └──────────┘  └──────────┘ │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │    Persistent State Storage          │  │
│  │  (Local JSON or GitHub)              │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │    Integrations                      │  │
│  │  Slack • Discord • Email • GitHub    │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## 🎯 What's NOT in This System

✅ What IS included:
- Complete AI operating system
- Multi-user support
- Self-contained (no external AI)
- Cloud-deployable
- Real-time updates

❌ What you manage separately:
- Domain + SSL (use Render/Railway)
- Email delivery (SMTP)
- Database backups (use GitHub storage)

## 🤝 Next Steps

1. **Try it**: `docker-compose up` → login at http://localhost:8000
2. **Customize**: Edit .env for your integrations
3. **Deploy**: Push to cloud (Render 1-click recommended)
4. **Automate**: Create tasks via API

---

**That's it!** You now have a complete, self-contained AI operating system running entirely on your infrastructure. No external AI dependencies. Everything under your control.

Questions? Check the service logs or review DEPLOY_OPERATOR.md for advanced options.

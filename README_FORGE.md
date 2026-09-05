# 🔨 FORGE - The Self-Contained AI Operating System

**Build. Orchestrate. Automate.**

Complete AI operating system with multi-user dashboard, chat interface, monitoring, voice commands, and task management. No external AI dependencies. Deploy anywhere.

---

## ⚡ What is FORGE?

FORGE is a unified AI operating system that brings together:

- **💬 Chat Interface** — Natural language control (formerly Karan)
- **📊 Monitoring** — Real-time dashboards (Chairman)
- **🎤 Voice Commands** — Hands-free automation (Jarvis)
- **✓ Task Management** — Organize your work
- **🔐 Multi-User** — Team collaboration with secure auth
- **🌐 Deploy Anywhere** — Local, cloud, on-premise

All in one ChatGPT/Claude-like web interface. Zero external AI dependencies.

---

## 🎯 Features

✅ **Self-Contained** — No ChatGPT, Claude, or external APIs needed  
✅ **Multi-User** — Secure authentication, API keys, role-based access  
✅ **Real-Time** — WebSocket updates across all connected users  
✅ **Cloud-Ready** — Deploy to Render, Railway, AWS in 5 minutes  
✅ **API-First** — Programmatic access via REST + keys  
✅ **Private** — Your data, your infrastructure  
✅ **Customizable** — Full source code, modify anything  
✅ **Affordable** — $0 self-hosted or $29/mo cloud  

---

## 🚀 Quick Start

### Local (30 seconds)
```bash
docker-compose up
# Open http://localhost:8000
```

### Cloud (5 minutes)
See **DEPLOY_RENDER.md** for step-by-step Render deployment.

### First Steps
1. Register account (first user = admin)
2. Generate API keys in Settings
3. Invite team members
4. Start automating

---

## 📋 What You Get

### Dashboard (Port 8000)
- ChatGPT/Claude-like interface
- Multi-user authentication
- API key management
- Real-time updates
- Service monitoring

### API Backend (Port 9000)
- REST endpoints
- WebSocket for real-time data
- Task management
- Automation engine

### Monitoring (Port 8080)
- Real-time dashboards
- System health checks
- Alert management

### Voice Assistant (Port 8001)
- Wake word detection
- Natural language commands
- Integration with core system

---

## 💰 Pricing

| Plan | Cost | For |
|------|------|-----|
| **Starter** | $0/mo | Self-hosted, DIY |
| **Pro** | $29/mo | Cloud hosting, managed |
| **Enterprise** | Custom | On-premise, white-label |

---

## 🔧 Architecture

```
┌─────────────────────────────────────────┐
│     FORGE Dashboard (Port 8000)         │
│  ChatGPT-like Unified Interface         │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────┐ │
│  │   Chat   │  │ Monitoring │ │Voice │ │
│  │ (9000)   │  │  (8080)    │ │(8001)│ │
│  └──────────┘  └──────────┘  └──────┘ │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   Data Storage                  │   │
│  │   (Local JSON or GitHub)        │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   Integrations                  │   │
│  │   Slack • Discord • Email       │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## 📖 Documentation

- **[QUICKSTART.md](QUICKSTART.md)** — 5-minute setup guide
- **[DEPLOY_RENDER.md](DEPLOY_RENDER.md)** — Cloud deployment (Render, Railway, AWS)
- **[DEPLOY_OPERATOR.md](DEPLOY_OPERATOR.md)** — Advanced deployment options
- **[BRAND_RESEARCH.md](BRAND_RESEARCH.md)** — Trademark & branding info
- **[API.md](API.md)** — REST API reference (coming soon)

---

## 🔐 Security

- **Passwords:** PBKDF2 hashing (100,000 iterations)
- **API Keys:** SHA-256 hashed, never plain text
- **Sessions:** 7-day TTL with auto cleanup
- **Data:** Stored locally or in private GitHub repo
- **Encryption:** TLS/HTTPS for all cloud deployments

---

## 🎯 Use Cases

### Personal Productivity
- Organize tasks and projects
- Get automated status updates
- Voice-control your workflows

### Team Collaboration
- Share dashboards across team
- Manage access with API keys
- Track who did what (audit logs)

### Enterprise Automation
- Monitor multiple systems
- Alert on problems
- Integrate with existing tools
- Custom branding via white-label

### Developer Tools
- API-first design
- Webhooks for integrations
- Extend with custom code
- Self-host for privacy

---

## 🚀 Deploy to Production

**Recommended:** Render.com (free tier available)

See **DEPLOY_RENDER.md** for:
- GitHub token setup
- Environment configuration
- Domain mapping
- Monitoring & logs

---

## 🤝 Contributing

FORGE is open source. Contributions welcome!

```bash
git clone https://github.com/YOUR_REPO/forge.git
cd forge
docker-compose up
```

See CONTRIBUTING.md for guidelines (coming soon).

---

## 📞 Support

- **Docs:** See markdown files in repo
- **Issues:** GitHub Issues
- **Email:** support@forge.ai (coming soon)

---

## 📈 Roadmap

### Q1 2024
- ✅ Core dashboard
- ✅ Multi-user auth
- ✅ Service orchestration

### Q2 2024
- 🔄 Stripe billing integration
- 🔄 Custom branding (white-label)
- 🔄 Advanced analytics

### Q3 2024
- 📅 Workflow builder UI
- 📅 Advanced scheduling
- 📅 Enterprise SSO (SAML)

### Q4 2024
- 📅 Mobile app
- 📅 Advanced security
- 📅 Ecosystem marketplace

---

## 📝 Naming

**FORGE** is the official public name.

**Internal codename:** Karan Chief Operator (for backward compatibility)

### Why FORGE?
- **Build:** Create powerful automations
- **Orchestrate:** Control all your services
- **Automate:** Handle tasks without manual work
- **Trust:** Strong, reliable branding

---

## 🎓 License

MIT License - See LICENSE.md

---

## 🙏 Credits

Built by Karan Sandhu as a complete AI operating system for personal and team automation.

Powered by Node.js, no external AI dependencies.

---

## 💬 Community

- **GitHub:** https://github.com/karansandhu00613-ai/-chairmankarandeep
- **Twitter:** @ForgeAI (coming soon)
- **Discord:** (coming soon)
- **Email:** hello@forge.ai

---

**Ready to FORGE your AI future?**

👉 [Get Started](QUICKSTART.md) | [Deploy to Cloud](DEPLOY_RENDER.md) | [GitHub](https://github.com/karansandhu00613-ai/-chairmankarandeep)

---

Made with 🔨 by Karan Sandhu  
*The self-contained AI OS that puts you in control.*

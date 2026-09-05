# Karan Chief Operator v1.0

🤖 **Your Personal AI Assistant Platform** — Chat interface with task automation, project management, and deep integration with Chairman Agent OS + Jarvis voice assistant.

## What is Karan Chief Operator?

Karan Chief Operator is an all-in-one personal productivity platform that:

✨ **AI Chat Interface** — Natural language conversation for task automation  
📋 **Task Management** — Create, track, and complete tasks with Karan  
📁 **Project Management** — Organize your work into projects  
📡 **Chairman Integration** — Monitor systems using Chairman Agent OS  
🎤 **Jarvis Voice** — Voice commands and AI assistance  
🌐 **Real-time Sync** — WebSocket updates across all devices  
🔗 **Automation** — Schedule tasks and automations  
📊 **Analytics** — Track productivity and statistics  

## Quick Start

### Installation (30 seconds)

```bash
# Run locally
node karan-chief-operator.js

# Open in browser
open http://localhost:9000
```

### Using Docker

```bash
docker-compose up -d
```

### Cloud Deployment

See [DEPLOY_OPERATOR.md](./DEPLOY_OPERATOR.md)

## Features

### 1. AI Chat Interface

Talk naturally to Karan Chief Operator:

```
You: "Create a task to review the project"
Karan: "I've added that to your tasks. Need a due date?"

You: "Show my tasks"
Karan: "You have 3 active tasks..."

You: "Enable Chairman monitoring"
Karan: "Chairman monitoring is now active. I'll track your websites."
```

### 2. Task Management

- ✅ Create tasks with natural language
- ✅ Set priorities and due dates
- ✅ Mark tasks as complete
- ✅ Get reminders and notifications
- ✅ View task history

### 3. Project Management

- 📁 Create and organize projects
- 🎯 Add tasks to projects
- 📊 Track project progress
- 🚀 Collaborate with team

### 4. Chairman Integration

Karan controls your Chairman Agent OS instance:

```
You: "Check website status"
Karan: "Checking your monitors... 
        ✓ site1.com is UP (45ms)
        ✗ site2.com is DOWN"

You: "Send alerts to Slack"
Karan: "Slack notifications enabled."
```

### 5. Jarvis Voice Assistant

Activate Jarvis for voice commands:

```
You: "Jarvis, create a reminder"
Jarvis: "What should I remind you about?"
You: "Call the client at 3pm"
Jarvis: "Reminder set for 3:00 PM"
```

### 6. Automation & Scheduling

```
You: "Schedule a daily check of website status"
Karan: "Daily monitoring scheduled at 9:00 AM"

You: "Remind me to standup every Monday at 9am"
Karan: "Weekly standup reminder set."
```

## API Reference

### Authentication

```bash
# Register new user
curl -X POST http://localhost:9000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"id":"karan","password":"secret","name":"Karan"}'

# Response: {"ok":true,"sessionId":"xxx"}

# Login
curl -X POST http://localhost:9000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"id":"karan","password":"secret"}'
```

### Chat API

```bash
# Send message to Karan
curl -X POST http://localhost:9000/api/chat?sessionId=xxx \
  -H "Content-Type: application/json" \
  -d '{"message":"Create a task to review code"}'

# Response:
{
  "message": {
    "id": "msg123",
    "text": "I've created the task 'review code'. Want to set a due date?",
    "type": "assistant"
  }
}
```

### Tasks API

```bash
# Get all tasks
curl http://localhost:9000/api/tasks?sessionId=xxx

# Create task
curl -X POST http://localhost:9000/api/tasks?sessionId=xxx \
  -H "Content-Type: application/json" \
  -d '{"title":"Review code","description":"Check PR #42","dueDate":"2026-09-10"}'

# Get conversations
curl http://localhost:9000/api/conversations?sessionId=xxx
```

### Projects API

```bash
# Get all projects
curl http://localhost:9000/api/projects?sessionId=xxx

# Create project
curl -X POST http://localhost:9000/api/projects?sessionId=xxx \
  -H "Content-Type: application/json" \
  -d '{"name":"Q4 Roadmap","description":"2026 Q4 planning"}'
```

### Integrations API

```bash
# Check integrations status
curl http://localhost:9000/api/integrations?sessionId=xxx

# Response:
{
  "chairman": true,
  "jarvis": true,
  "slack": true,
  "discord": false
}
```

## Configuration

### Environment Variables

```bash
# Server
PORT=9000
NODE_ENV=production
PRODUCTION=1

# Storage
STORE=github
GH_TOKEN=ghp_xxx
GH_REPO=youruser/karan-state

# Integrations
SLACK_WEBHOOK=https://hooks.slack.com/...
DISCORD_WEBHOOK=https://discordapp.com/...

# External Services
JARVIS_API=http://localhost:8001
CHAIRMAN_API=http://localhost:8080
```

### Settings via Dashboard

1. Go to ⚙️ Settings
2. Toggle integrations:
   - Chairman Agent OS
   - Jarvis Voice Assistant
   - Slack notifications
   - Discord notifications

## Chat Commands

### Task Commands

| Command | Example | Response |
|---------|---------|----------|
| Create task | "Create a task to..." | Creates task |
| List tasks | "Show my tasks" | Lists active tasks |
| Complete task | "Mark task done" | Marks as complete |
| Task status | "How many tasks?" | Shows statistics |

### Project Commands

| Command | Example | Response |
|---------|---------|----------|
| Create project | "Start new project..." | Creates project |
| List projects | "Show my projects" | Lists all projects |
| Project status | "How's the Q4 project?" | Shows details |

### Monitoring Commands

| Command | Example | Response |
|---------|---------|----------|
| Check status | "Check website status" | Probes Chairman |
| Enable monitoring | "Enable Chairman" | Activates monitoring |
| Get alerts | "Recent alerts?" | Shows alerts |

### Jarvis Commands

| Command | Example | Response |
|---------|---------|----------|
| Activate Jarvis | "Jarvis, listen" | Activates voice mode |
| Voice command | "Create reminder..." | Executes voice command |

## Integration with Chairman Agent OS

Karan Chief Operator can control your Chairman monitoring:

### Setup

1. Start Chairman on port 8080:
```bash
CHAIRMAN_API=http://localhost:8080 node karan-chief-operator.js
```

2. Enable Chairman in Karan settings

3. Now you can:
```
You: "Show all monitors"
Karan: "Fetching from Chairman..."
```

### Features

- ✅ View all monitors from Chairman
- ✅ Get uptime statistics
- ✅ Receive alerts
- ✅ Create new monitors
- ✅ Manage monitor settings

## Integration with Jarvis

Jarvis is an AI voice assistant that works alongside Karan:

### Setup

1. Ensure Jarvis is running on port 8001
2. Set `JARVIS_API` in environment
3. Enable Jarvis in settings

### Usage

- 🎤 Voice commands for tasks
- 🗣️ Natural voice interaction
- 🔊 Audio feedback
- 📝 Voice-to-text transcription

## Deployment

### Local Development

```bash
# Simple
node karan-chief-operator.js

# With Docker
docker-compose up

# Watch logs
tail -f karan-data.json
```

### Cloud Deployment

**Render** (Recommended):
```bash
# 1. Create Web Service on Render
# 2. Connect GitHub repo
# 3. Set environment variables
# 4. Deploy
```

**Heroku**:
```bash
heroku create karan-operator
git push heroku main
```

**AWS EC2**:
```bash
pm2 start karan-chief-operator.js
pm2 save
```

See [DEPLOY_OPERATOR.md](./DEPLOY_OPERATOR.md) for detailed guides.

## Architecture

```
┌─────────────────────────────────────────┐
│      Karan Chief Operator (v1.0)        │
├─────────────────────────────────────────┤
│                                         │
│  Web Interface (Chat Dashboard)         │
│         ↓                               │
│  API Endpoints (/api/chat, etc)         │
│         ↓                               │
│  AI Chat Engine                         │
│  ├─ Intent Parser                       │
│  ├─ Task Handler                        │
│  ├─ Project Handler                     │
│  ├─ Monitoring Handler                  │
│  └─ Automation Handler                  │
│         ↓                               │
│  Integrations                           │
│  ├─ Chairman Agent OS                   │
│  ├─ Jarvis Voice Assistant              │
│  ├─ Slack Webhooks                      │
│  └─ Discord Webhooks                    │
│         ↓                               │
│  Storage (Local or GitHub)              │
│                                         │
└─────────────────────────────────────────┘
```

## Performance

- **Startup**: ~200ms
- **Chat response**: <100ms
- **API response**: <50ms
- **Memory**: ~30MB idle, ~60MB with data
- **WebSocket**: <100ms connection

## Security

✅ Session-based authentication  
✅ Secure session IDs (crypto-random)  
✅ HTTPS support (recommended)  
✅ Input validation  
✅ CORS protection  
✅ Private GitHub storage  

## Troubleshooting

### Chat Not Responding

```bash
# Check server health
curl http://localhost:9000/api/health

# Check logs
tail -f karan-data.json
```

### Integration Issues

1. Verify Chairman is running: `http://localhost:8080/api/health`
2. Verify Jarvis is running: Check Jarvis logs
3. Test Slack webhook: Send test message
4. Check Discord webhook: Verify channel

### WebSocket Failures

- Ensure WebSocket upgrade is enabled
- Check firewall rules
- Verify /api/chat endpoint works first

## FAQ

**Q: Can I use Karan without Chairman?**
A: Yes! Karan works independently. Chairman integration is optional.

**Q: Is Jarvis required?**
A: No, both Karan's chat and Jarvis are optional.

**Q: Can I add my own tasks via API?**
A: Yes, use the `/api/tasks` endpoint.

**Q: Does Karan remember conversations?**
A: Yes, the last 50 messages are stored and synced.

**Q: Can multiple people use Karan?**
A: Current version is single-user. Multi-user support coming soon.

## Roadmap

- [ ] Multi-user/team support
- [ ] Advanced AI with memory
- [ ] Calendar integration
- [ ] Email integration
- [ ] Slack thread creation
- [ ] Advanced analytics dashboard
- [ ] Mobile app (React Native)
- [ ] Offline mode

## Support

- 📖 [Full Deployment Guide](./DEPLOY_OPERATOR.md)
- 🔧 [Configuration Reference](./.env.example)
- 🐛 [GitHub Issues](https://github.com/youruser/karan-operator/issues)

---

**Made by Karan's Team** — Your personal AI operator 🤖

*Part of the Chairman Agent OS ecosystem*

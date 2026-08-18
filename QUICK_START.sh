#!/bin/bash
# Chairman Agent OS - Quick Start Script

set -e

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "   Chairman Agent OS v4 - Quick Start Setup"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 16+ from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js detected: $NODE_VERSION"
echo ""

# Create .env if doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env created. Edit it with your credentials."
    echo ""
fi

# Option selection
echo "Choose deployment mode:"
echo ""
echo "  1) LOCAL DEVELOPMENT"
echo "     • Run on http://localhost:8080"
echo "     • Data saved to data.json"
echo "     • Good for testing & development"
echo ""
echo "  2) LOCAL WITH DOCKER"
echo "     • Run in container"
echo "     • Requires Docker installed"
echo "     • Closer to production setup"
echo ""
echo "  3) CLOUD DEPLOYMENT SETUP"
echo "     • Configure for cloud (Render/Railway/Heroku)"
echo "     • Create GitHub state repo"
echo "     • Generate credentials"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
  1)
    echo ""
    echo "🚀 Starting Chairman Agent OS (LOCAL)..."
    echo ""
    node chairman-enhanced.js
    ;;
  2)
    if ! command -v docker &> /dev/null; then
      echo "❌ Docker not found. Install from https://docker.com"
      exit 1
    fi
    echo ""
    echo "🐳 Starting with Docker Compose..."
    echo ""
    docker-compose up -d
    sleep 2
    echo ""
    echo "✅ Chairman running at http://localhost:8080"
    echo ""
    echo "View logs: docker-compose logs -f"
    echo "Stop:      docker-compose down"
    echo ""
    ;;
  3)
    echo ""
    echo "📋 Cloud Deployment Setup"
    echo ""
    echo "Before deploying to cloud, you need:"
    echo ""
    echo "1️⃣  GitHub Account"
    echo "   • Create a PRIVATE repo: chairman-state"
    echo "   • Generate PAT at github.com/settings/tokens"
    echo ""
    echo "2️⃣  Cloud Platform Account (choose one):"
    echo "   • Render (recommended): render.com"
    echo "   • Railway: railway.app"
    echo "   • Heroku: heroku.com"
    echo "   • AWS: aws.amazon.com"
    echo ""
    echo "3️⃣  Integration Setup (optional)"
    echo "   • Slack webhook: slack.com/apps"
    echo "   • Discord webhook: discord.com"
    echo "   • Gmail app password: myaccount.google.com/apppasswords"
    echo ""
    echo "📖 Complete guide: See DEPLOY.md"
    echo ""
    echo "Environment variables to set:"
    echo ""
    echo "  PRODUCTION=1"
    echo "  NODE_ENV=production"
    echo "  STORE=github"
    echo "  GH_TOKEN=<your_github_pat>"
    echo "  GH_REPO=<your_user>/<your_repo>"
    echo "  SLACK_WEBHOOK=<optional>"
    echo "  DISCORD_WEBHOOK=<optional>"
    echo ""
    read -p "Open DEPLOY.md now? (y/n): " open_deploy
    if [ "$open_deploy" = "y" ]; then
      if command -v open &> /dev/null; then
        open DEPLOY.md
      elif command -v xdg-open &> /dev/null; then
        xdg-open DEPLOY.md
      else
        echo "Open DEPLOY.md with your editor to see full setup guide"
      fi
    fi
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

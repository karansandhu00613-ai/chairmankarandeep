# Chairman Agent OS - Production Dockerfile
# For dashboard deployment, use: Dockerfile.dashboard
# For Karan deployment, use: Dockerfile.karan
# For local development, use: docker-compose.yml

FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production || npm install || true

FROM node:18-alpine

WORKDIR /app

COPY chairman-enhanced.js .
COPY --from=builder /app/node_modules ./node_modules 2>/dev/null || true

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

ENV NODE_ENV=production PORT=8080 PRODUCTION=1

CMD ["node", "chairman-enhanced.js"]

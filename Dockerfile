# Multi-stage build for optimized production image
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package.json if it exists (optional for this single-file app)
COPY package.json* ./

# Install dependencies if needed
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi || true

# Final production image
FROM node:18-alpine

WORKDIR /app

# Copy app file
COPY chairman-enhanced.js .

# Copy dependencies if any
COPY --from=builder /app/node_modules ./node_modules 2>/dev/null || true

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Default environment
ENV NODE_ENV=production \
    PORT=8080 \
    PRODUCTION=1

# Run app
CMD ["node", "chairman-enhanced.js"]

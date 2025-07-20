FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy frontend package.json
COPY frontend/package.json ./frontend/

# Copy shared packages package.json files for dependency resolution
COPY packages/shared-types/package.json ./packages/shared-types/

# Install dependencies
RUN npm ci

# Copy shared types
COPY packages/shared-types ./packages/shared-types

# Copy frontend source code
COPY frontend ./frontend

# Build the frontend
RUN npm run build --workspace=frontend

# Production image
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package files needed for Next.js
COPY --from=builder /app/frontend/package.json ./
COPY --from=builder /app/frontend/next.config.js ./
COPY --from=builder /app/frontend/public ./public

# Copy built application
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./.next/static

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs
USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
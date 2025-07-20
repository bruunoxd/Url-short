FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy shared packages package.json files for dependency resolution
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-db/package.json ./packages/shared-db/
COPY packages/shared-monitoring/package.json ./packages/shared-monitoring/
COPY packages/shared-rate-limiter/package.json ./packages/shared-rate-limiter/

# Copy service package.json
COPY services/user-management/package.json ./services/user-management/

# Install dependencies
RUN npm ci

# Copy shared packages source code
COPY packages ./packages

# Copy service source code
COPY services/user-management ./services/user-management

# Build the service and its dependencies
RUN npm run build --workspace=services/user-management

# Production image
FROM node:18-alpine AS runner

WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./
COPY turbo.json ./

# Copy shared packages package.json files
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-db/package.json ./packages/shared-db/
COPY packages/shared-monitoring/package.json ./packages/shared-monitoring/
COPY packages/shared-rate-limiter/package.json ./packages/shared-rate-limiter/

# Copy service package.json
COPY services/user-management/package.json ./services/user-management/

# Install production dependencies only
RUN npm install -g npm@10.2.4 && npm ci --omit=dev

# Copy built files from builder stage
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/shared-db/dist ./packages/shared-db/dist
COPY --from=builder /app/packages/shared-monitoring/dist ./packages/shared-monitoring/dist
COPY --from=builder /app/packages/shared-rate-limiter/dist ./packages/shared-rate-limiter/dist
COPY --from=builder /app/services/user-management/dist ./services/user-management/dist

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs
USER nodejs

# Expose the service port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3003/health || exit 1

# Set the command to run the service
CMD ["node", "services/user-management/dist/index.js"]
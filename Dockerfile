# Build and Run with Node.js Alpine
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Copy package files
COPY package.json ./
COPY server/package.json server/package-lock.json server/

# Install only production dependencies
RUN cd server && npm ci --omit=dev

# Copy application source code
COPY client/ client/
COPY server/ server/

# Use non-root node user for security
USER node

EXPOSE 5000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

CMD ["node", "server/server.js"]

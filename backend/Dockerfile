FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies and clean cache
RUN npm install --production && npm cache clean --force

# Copy application files
COPY . .

# Create directories
RUN mkdir -p /app/uploads /app/config

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /app

USER appuser

# Expose port
EXPOSE 3000

# Container health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health | grep -q healthy || exit 1

# Start the application
CMD ["node", "server.js"]

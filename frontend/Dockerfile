# ========== Stage 1: Build React App ==========
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# ========== Stage 2: Serve with Nginx ==========
FROM nginx:1.25-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Generate self-signed SSL certificate (10 years, RSA 2048)
RUN apk add --no-cache openssl && \
    mkdir -p /etc/nginx/ssl && \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout /etc/nginx/ssl/server.key \
      -out /etc/nginx/ssl/server.crt \
      -subj "/C=DE/ST=Local/L=Local/O=Nexora/CN=localhost" \
      -addext "subjectAltName=DNS:localhost,DNS:nexora.local,IP:127.0.0.1"

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built React app
COPY --from=build /app/dist /usr/share/nginx/html

# Copy error page
COPY 50x.html /usr/share/nginx/html/50x.html

# Use non-root user where possible
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 80 443

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]

# wiki
Wiki inside a Docker container

## Quick Start

1. Copy the example environment file and configure your credentials:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set secure credentials:
   - `DB_NAME`: PostgreSQL database name
   - `DB_USER`: PostgreSQL username
   - `DB_PASS`: PostgreSQL password (use a strong password!)
   - `DB_PORT`: PostgreSQL port (default: 5432)

3. Start the services:
   ```bash
   docker-compose up -d
   ```

4. Access the wiki at: http://localhost:8080

## Services

### Wiki Service
- **Container Name**: `wiki-app`
- **Image**: requarks/wiki:2 (Wiki.js)
- **Port**: 8080 (mapped to container port 3000)
- **Volumes**:
  - `wiki_data`: Application data and uploads
  - `wiki_config`: Configuration files

### Database Service
- **Container Name**: `wiki-db`
- **Image**: postgres:15-alpine
- **Volume**: `db_data` (persistent PostgreSQL data)
- **Healthcheck**: Ensures database is ready before wiki starts

## Features

- ✅ PostgreSQL database with named volume for data persistence
- ✅ Wiki.js application with database connection via environment variables
- ✅ HTTP exposed on host port 8080
- ✅ Credentials managed via .env file
- ✅ Healthcheck for PostgreSQL to ensure database availability
- ✅ Wiki service waits for database to be healthy before starting
- ✅ Separate volumes for wiki uploads and configuration

## Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop services and remove volumes (WARNING: deletes all data!)
docker-compose down -v

# Restart services
docker-compose restart

# Check service status
docker-compose ps
```

## Volumes

- `db_data`: PostgreSQL database files
- `wiki_data`: Wiki application data and uploads
- `wiki_config`: Wiki configuration files

## Network

All services communicate via the `wiki-network` bridge network.

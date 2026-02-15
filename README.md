# Wiki Application with PostgreSQL

A modern wiki web application with an Outline-inspired interface, running in Docker containers with persistent PostgreSQL database.

## 🚀 Features

- **Modern UI**: Clean, professional interface inspired by Outline
- **Sidebar Navigation**: Fixed sidebar with organized navigation
- **Wiki Application**: Web-based wiki for creating and viewing pages
- **PostgreSQL Database**: Persistent database storage with health checks
- **Docker Compose**: Easy deployment and management
- **Automatic Reconnection**: Wiki app automatically reconnects to database
- **Persistent Storage**: Named volumes for database and wiki uploads/config
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 🎨 Frontend Design

The wiki features a modern, professional interface inspired by [Outline](https://www.getoutline.com/):

- **Sidebar Navigation**: Fixed sidebar with logo and organized navigation
- **Modern Color Scheme**: Professional blue-purple primary color (#4E5AEE)
- **Card-based Layouts**: Clean cards for content organization
- **Smooth Animations**: Hover effects and transitions for better UX
- **Typography**: System fonts with optimized hierarchy
- **Responsive**: Mobile-friendly design that adapts to screen size

For detailed design documentation, see:
- [FRONTEND_DESIGN.md](FRONTEND_DESIGN.md) - Complete design overview
- [DESIGN_MOCKUPS.md](DESIGN_MOCKUPS.md) - Visual mockups and layouts
- [FRONTEND_REDESIGN_DE.md](FRONTEND_REDESIGN_DE.md) - German summary

## 📋 Prerequisites

- Docker Engine 20.10 or higher
- Docker Compose 2.0 or higher

## 🔧 Setup

### 1. Initial Configuration

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` and set secure credentials:

```env
DB_NAME=wikidb
DB_USER=wikiuser
DB_PASS=your_secure_password_here
```

**Important**: Change `DB_PASS` to a strong, unique password!

## 🎯 Usage

### Start the Application

Start all services:

```bash
docker-compose up -d
```

This will:
- Start PostgreSQL database with health check
- Wait for database to be ready
- Start the wiki application
- Expose the wiki on http://localhost:8080

View logs:

```bash
docker-compose logs -f
```

Check service status:

```bash
docker-compose ps
```

### Access the Application

Open your browser and navigate to:

```
http://localhost:8080
```

Available endpoints:
- `/` - Home page
- `/pages` - View and create wiki pages
- `/health` - Health check endpoint

### Stop the Application

Stop all services (keeps data):

```bash
docker-compose stop
```

Stop and remove containers (keeps data):

```bash
docker-compose down
```

Stop and remove everything including volumes (⚠️ DELETES ALL DATA):

```bash
docker-compose down -v
```

## 🔄 Update

To update the application:

1. Pull latest changes:
```bash
git pull
```

2. Rebuild and restart:
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

3. Check logs:
```bash
docker-compose logs -f wiki
```

## 💾 Backup & Restore

### Backup Database

Create a backup of the PostgreSQL database:

```bash
# Set your database password
export DB_PASS=your_password_here

# Create backup file with timestamp
docker-compose exec -T db pg_dump -U wikiuser -d wikidb > backup_$(date +%Y%m%d_%H%M%S).sql
```

Or use the environment variable from .env:

```bash
# Load environment variables
source .env

# Create backup
docker-compose exec -T db pg_dump -U $DB_USER -d $DB_NAME > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore Database

Restore from a backup file:

```bash
# Load environment variables
source .env

# Stop the wiki service
docker-compose stop wiki

# Restore database
cat backup_20240101_120000.sql | docker-compose exec -T db psql -U $DB_USER -d $DB_NAME

# Restart wiki service
docker-compose start wiki
```

Or restore with password:

```bash
export DB_PASS=your_password_here
docker-compose exec -T db psql -U wikiuser -d wikidb < backup_20240101_120000.sql
```

### Backup Volumes

Backup wiki uploads and configuration:

```bash
# Backup uploads
docker run --rm -v wiki-uploads:/data -v $(pwd):/backup alpine tar czf /backup/wiki_uploads_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# Backup config
docker run --rm -v wiki-config:/data -v $(pwd):/backup alpine tar czf /backup/wiki_config_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```

### Restore Volumes

Restore wiki uploads and configuration:

```bash
# Restore uploads
docker run --rm -v wiki-uploads:/data -v $(pwd):/backup alpine sh -c "cd /data && tar xzf /backup/wiki_uploads_20240101_120000.tar.gz"

# Restore config
docker run --rm -v wiki-config:/data -v $(pwd):/backup alpine sh -c "cd /data && tar xzf /backup/wiki_config_20240101_120000.tar.gz"
```

## 🔍 Troubleshooting

### Check Database Health

```bash
docker-compose exec db pg_isready -U wikiuser -d wikidb
```

### View Database Logs

```bash
docker-compose logs db
```

### Connect to Database

```bash
docker-compose exec db psql -U wikiuser -d wikidb
```

### View Wiki Application Logs

```bash
docker-compose logs wiki
```

### Restart Services

```bash
docker-compose restart
```

## 📁 Volume Information

The application uses the following named volumes:

- `wiki-db-data`: PostgreSQL database files
- `wiki-uploads`: Wiki file uploads
- `wiki-config`: Wiki configuration files

To list volumes:

```bash
docker volume ls | grep wiki
```

To inspect a volume:

```bash
docker volume inspect wiki-db-data
```

## 🏗️ Architecture

```
┌─────────────────┐
│   Browser       │
│  Port 8080      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│   Wiki App      │────▶│   PostgreSQL     │
│   Container     │     │   Container      │
│   Port 3000     │     │   Port 5432      │
└─────────────────┘     └──────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│ wiki-uploads    │     │  wiki-db-data    │
│ wiki-config     │     │    (volume)      │
│   (volumes)     │     └──────────────────┘
└─────────────────┘
```

## 🔒 Security Notes

- **Change default passwords** in `.env` file
- **Don't commit** `.env` file to version control (already in `.gitignore`)
- Use strong passwords for production deployments
- Consider using Docker secrets for sensitive data in production
- Regular backups are recommended

## 📝 Environment Variables

| Variable  | Description                    | Default     |
|-----------|--------------------------------|-------------|
| DB_NAME   | PostgreSQL database name       | wikidb      |
| DB_USER   | PostgreSQL username            | wikiuser    |
| DB_PASS   | PostgreSQL password            | (required)  |
| DB_HOST   | Database host (set by compose) | db          |
| DB_PORT   | Database port                  | 5432        |

## 📄 License

See LICENSE file for details.

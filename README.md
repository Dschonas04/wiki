# Wiki

A self-hosted wiki application with role-based access control (RBAC) and optional LDAP authentication.

Built with **React**, **Node.js**, **PostgreSQL**, and **Nginx** — fully containerized with Docker Compose.

## Features

- **Authentication** — JWT sessions with httpOnly cookies, bcrypt password hashing
- **RBAC** — Three roles: Admin, Editor, Viewer with granular permissions
- **LDAP** — Optional LDAP/Active Directory integration with group-to-role mapping
- **Audit Log** — Tracks logins, page edits, user management events
- **User Management** — Admin panel for creating/editing/deactivating users
- **Wiki Pages** — Create, edit, delete, search with author tracking
- **Security** — Helmet, CSRF protection, rate limiting, CSP headers, non-root containers
- **Responsive UI** — React SPA with sidebar navigation, mobile support

## Architecture

```
Browser :8080
   │
   ▼
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Nginx   │────▶│ Node.js  │────▶│ Postgres │     │ OpenLDAP │
│ Frontend │     │ Backend  │     │    DB    │     │ (optional)│
│  :80     │     │  :3000   │     │  :5432   │     │  :389    │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

| Service  | Image / Stack           | Purpose                                    |
|----------|-------------------------|--------------------------------------------|
| frontend | React + Vite → Nginx    | SPA + reverse proxy to API                 |
| backend  | Node.js 18 + Express    | REST API, JWT auth, RBAC, LDAP             |
| db       | PostgreSQL 15           | Users, pages, audit log                    |
| ldap     | osixia/openldap 1.5     | Optional external authentication           |

## Quick Start

### Prerequisites

- Docker Engine ≥ 20.10
- Docker Compose ≥ 2.0

### 1. Clone and configure

```bash
git clone <repo-url> wiki && cd wiki
cp .env.example .env
```

Edit `.env` and set **strong, unique values**:

```bash
# Generate a secure JWT secret:
openssl rand -base64 32

# Generate a secure DB password:
openssl rand -base64 24
```

```env
DB_PASS=<your-secure-db-password>
JWT_SECRET=<your-secure-jwt-secret>
```

### 2. Start

```bash
docker compose up -d
```

### 3. Open

Navigate to **http://localhost:8080**

Default login: `admin` / `admin` — **change this password immediately** via the User Management panel.

## Project Structure

```
wiki/
├── docker-compose.yml
├── .env.example
├── backend/                 # Node.js REST API
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── frontend/                # React SPA (Vite + TypeScript)
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── api/             # API client
│       ├── components/      # Layout, Loading, PageHeader
│       ├── context/         # AuthContext, ToastContext
│       ├── pages/           # Login, Home, Pages, Users, AuditLog, Health
│       └── styles/          # CSS design system
├── config/
│   └── ldap/                # LDAP seed data (LDIF)
└── docs/                    # Design documentation
```

## RBAC Roles

| Permission      | Admin | Editor | Viewer |
|-----------------|:-----:|:------:|:------:|
| Read pages      |   ✅  |   ✅   |   ✅   |
| Create pages    |   ✅  |   ✅   |   ❌   |
| Edit pages      |   ✅  |   ✅   |   ❌   |
| Delete pages    |   ✅  |   ✅   |   ❌   |
| Manage users    |   ✅  |   ❌   |   ❌   |
| View audit log  |   ✅  |   ❌   |   ❌   |
| System health   |   ✅  |   ✅   |   ✅   |

## API Endpoints

### Auth
| Method | Endpoint          | Auth | Description            |
|--------|-------------------|------|------------------------|
| POST   | /api/auth/login   | No   | Login (local or LDAP)  |
| POST   | /api/auth/logout  | Yes  | Logout                 |
| GET    | /api/auth/me      | Yes  | Current user info      |

### Pages
| Method | Endpoint          | Permission    | Description        |
|--------|-------------------|---------------|--------------------|
| GET    | /api/pages        | pages.read    | List all pages     |
| GET    | /api/pages/:id    | pages.read    | Get single page    |
| POST   | /api/pages        | pages.create  | Create page        |
| PUT    | /api/pages/:id    | pages.edit    | Update page        |
| DELETE | /api/pages/:id    | pages.delete  | Delete page        |

### Admin
| Method | Endpoint          | Permission    | Description        |
|--------|-------------------|---------------|--------------------|
| GET    | /api/users        | users.read    | List users         |
| POST   | /api/users        | users.manage  | Create user        |
| PUT    | /api/users/:id    | users.manage  | Update user        |
| DELETE | /api/users/:id    | users.manage  | Delete user        |
| GET    | /api/audit        | audit.read    | Audit log          |

### Health
| Method | Endpoint          | Auth | Description            |
|--------|-------------------|------|------------------------|
| GET    | /api/health       | No   | Health check           |

## LDAP Integration

LDAP is **disabled by default**. To enable:

1. Set `LDAP_ENABLED=true` in `.env`
2. Configure the LDAP connection variables
3. Restart: `docker compose up -d`

LDAP groups are mapped to wiki roles:

| LDAP Group | Wiki Role |
|------------|-----------|
| admins     | admin     |
| editors    | editor    |
| viewers    | viewer    |

Users are auto-provisioned on first LDAP login. Local auth is used as fallback.

## Operations

### Logs

```bash
docker compose logs -f           # all services
docker compose logs -f wiki      # backend only
```

### Backup

```bash
source .env
docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" > "backup_$(date +%Y%m%d_%H%M%S).sql"
```

### Restore

```bash
source .env
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" < backup_YYYYMMDD_HHMMSS.sql
```

### Rebuild

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Reset (⚠️ deletes all data)

```bash
docker compose down -v
```

## Environment Variables

| Variable           | Required | Default                         | Description                     |
|--------------------|:--------:|---------------------------------|---------------------------------|
| DB_NAME            | No       | wikidb                          | Database name                   |
| DB_USER            | No       | wikiuser                        | Database user                   |
| DB_PASS            | **Yes**  | —                               | Database password               |
| JWT_SECRET         | **Yes**  | —                               | JWT signing secret (≥ 32 chars) |
| JWT_EXPIRES        | No       | 8h                              | JWT token lifetime              |
| LDAP_ENABLED       | No       | false                           | Enable LDAP authentication      |
| LDAP_URL           | No       | ldap://ldap:389                 | LDAP server URL                 |
| LDAP_BIND_DN       | No       | cn=admin,dc=wiki,dc=local       | LDAP service account DN         |
| LDAP_BIND_PW       | If LDAP  | —                               | LDAP service account password   |
| LDAP_SEARCH_BASE   | No       | ou=users,dc=wiki,dc=local       | LDAP user search base           |
| LDAP_SEARCH_FILTER | No       | (uid={{username}})              | LDAP user search filter         |
| LDAP_GROUP_BASE    | No       | ou=groups,dc=wiki,dc=local      | LDAP group search base          |

## Security Notes

- **Never commit `.env`** — it's in `.gitignore` by default
- **Change the default admin password** after first login
- JWT secret must be ≥ 32 characters; generate with `openssl rand -base64 32`
- All containers run as non-root users
- CSRF protection via `X-Requested-With` header
- Rate limiting on auth (20/15min), writes (60/15min), general (300/15min)
- Nginx adds CSP, HSTS, X-Frame-Options, X-Content-Type-Options headers

## License

Apache License 2.0 — see [LICENSE](LICENSE).

# Nexora

A self-hosted knowledge base application with role-based access control (RBAC), optional LDAP authentication, multi-theme support, and an interactive knowledge graph.

Built with **React 18**, **Node.js 22 LTS**, **PostgreSQL 15**, and **Nginx** — fully containerized with Docker Compose.

## Features

- **Authentication** — JWT sessions with httpOnly cookies, bcrypt password hashing
- **RBAC** — Three roles: Admin, Auditor, User with granular permissions
- **LDAP** — Optional LDAP/Active Directory integration with group-to-role mapping
- **Page Management** — Create, edit, version history, restore, search, soft delete / trash
- **Visibility & Approval** — Draft/published workflow with admin approval system
- **Tags** — Per-user tag system with color coding
- **Favorites** — Bookmark pages for quick access
- **Sharing** — Share pages with specific users (read/edit permissions)
- **Attachments** — Upload files to pages (25 MB limit, validated MIME types)
- **Knowledge Graph** — Interactive force-directed visualization of page relationships
- **Multi-Theme** — 6 themes (Light, Dark, Orange, Midnight, High Contrast, Soft Dark) saved per user
- **Export** — Individual page or full wiki export as Markdown
- **Audit Log** — Tracks logins, page edits, user management events
- **Security** — Helmet, CSRF protection, rate limiting, compression, non-root containers
- **Responsive UI** — React SPA with sidebar navigation, global search (⌘K), mobile support

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
| backend  | Node.js 22 + Express    | REST API, JWT auth, RBAC, LDAP             |
| db       | PostgreSQL 15           | Users, pages, tags, settings, audit log    |
| ldap     | osixia/openldap 1.5     | Optional external authentication           |

## Quick Start

### Prerequisites

- Docker Engine ≥ 20.10
- Docker Compose ≥ 2.0

### 1. Clone and configure

```bash
git clone https://github.com/Dschonas04/wiki.git && cd wiki
cp .env.example .env
```

Edit `.env` and set **strong, unique values**:

```bash
openssl rand -base64 32   # JWT_SECRET
openssl rand -base64 24   # DB_PASS
```

### 2. Start

```bash
docker compose up -d
```

### 3. Open

Navigate to **http://localhost:8080**

On first startup the system creates a default admin account and prints credentials to the container log:

```bash
docker compose logs wiki | grep Password
```

**Change the default password immediately** after first login.

## Project Structure

```
wiki/
├── docker-compose.yml
├── .env.example
├── backend/                     # Node.js REST API (modular)
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js                # Entry point
│   └── src/
│       ├── config.js            # Environment & constants
│       ├── database.js          # PostgreSQL pool & migrations
│       ├── auth/                # LDAP & JWT helpers
│       │   ├── ldap.js
│       │   └── jwt.js
│       ├── middleware/           # Security & authentication
│       │   ├── security.js
│       │   └── auth.js
│       ├── helpers/              # Audit, validators, utilities
│       │   ├── audit.js
│       │   ├── validators.js
│       │   └── utils.js
│       └── routes/               # API route handlers
│           ├── auth.js
│           ├── users.js
│           ├── pages.js
│           ├── approvals.js
│           ├── attachments.js
│           ├── tags.js
│           ├── favorites.js
│           ├── sharing.js
│           ├── trash.js
│           ├── health.js
│           ├── audit.js
│           ├── settings.js      # Theme settings
│           └── graph.js         # Knowledge graph data
├── frontend/                    # React SPA (Vite + TypeScript)
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── api/                 # API client
│       ├── components/          # Layout, Loading, PageHeader
│       ├── context/             # AuthContext, ToastContext
│       ├── hooks/               # useTheme (multi-theme)
│       ├── pages/               # All page components
│       └── styles/              # CSS design system (6 themes)
├── config/
│   └── ldap/                    # LDAP seed data (LDIF)
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

## RBAC Roles

| Permission      | Admin | Auditor | User |
|-----------------|:-----:|:-------:|:----:|
| Read pages      |   ✅  |   ✅    |  ✅  |
| Create pages    |   ✅  |   ❌    |  ✅  |
| Edit pages      |   ✅  |   ❌    |  ❌  |
| Delete pages    |   ✅  |   ❌    |  ❌  |
| Review publish  |   ✅  |   ✅    |  ❌  |
| Manage users    |   ✅  |   ❌    |  ❌  |
| View audit log  |   ✅  |   ✅    |  ❌  |
| System health   |   ✅  |   ❌    |  ❌  |

## API Endpoints

### Auth
| Method | Endpoint                  | Auth | Description                |
|--------|---------------------------|------|----------------------------|
| POST   | /api/auth/login           | No   | Login (local or LDAP)      |
| POST   | /api/auth/logout          | Yes  | Logout                     |
| GET    | /api/auth/me              | Yes  | Current user info          |
| POST   | /api/auth/change-password | Yes  | Change password            |

### Pages
| Method | Endpoint                        | Permission    | Description                 |
|--------|---------------------------------|---------------|-----------------------------|
| GET    | /api/pages                      | pages.read    | List all pages              |
| GET    | /api/pages/recent               | pages.read    | Recent pages (dashboard)    |
| GET    | /api/pages/search?q=…           | pages.read    | Full-text search            |
| GET    | /api/pages/export-all           | pages.read    | Export all as Markdown      |
| GET    | /api/pages/:id                  | pages.read    | Get single page             |
| POST   | /api/pages                      | pages.create  | Create page                 |
| PUT    | /api/pages/:id                  | pages.edit    | Update page                 |
| DELETE | /api/pages/:id                  | pages.delete  | Soft delete (→ trash)       |
| GET    | /api/pages/:id/versions         | pages.read    | Version history             |
| POST   | /api/pages/:id/restore          | pages.edit    | Restore version             |
| PUT    | /api/pages/:id/visibility       | pages.edit    | Publish / unpublish         |
| GET    | /api/pages/:id/export           | pages.read    | Export single page          |
| GET    | /api/pages/:id/tags             | pages.read    | Page tags                   |
| PUT    | /api/pages/:id/tags             | pages.edit    | Set page tags               |
| GET    | /api/pages/:id/shares           | pages.read    | List shares                 |
| POST   | /api/pages/:id/shares           | pages.edit    | Share with user             |
| DELETE | /api/pages/:id/shares/:userId   | pages.edit    | Remove share                |
| GET    | /api/pages/:id/attachments      | pages.read    | List attachments            |
| POST   | /api/pages/:id/attachments      | pages.edit    | Upload attachment           |
| POST   | /api/pages/:id/request-approval | pages.edit    | Request publish approval    |
| POST   | /api/pages/:id/cancel-approval  | pages.edit    | Cancel approval request     |
| GET    | /api/pages/:id/approval-status  | pages.read    | Latest approval status      |

### Tags, Favorites, Sharing
| Method | Endpoint                   | Auth | Description             |
|--------|----------------------------|------|-------------------------|
| GET    | /api/tags                  | Yes  | List user's tags        |
| POST   | /api/tags                  | Yes  | Create tag              |
| DELETE | /api/tags/:id              | Yes  | Delete tag              |
| GET    | /api/favorites             | Yes  | List favorites          |
| POST   | /api/favorites/:pageId     | Yes  | Toggle favorite         |
| GET    | /api/favorites/:pageId/check | Yes | Check if favorited    |
| GET    | /api/shared                | Yes  | Pages shared with me    |

### Approvals (Admin)
| Method | Endpoint                   | Permission     | Description             |
|--------|----------------------------|----------------|-------------------------|
| GET    | /api/approvals             | users.manage   | List approval requests  |
| GET    | /api/approvals/count       | users.manage   | Pending count (badge)   |
| POST   | /api/approvals/:id/approve | users.manage   | Approve request         |
| POST   | /api/approvals/:id/reject  | users.manage   | Reject request          |

### Admin
| Method | Endpoint               | Permission     | Description        |
|--------|------------------------|----------------|--------------------|
| GET    | /api/users             | users.read     | List users         |
| GET    | /api/users/list        | Yes            | Lightweight list   |
| POST   | /api/users             | users.manage   | Create user        |
| PUT    | /api/users/:id         | users.manage   | Update user        |
| DELETE | /api/users/:id         | users.manage   | Delete user        |
| GET    | /api/audit             | audit.read     | Audit log          |

### Settings & Graph
| Method | Endpoint               | Auth | Description            |
|--------|------------------------|------|------------------------|
| GET    | /api/settings/theme    | Yes  | Get user's theme       |
| PUT    | /api/settings/theme    | Yes  | Set user's theme       |
| GET    | /api/graph             | Yes  | Knowledge graph data   |

### Health & Attachments
| Method | Endpoint                       | Auth | Description            |
|--------|--------------------------------|------|------------------------|
| GET    | /api/health                    | No   | Health check           |
| GET    | /api/health/details            | Yes  | Detailed health info   |
| GET    | /api/attachments/:id/download  | Yes  | Download attachment    |
| DELETE | /api/attachments/:id           | Yes  | Delete attachment      |
| GET    | /api/trash                     | Yes  | List trashed pages     |
| POST   | /api/trash/:id/restore         | Yes  | Restore from trash     |
| DELETE | /api/trash/:id                 | Yes  | Permanently delete     |

## Themes

Six built-in themes, stored per user in the database:

| Theme          | Description                                     |
|----------------|-------------------------------------------------|
| Light          | Clean white UI (default)                        |
| Dark           | Standard dark mode                              |
| Orange         | Warm orange tones on cream background           |
| Midnight       | Deep dark with purple accents                   |
| High Contrast  | Black & white, minimal border radius            |
| Soft Dark      | Gentle dark with blue accents                   |

## LDAP Integration

LDAP is **disabled by default**. To enable:

1. Set `LDAP_ENABLED=true` in `.env`
2. Configure the LDAP connection variables
3. Restart: `docker compose up -d`

LDAP groups are mapped to wiki roles:

| LDAP Group | Wiki Role |
|------------|----------|
| admins     | admin    |
| auditors   | auditor  |
| users      | user     |

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
| COOKIE_SECURE      | No       | false                           | Set true behind HTTPS           |
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

## Author

**Jonas** — [github.com/Dschonas04](https://github.com/Dschonas04)

## License

Apache License 2.0 — see [LICENSE](LICENSE).

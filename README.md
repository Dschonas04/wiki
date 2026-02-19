# Nexora

A self-hosted knowledge management platform with team spaces, publishing workflows, role-based access control (RBAC), optional LDAP authentication, multi-language support, and an interactive knowledge graph.

Built with **React 18**, **Node.js 22 LTS**, **PostgreSQL 15**, and **Nginx** — fully containerized with Docker Compose.

## Features

### Core
- **Organizations & Team Spaces** — Hierarchical structure: Organization → Team Spaces → Folders → Pages
- **Private Spaces** — Each user gets a personal, private workspace
- **Page Management** — Create, edit, version history, restore, full-text search, soft delete / trash
- **Rich Text Editor** — WYSIWYG block editor (TipTap) with Markdown fallback
- **Publishing Workflow** — Draft → In Review → Approved → Published (with approval requests)
- **Tags** — Global and per-user tags with color coding and filtering
- **Favorites** — Bookmark pages for quick access
- **Sharing** — Share pages with specific users (read/edit permissions)
- **Attachments** — Upload files to pages (25 MB limit, validated MIME types)
- **Knowledge Graph** — Interactive force-directed visualization of page relationships
- **Comments** — Threaded comments on pages
- **Notifications** — In-app notification system for approvals, shares, and mentions
- **Export** — Individual page or full wiki export as Markdown

### Security
- **Authentication** — JWT sessions in httpOnly cookies, bcrypt (12 rounds) password hashing
- **RBAC** — Three global roles (Admin, Auditor, User) + per-space roles (Owner, Editor, Reviewer, Viewer)
- **LDAP** — Optional LDAP/Active Directory integration with group-to-role mapping
- **XSS Protection** — DOMPurify (frontend) + server-side HTML sanitization (defense-in-depth)
- **Rate Limiting** — Auth (20/15min), writes (60/15min), general API (300/15min)
- **Security Headers** — Helmet, HSTS, X-Frame-Options, X-Content-Type-Options via Nginx
- **Audit Log** — Tracks logins, page edits, user management, and all sensitive actions
- **Account Lockout** — Per-account lockout after failed login attempts
- **Non-root Containers** — All services run as non-root users
- **Network Segmentation** — Separate Docker networks for frontend and backend

### UI / UX
- **Multi-Theme** — 6 themes (Light, Dark, Orange, Midnight, High Contrast, Soft Dark) saved per user
- **Internationalization** — German and English with runtime language switching
- **Responsive UI** — React SPA with sidebar navigation, global search (⌘K), mobile support
- **Structured Logging** — Pino JSON logging with request IDs for traceability

## Architecture

```
Browser :8080/:8443
   │
   ▼
┌──────────┐  nexora-frontend  ┌──────────┐  nexora-backend  ┌──────────┐
│  Nginx   │──────────────────▶│ Node.js  │─────────────────▶│ Postgres │
│ Frontend │    reverse proxy  │ Backend  │    connection    │    DB    │
│  :80/443 │                   │  :3000   │    pool          │  :5432   │
└──────────┘                   └──────────┘                  └──────────┘
                                    │ (optional)
                                    ▼
                               ┌──────────┐
                               │ OpenLDAP │
                               │  :389    │
                               └──────────┘
```

| Service  | Image / Stack                | Network            | Purpose                                |
|----------|------------------------------|--------------------|----------------------------------------|
| frontend | React 18 + Vite → Nginx 1.27 | nexora-frontend    | SPA + HTTPS reverse proxy to API       |
| backend  | Node.js 22 + Express         | frontend + backend | REST API, JWT auth, RBAC, LDAP         |
| db       | PostgreSQL 15                | nexora-backend     | All data (users, pages, spaces, audit) |
| ldap     | osixia/openldap 1.5          | nexora-backend     | Optional external authentication       |

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
openssl rand -base64 32   # → JWT_SECRET
openssl rand -base64 24   # → DB_PASS
```

### 2. Start

```bash
docker compose up -d
```

### 3. Open

Navigate to **https://localhost:8443** (HTTPS) or **http://localhost:8080** (HTTP redirect).

On first startup the system creates a default admin account:

| | |
|---|---|
| **Username** | `admin` |
| **Password** | `Admin123!` |

> ⚠️ **Change the default password immediately** after first login.

### 4. Optional: SSL certificates

By default, a self-signed certificate is generated at build time. To use your own:

```bash
# Uncomment volumes in docker-compose.yml, then:
mkdir certs
cp your-cert.crt certs/server.crt
cp your-key.key certs/server.key
docker compose up -d
```

## Project Structure

```
wiki/
├── docker-compose.yml
├── .env.example
├── backend/                     # Node.js REST API
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js                # Entry point
│   └── src/
│       ├── config.js            # Environment & constants
│       ├── database.js          # PostgreSQL pool & schema migrations
│       ├── logger.js            # Pino structured logging
│       ├── auth/                # LDAP & JWT helpers
│       │   ├── ldap.js
│       │   └── jwt.js
│       ├── middleware/           # Security & authentication
│       │   ├── security.js      # Helmet, CORS, rate limiting, compression
│       │   └── auth.js          # JWT verification, RBAC middleware
│       ├── helpers/              # Audit, validators, utilities
│       │   ├── audit.js         # Audit log helper
│       │   ├── validators.js    # Input validation, HTML sanitization
│       │   └── utils.js         # IP extraction, access checks
│       └── routes/               # API route handlers
│           ├── auth.js           # Login, logout, session
│           ├── users.js          # User CRUD
│           ├── organizations.js  # Organization management
│           ├── spaces.js         # Team space management
│           ├── folders.js        # Folder hierarchy
│           ├── pages.js          # Page CRUD, search, export, versions
│           ├── private-space.js  # Private space pages
│           ├── publishing.js     # Publishing workflow
│           ├── comments.js       # Page comments
│           ├── notifications.js  # In-app notifications
│           ├── approvals.js      # Publish approval requests
│           ├── attachments.js    # File uploads
│           ├── tags.js           # Tag management
│           ├── favorites.js      # Bookmarks
│           ├── sharing.js        # Page sharing
│           ├── trash.js          # Soft delete / restore
│           ├── templates.js      # Page templates
│           ├── dashboard.js      # Dashboard statistics
│           ├── settings.js       # User settings (theme, language)
│           ├── graph.js          # Knowledge graph data
│           ├── audit.js          # Audit log queries
│           └── health.js         # Health checks
├── frontend/                    # React SPA (Vite + TypeScript)
│   ├── Dockerfile               # Multi-stage build (build → Nginx)
│   ├── nginx.conf               # Reverse proxy + security headers
│   └── src/
│       ├── api/client.ts        # Typed API client
│       ├── components/          # Reusable UI components
│       ├── context/             # Auth, Toast, Theme, Language contexts
│       ├── hooks/               # Custom hooks (useTheme)
│       ├── i18n/                # Translations (de.ts, en.ts)
│       ├── pages/               # All page components
│       └── styles/index.css     # CSS design system (6 themes)
├── config/
│   └── ldap/                    # LDAP seed data (LDIF)
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

## Data Model

```
organizations
  └── team_spaces
        ├── space_memberships (user ↔ space roles)
        ├── folders (max 3 levels deep)
        └── wiki_pages
              ├── wiki_page_versions
              ├── wiki_page_tags
              ├── wiki_attachments
              ├── wiki_comments
              ├── page_shares
              └── publish_requests

users
  ├── private_spaces → wiki_pages
  ├── wiki_favorites
  ├── user_settings
  └── notifications

audit_log (all actions)
```

## RBAC Roles

### Global Roles

| Permission          | Admin | Auditor | User |
|---------------------|:-----:|:-------:|:----:|
| Read pages          |  ✅   |   ✅    |  ✅  |
| Create pages        |  ✅   |   ❌    |  ✅  |
| Edit own pages      |  ✅   |   ❌    |  ✅  |
| Edit all pages      |  ✅   |   ❌    |  ❌  |
| Delete pages        |  ✅   |   ❌    |  ❌  |
| Review publish      |  ✅   |   ✅    |  ❌  |
| Manage users        |  ✅   |   ❌    |  ❌  |
| View audit log      |  ✅   |   ✅    |  ❌  |
| System health       |  ✅   |   ❌    |  ❌  |
| Manage spaces       |  ✅   |   ❌    |  ❌  |

### Space Roles

| Permission        | Owner | Editor | Reviewer | Viewer |
|-------------------|:-----:|:------:|:--------:|:------:|
| View pages        |  ✅   |   ✅   |    ✅    |   ✅   |
| Create pages      |  ✅   |   ✅   |    ❌    |   ❌   |
| Edit pages        |  ✅   |   ✅   |    ❌    |   ❌   |
| Manage folders    |  ✅   |   ✅   |    ❌    |   ❌   |
| Review publishes  |  ✅   |   ❌   |    ✅    |   ❌   |
| Manage members    |  ✅   |   ❌   |    ❌    |   ❌   |
| Delete space      |  ✅   |   ❌   |    ❌    |   ❌   |

## API Endpoints

### Auth
| Method | Endpoint                  | Auth | Description                |
|--------|---------------------------|------|----------------------------|
| POST   | /api/auth/login           | No   | Login (local or LDAP)      |
| POST   | /api/auth/logout          | Yes  | Logout                     |
| GET    | /api/auth/me              | Yes  | Current user info          |
| POST   | /api/auth/change-password | Yes  | Change password            |

### Organizations & Spaces
| Method | Endpoint                          | Permission     | Description               |
|--------|-----------------------------------|----------------|---------------------------|
| GET    | /api/organizations                | Yes            | List organizations        |
| GET    | /api/spaces                       | Yes            | List team spaces          |
| POST   | /api/spaces                       | users.manage   | Create team space         |
| GET    | /api/spaces/:id                   | Yes            | Get space details         |
| PUT    | /api/spaces/:id                   | Space owner    | Update space              |
| DELETE | /api/spaces/:id                   | Space owner    | Delete space              |
| GET    | /api/spaces/:id/members           | Yes            | List space members        |
| POST   | /api/spaces/:id/members           | Space owner    | Add member                |
| PUT    | /api/spaces/:id/members/:userId   | Space owner    | Update member role        |
| DELETE | /api/spaces/:id/members/:userId   | Space owner    | Remove member             |
| GET    | /api/spaces/:id/folders           | Yes            | List folders              |
| POST   | /api/spaces/:id/folders           | Space editor+  | Create folder             |

### Pages
| Method | Endpoint                        | Permission    | Description                 |
|--------|---------------------------------|---------------|-----------------------------|
| GET    | /api/pages                      | pages.read    | List pages (paginated)      |
| GET    | /api/pages/recent               | pages.read    | Recent pages                |
| GET    | /api/pages/search?q=…           | pages.read    | Full-text search            |
| GET    | /api/pages/export-all           | pages.read    | Export all as Markdown      |
| GET    | /api/pages/:id                  | pages.read    | Get single page             |
| POST   | /api/pages                      | pages.create  | Create page                 |
| PUT    | /api/pages/:id                  | pages.edit    | Update page                 |
| DELETE | /api/pages/:id                  | pages.delete  | Soft delete (→ trash)       |
| GET    | /api/pages/:id/versions         | pages.read    | Version history             |
| POST   | /api/pages/:id/restore          | pages.edit    | Restore version             |
| PUT    | /api/pages/:id/visibility       | pages.edit    | Set workflow status         |
| GET    | /api/pages/:id/export           | pages.read    | Export single page          |
| GET    | /api/pages/:id/tags             | pages.read    | Page tags                   |
| PUT    | /api/pages/:id/tags             | pages.edit    | Set page tags               |

### Publishing Workflow
| Method | Endpoint                              | Permission     | Description               |
|--------|---------------------------------------|----------------|---------------------------|
| GET    | /api/publishing/requests              | Yes            | List publish requests     |
| POST   | /api/publishing/requests              | pages.edit     | Submit for review         |
| POST   | /api/publishing/requests/:id/approve  | users.manage   | Approve request           |
| POST   | /api/publishing/requests/:id/reject   | users.manage   | Reject request            |
| POST   | /api/publishing/requests/:id/request-changes | users.manage | Request changes    |
| POST   | /api/publishing/requests/:id/cancel   | pages.edit     | Cancel request            |
| POST   | /api/publishing/pages/:id/archive     | pages.edit     | Archive page              |
| POST   | /api/publishing/pages/:id/unpublish   | pages.edit     | Unpublish page            |

### Private Space
| Method | Endpoint                    | Auth | Description                 |
|--------|-----------------------------|------|-----------------------------|
| GET    | /api/private-space          | Yes  | List private pages          |
| POST   | /api/private-space          | Yes  | Create private page         |
| PUT    | /api/private-space/:id      | Yes  | Update private page         |
| DELETE | /api/private-space/:id      | Yes  | Delete private page         |

### Tags, Favorites, Sharing
| Method | Endpoint                     | Auth | Description             |
|--------|------------------------------|------|-------------------------|
| GET    | /api/tags                    | Yes  | List tags               |
| POST   | /api/tags                    | Yes  | Create tag              |
| PUT    | /api/tags/:id                | Yes  | Update tag              |
| DELETE | /api/tags/:id                | Yes  | Delete tag              |
| GET    | /api/favorites               | Yes  | List favorites          |
| POST   | /api/favorites/:pageId       | Yes  | Toggle favorite         |
| GET    | /api/favorites/:pageId/check | Yes  | Check if favorited      |
| GET    | /api/shared                  | Yes  | Pages shared with me    |

### Notifications & Comments
| Method | Endpoint                        | Auth | Description             |
|--------|---------------------------------|------|-------------------------|
| GET    | /api/notifications              | Yes  | List notifications      |
| GET    | /api/notifications/unread       | Yes  | Unread count            |
| PUT    | /api/notifications/:id/read     | Yes  | Mark as read            |
| PUT    | /api/notifications/read-all     | Yes  | Mark all as read        |
| GET    | /api/pages/:id/comments         | Yes  | List comments           |
| POST   | /api/pages/:id/comments         | Yes  | Add comment             |
| DELETE | /api/comments/:id               | Yes  | Delete comment          |

### Admin
| Method | Endpoint               | Permission     | Description        |
|--------|------------------------|----------------|--------------------|
| GET    | /api/users             | users.read     | List users         |
| GET    | /api/users/list        | Yes            | Lightweight list   |
| POST   | /api/users             | users.manage   | Create user        |
| PUT    | /api/users/:id         | users.manage   | Update user        |
| DELETE | /api/users/:id         | users.manage   | Delete user        |
| GET    | /api/audit             | audit.read     | Audit log          |
| GET    | /api/dashboard         | users.manage   | Dashboard stats    |

### Settings, Graph, Health, Trash
| Method | Endpoint                       | Auth | Description            |
|--------|--------------------------------|------|------------------------|
| GET    | /api/settings/theme            | Yes  | Get user's theme       |
| PUT    | /api/settings/theme            | Yes  | Set user's theme       |
| GET    | /api/settings/language         | Yes  | Get user's language    |
| PUT    | /api/settings/language         | Yes  | Set user's language    |
| GET    | /api/graph                     | Yes  | Knowledge graph data   |
| GET    | /api/health                    | No   | Health check           |
| GET    | /api/health/details            | Yes  | Detailed health info   |
| GET    | /api/trash                     | Yes  | List trashed pages     |
| POST   | /api/trash/:id/restore         | Yes  | Restore from trash     |
| DELETE | /api/trash/:id                 | Yes  | Permanently delete     |
| GET    | /api/attachments/:id/download  | Yes  | Download attachment    |
| DELETE | /api/attachments/:id           | Yes  | Delete attachment      |

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
|------------|-----------|
| admins     | admin     |
| auditors   | auditor   |
| users      | user      |

Users are auto-provisioned on first LDAP login. Local auth is used as fallback.

## Operations

### Logs

```bash
docker compose logs -f           # all services
docker compose logs -f wiki      # backend only (JSON via pino)
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

| Variable           | Required | Default                          | Description                     |
|--------------------|:--------:|----------------------------------|---------------------------------|
| DB_NAME            | No       | wikidb                           | Database name                   |
| DB_USER            | No       | wikiuser                         | Database user                   |
| DB_PASS            | **Yes**  | —                                | Database password               |
| JWT_SECRET         | **Yes**  | —                                | JWT signing secret (≥ 32 chars) |
| JWT_EXPIRES        | No       | 8h                               | JWT token lifetime              |
| COOKIE_SECURE      | No       | false                            | Set true behind HTTPS           |
| CORS_ORIGIN        | No       | *(all origins)*                  | Comma-separated allowed origins |
| LDAP_ENABLED       | No       | false                            | Enable LDAP authentication      |
| LDAP_URL           | No       | ldap://ldap:389                  | LDAP server URL                 |
| LDAP_BIND_DN       | No       | cn=admin,dc=wiki,dc=local        | LDAP service account DN         |
| LDAP_BIND_PW       | If LDAP  | —                                | LDAP service account password   |
| LDAP_SEARCH_BASE   | No       | ou=users,dc=wiki,dc=local        | LDAP user search base           |
| LDAP_SEARCH_FILTER | No       | (uid={{username}})               | LDAP user search filter         |
| LDAP_GROUP_BASE    | No       | ou=groups,dc=wiki,dc=local       | LDAP group search base          |

## Security Notes

- **Never commit `.env`** — it's in `.gitignore` by default
- **Change the default admin password** after first login
- JWT secret must be ≥ 32 characters; generate with `openssl rand -base64 32`
- All containers run as non-root users
- Backend and database are on an **internal Docker network** (not exposed to host)
- Frontend HTML is sanitized twice: DOMPurify (client) + sanitize-html library (server)
- Rate limiting on auth (20/15min), writes (60/15min), general (300/15min)
- Nginx adds HSTS, X-Frame-Options, X-Content-Type-Options headers
- Resource limits (CPU/memory) configured per container in docker-compose.yml
- Structured JSON logging (pino) with request ID correlation

## Behobene Bugs (Bug-Tracker)

| #  | Schweregrad | Kategorie | Beschreibung | Datei(en) |
|----|-------------|-----------|--------------|-----------|
| 1  | 🔴 Kritisch | RBAC | `user`-Rolle fehlte `pages.edit`-Permission – Benutzer konnten Seiten erstellen, aber nicht bearbeiten | `backend/src/config.js` |
| 2  | 🔴 Kritisch | XSS | Such-Snippets wurden mit `dangerouslySetInnerHTML` ohne DOMPurify gerendert – XSS-Injection möglich | `frontend/src/components/Layout.tsx` |
| 3  | 🟠 Hoch | Feature-Bug | E-Mail-Benachrichtigungen (`notifyComment`, `notifyPublishStatus`) definiert aber nie aufgerufen | `backend/src/routes/comments.js`, `publishing.js` |
| 4  | 🔴 Kritisch | Security | Server-seitige HTML-Sanitisierung nutzte Regex – umgehbar via `<svg/onload>`, verschachtelte Tags | `backend/src/helpers/validators.js` |
| 5  | 🟠 Hoch | Security | Admin-Einstellungen akzeptierten beliebige Keys – kein Allowlist | `backend/src/routes/settings.js` |
| 6  | 🟡 Mittel | Data Growth | `login_attempts`-Tabelle wuchs unbegrenzt – kein Cleanup-Mechanismus | `backend/src/database.js` |
| 7  | 🟠 Hoch | Logic | Workflow-Statusübergänge (`VALID_TRANSITIONS`) definiert aber nie geprüft | `backend/src/routes/publishing.js` |
| 8  | 🟡 Mittel | Logging | Inkonsistentes Logging: `console.log`/`console.error` statt strukturiertem pino-Logger | `backend/server.js`, `database.js` |
| 9  | 🔴 Kritisch | Auth-Bypass | `PUT /pages/:id/visibility` umging den gesamten Publishing-Workflow – jeder Owner konnte direkt veröffentlichen | `backend/src/routes/pages.js` |
| 10 | 🔴 Kritisch | Logic | `request-changes` ließ Publish-Request auf `pending` – Workflow-Deadlock, Autor konnte nicht erneut einreichen | `backend/src/routes/publishing.js` |
| 11 | 🟠 Hoch | Security | HTML-Injection in E-Mail-Benachrichtigungen – Benutzereingaben unescaped in HTML-Templates interpoliert | `backend/src/helpers/email.js` |
| 12 | 🟡 Mittel | Crash | `GET /auth/me` fehlte Pool-Null-Check – Crash bei DB-Disconnect | `backend/src/routes/auth.js` |
| 13 | 🟡 Mittel | Auth-Bypass | `POST /spaces` fehlte `requirePermission('spaces.create')` – jeder User konnte Spaces erstellen | `backend/src/routes/spaces.js` |
| 14 | 🟡 Mittel | Security | Attachment-Löschung ohne `path.basename()` – potenzieller Path-Traversal bei DB-Kompromittierung | `backend/src/routes/attachments.js` |

### Fix-Details

- **Bug 1**: `pages.edit` und `pages.delete` zur `user`-Permission hinzugefügt
- **Bug 2**: DOMPurify mit Tag-Allowlist (`<mark>`, `<b>`, `<em>`, `<strong>`) für Such-Snippets
- **Bug 3**: `notifyComment()` in Comments-Route und `notifyPublishStatus()` in Publishing-Route eingebunden
- **Bug 4**: Regex-Sanitisierung durch `sanitize-html`-Bibliothek ersetzt (DOM-basiert, strikte Allowlist)
- **Bug 5**: `ALLOWED_ADMIN_KEYS`-Allowlist – unbekannte Schlüssel werden mit HTTP 400 abgelehnt
- **Bug 6**: Automatisches Cleanup: Login-Versuche >24h werden beim DB-Start gelöscht
- **Bug 7**: `isValidTransition()`-Funktion – Validierung in approve/reject/request-changes-Endpoints
- **Bug 8**: Alle `console.log`/`console.error` durch strukturierten pino-Logger ersetzt
- **Bug 9**: Nur Admins dürfen `published`/`approved`/`archived` direkt setzen; andere nutzen den Workflow
- **Bug 10**: Publish-Request-Status wird auf `changes_requested` gesetzt (nicht mehr `pending`)
- **Bug 11**: `escapeHtml()`-Funktion für alle Benutzereingaben in E-Mail-Templates
- **Bug 12**: Pool-Null-Check hinzugefügt → HTTP 503 statt Crash
- **Bug 13**: `requirePermission('spaces.create')` als Middleware hinzugefügt
- **Bug 14**: `path.basename()` konsistent in Download- und Lösch-Route

## Author

**Jonas** — [github.com/Dschonas04](https://github.com/Dschonas04)

## License

Apache License 2.0 — see [LICENSE](LICENSE).

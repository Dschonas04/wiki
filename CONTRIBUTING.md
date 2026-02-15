# Contributing

Thanks for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork
3. Create a feature branch: `git checkout -b feature/my-feature`
4. Make your changes
5. Test locally with Docker Compose
6. Commit with a clear message
7. Push and open a Pull Request

## Development Setup

```bash
cp .env.example .env
# Edit .env with your values

docker compose up -d
docker compose logs -f
```

The app runs at **http://localhost:8080**.

### Backend changes

After editing `backend/server.js`:

```bash
docker compose up -d --build wiki
```

### Frontend changes

After editing files in `frontend/src/`:

```bash
docker compose up -d --build frontend
```

## Project Structure

| Directory    | Contents                                     |
|-------------|----------------------------------------------|
| `backend/`  | Express REST API (server.js, Dockerfile)     |
| `frontend/` | React + Vite + TypeScript SPA                |
| `config/`   | LDAP seed data and other config              |
| `docs/`     | Design documentation                         |

## Guidelines

- Keep changes focused — one feature or fix per PR
- Test that `docker compose build && docker compose up -d` works
- Don't commit secrets, `.env` files, or `node_modules/`
- Use meaningful commit messages

## Code Style

- **Backend**: Plain JavaScript (ES2020+), Express conventions
- **Frontend**: TypeScript, React functional components with hooks
- **CSS**: Custom properties, no CSS framework

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Docker/OS version if relevant

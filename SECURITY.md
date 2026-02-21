# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, **please do not open a public issue**.

Instead, report it privately:

1. contact via [GitHub](https://github.com/Dschonas04)
2. Or use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to respond within **72 hours** and will coordinate a fix before public disclosure.

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | ✅        |

## Security Best Practices for Deployment

### Required

- [ ] Set a strong `DB_PASS` (≥ 24 random characters)
- [ ] Set a strong `JWT_SECRET` (≥ 32 random characters): `openssl rand -base64 32`
- [ ] Change the default admin password (`admin`/`admin`) immediately after first login
- [ ] Never commit `.env` to version control

### Recommended

- [ ] Use TLS termination (e.g., Traefik, Caddy, or a reverse proxy with Let's Encrypt)
- [ ] Set `secure: true` on the cookie in `server.js` when behind TLS
- [ ] Restrict Docker port bindings to localhost (`127.0.0.1:8080:80`) if not publicly accessible
- [ ] Enable LDAP over TLS (`ldaps://`) in production
- [ ] Regularly update base images: `docker compose build --pull --no-cache`
- [ ] Set up automated backups for the PostgreSQL volume
- [ ] Review the audit log periodically

### Container Security

- All application containers run as non-root users
- Node.js backend uses `NODE_ENV=production`
- Nginx hides version info and blocks suspicious paths
- Docker images are based on Alpine Linux (minimal attack surface)

## Dependencies

Security updates for npm dependencies should be monitored with:

```bash
cd backend && npm audit
cd frontend && npm audit
```

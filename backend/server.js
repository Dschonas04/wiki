const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const ldap = require('ldapjs');

const app = express();
const port = parseInt(process.env.PORT || '3000');
const isProduction = process.env.NODE_ENV === 'production';

// ==================== CONFIG ====================

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';
const COOKIE_NAME = 'wiki_token';
const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true'
  : false; // Default to false — set to 'true' when behind HTTPS
const BCRYPT_ROUNDS = 12;

// LDAP Configuration
const LDAP_ENABLED = process.env.LDAP_ENABLED === 'true';
const LDAP_URL = process.env.LDAP_URL || 'ldap://ldap:389';
const LDAP_BIND_DN = process.env.LDAP_BIND_DN || 'cn=admin,dc=wiki,dc=local';
const LDAP_BIND_PW = process.env.LDAP_BIND_PW || '';
const LDAP_SEARCH_BASE = process.env.LDAP_SEARCH_BASE || 'ou=users,dc=wiki,dc=local';
const LDAP_SEARCH_FILTER = process.env.LDAP_SEARCH_FILTER || '(uid={{username}})';
const LDAP_GROUP_BASE = process.env.LDAP_GROUP_BASE || 'ou=groups,dc=wiki,dc=local';

// Map LDAP groups → wiki roles
const LDAP_ROLE_MAP = {
  admins: 'admin',
  editors: 'editor',
  viewers: 'viewer',
};

// RBAC Permissions per role
const PERMISSIONS = {
  admin:  ['pages.read', 'pages.create', 'pages.edit', 'pages.delete', 'users.read', 'users.manage', 'health.read', 'audit.read'],
  editor: ['pages.read', 'pages.create', 'pages.edit', 'pages.delete', 'health.read'],
  viewer: ['pages.read', 'health.read'],
};

// ==================== SECURITY ====================

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());
app.use(cookieParser());

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many write requests. Please try again later.' },
});

app.use(express.json({ limit: '1mb' }));

// CSRF protection
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    if (!req.headers['x-requested-with']) {
      return res.status(403).json({ error: 'Forbidden: missing security header' });
    }
  }
  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  const rid = req.headers['x-request-id'] || '-';
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms) [${rid}]`);
  });
  next();
});

// ==================== DATABASE ====================

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'wikidb',
  user: process.env.DB_USER || 'wikiuser',
  password: process.env.DB_PASS,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

let pool = null;

async function connectWithRetry(maxRetries = 10, delay = 3000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Connecting to database… (attempt ${i + 1}/${maxRetries})`);
      const testPool = new Pool(dbConfig);
      const client = await testPool.connect();
      console.log('Connected to PostgreSQL');

      // ===== Users table =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) NOT NULL UNIQUE,
          password_hash VARCHAR(255),
          display_name VARCHAR(255),
          email VARCHAR(255),
          role VARCHAR(20) NOT NULL DEFAULT 'viewer',
          auth_source VARCHAR(20) NOT NULL DEFAULT 'local',
          is_active BOOLEAN NOT NULL DEFAULT true,
          last_login TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT valid_role CHECK (role IN ('admin', 'editor', 'viewer')),
          CONSTRAINT valid_auth_source CHECK (auth_source IN ('local', 'ldap'))
        )
      `);

      // ===== Wiki pages table =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_pages (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL UNIQUE,
          content TEXT NOT NULL DEFAULT '',
          created_by INTEGER REFERENCES users(id),
          updated_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ===== Wiki page versions table =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_page_versions (
          id SERIAL PRIMARY KEY,
          page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          version_number INTEGER NOT NULL
        )
      `);

      // ===== Audit log table =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          username VARCHAR(100),
          action VARCHAR(50) NOT NULL,
          resource_type VARCHAR(50),
          resource_id INTEGER,
          details JSONB,
          ip_address VARCHAR(45),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Migration-safe: add columns if they don't exist
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wiki_pages' AND column_name='created_by') THEN
            ALTER TABLE wiki_pages ADD COLUMN created_by INTEGER REFERENCES users(id);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wiki_pages' AND column_name='updated_by') THEN
            ALTER TABLE wiki_pages ADD COLUMN updated_by INTEGER REFERENCES users(id);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wiki_pages' AND column_name='search_vector') THEN
            ALTER TABLE wiki_pages ADD COLUMN search_vector tsvector;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wiki_pages' AND column_name='parent_id') THEN
            ALTER TABLE wiki_pages ADD COLUMN parent_id INTEGER REFERENCES wiki_pages(id) ON DELETE SET NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wiki_pages' AND column_name='content_type') THEN
            ALTER TABLE wiki_pages ADD COLUMN content_type VARCHAR(20) NOT NULL DEFAULT 'markdown';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wiki_pages' AND column_name='visibility') THEN
            ALTER TABLE wiki_pages ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'draft';
            UPDATE wiki_pages SET visibility = 'published';
          END IF;
        END; $$
      `);

      // Search vector trigger
      await client.query(`
        CREATE OR REPLACE FUNCTION update_wiki_search_vector()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.search_vector := to_tsvector('simple', coalesce(NEW.title,'') || ' ' || coalesce(NEW.content,''));
          RETURN NEW;
        END;
        $$ LANGUAGE 'plpgsql'
      `);

      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'wiki_pages_search_vector') THEN
            CREATE TRIGGER wiki_pages_search_vector
              BEFORE INSERT OR UPDATE ON wiki_pages
              FOR EACH ROW
              EXECUTE FUNCTION update_wiki_search_vector();
          END IF;
        END; $$
      `);

      await client.query(`
        UPDATE wiki_pages
        SET search_vector = to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,''))
        WHERE search_vector IS NULL
      `);

      // Updated_at trigger
      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
        $$ language 'plpgsql'
      `);

      for (const tbl of ['wiki_pages', 'users']) {
        await client.query(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_${tbl}_updated_at') THEN
              CREATE TRIGGER update_${tbl}_updated_at
                BEFORE UPDATE ON ${tbl} FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
            END IF;
          END; $$
        `);
      }

      // Migration: add must_change_password column
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='must_change_password') THEN
            ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wiki_page_versions' AND column_name='content_type') THEN
            ALTER TABLE wiki_page_versions ADD COLUMN content_type VARCHAR(20) NOT NULL DEFAULT 'markdown';
          END IF;
        END; $$
      `);

      // Create default admin user if no users exist
      const userCount = await client.query('SELECT COUNT(*) FROM users');
      if (parseInt(userCount.rows[0].count) === 0) {
        const defaultPassword = crypto.randomBytes(16).toString('base64url');
        const hash = await bcrypt.hash(defaultPassword, BCRYPT_ROUNDS);
        await client.query(
          `INSERT INTO users (username, password_hash, display_name, email, role, auth_source, must_change_password)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          ['admin', hash, 'Administrator', 'admin@wiki.local', 'admin', 'local', true]
        );
        console.log('╔══════════════════════════════════════════════════╗');
        console.log('║  DEFAULT ADMIN CREATED                           ║');
        console.log('║  Username: admin                                 ║');
        console.log(`║  Password: ${defaultPassword.padEnd(37)}║`);
        console.log('║  ⚠  CHANGE THIS PASSWORD AFTER FIRST LOGIN!     ║');
        console.log('╚══════════════════════════════════════════════════╝');
      }

      // ===== Tags table =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_tags (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL UNIQUE,
          color VARCHAR(7) DEFAULT '#6366f1',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_page_tags (
          page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
          tag_id INTEGER NOT NULL REFERENCES wiki_tags(id) ON DELETE CASCADE,
          PRIMARY KEY (page_id, tag_id)
        )
      `);

      // ===== Favorites table =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_favorites (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, page_id)
        )
      `);

      // ===== Page Shares table =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_page_shares (
          id SERIAL PRIMARY KEY,
          page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
          shared_with_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          permission VARCHAR(20) NOT NULL DEFAULT 'read',
          shared_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(page_id, shared_with_user_id),
          CONSTRAINT valid_share_permission CHECK (permission IN ('read', 'edit'))
        )
      `);

      // Indexes
      await client.query('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_wiki_pages_search ON wiki_pages USING GIN (search_vector)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_versions_page ON wiki_page_versions(page_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_pages_parent ON wiki_pages(parent_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_page_tags_page ON wiki_page_tags(page_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_page_tags_tag ON wiki_page_tags(tag_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_favorites_user ON wiki_favorites(user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_favorites_page ON wiki_favorites(page_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_shares_page ON wiki_page_shares(page_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_shares_user ON wiki_page_shares(shared_with_user_id)');

      console.log('Database schema initialized');
      client.release();
      pool = testPool;
      return true;
    } catch (err) {
      console.error(`DB connection failed (${i + 1}/${maxRetries}):`, err.message);
      if (i < maxRetries - 1) {
        console.log(`Retrying in ${delay / 1000}s…`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  console.error('Could not connect to database');
  return false;
}

// ==================== AUDIT LOGGING ====================

async function auditLog(userId, username, action, resourceType, resourceId, details, ipAddress) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, username, action, resourceType, resourceId, details ? JSON.stringify(details) : null, ipAddress]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

// ==================== LDAP AUTHENTICATION ====================

function ldapAuthenticate(username, password) {
  return new Promise((resolve, reject) => {
    if (!LDAP_ENABLED) return reject(new Error('LDAP not enabled'));

    const client = ldap.createClient({
      url: LDAP_URL,
      connectTimeout: 5000,
      timeout: 5000,
    });

    client.on('error', (err) => {
      console.error('LDAP error:', err.message);
      reject(new Error('LDAP connection failed'));
    });

    // 1) Bind as service account
    client.bind(LDAP_BIND_DN, LDAP_BIND_PW, (err) => {
      if (err) { client.destroy(); return reject(new Error('LDAP service bind failed')); }

      const filter = LDAP_SEARCH_FILTER.replace('{{username}}', username.replace(/[()\\*]/g, ''));
      const searchOpts = { scope: 'sub', filter, attributes: ['uid', 'cn', 'mail', 'displayName', 'memberOf'] };

      // 2) Search for user
      client.search(LDAP_SEARCH_BASE, searchOpts, (err, res) => {
        if (err) { client.destroy(); return reject(new Error('LDAP search failed')); }

        let userEntry = null;

        res.on('searchEntry', (entry) => {
          userEntry = { dn: entry.objectName || entry.dn, uid: null, cn: null, mail: null, displayName: null, memberOf: [] };
          if (entry.attributes) {
            for (const attr of entry.attributes) {
              const name = attr.type || attr._type;
              const vals = attr.values || attr.vals || attr._vals || [];
              if (name === 'uid') userEntry.uid = vals[0]?.toString?.() || vals[0];
              if (name === 'cn') userEntry.cn = vals[0]?.toString?.() || vals[0];
              if (name === 'mail') userEntry.mail = vals[0]?.toString?.() || vals[0];
              if (name === 'displayName') userEntry.displayName = vals[0]?.toString?.() || vals[0];
              if (name === 'memberOf') userEntry.memberOf = vals.map(v => v.toString?.() || v);
            }
          }
        });

        res.on('error', () => { client.destroy(); reject(new Error('LDAP search error')); });

        res.on('end', () => {
          if (!userEntry) { client.destroy(); return reject(new Error('User not found in LDAP')); }

          // 3) Bind as user to verify password
          client.bind(userEntry.dn, password, (err) => {
            client.destroy();
            if (err) return reject(new Error('Invalid LDAP credentials'));

            // 4) Determine role from LDAP groups
            let role = 'viewer';
            for (const mo of userEntry.memberOf) {
              const cnMatch = mo.match(/cn=([^,]+)/i);
              if (cnMatch) {
                const group = cnMatch[1].toLowerCase();
                if (LDAP_ROLE_MAP[group]) {
                  const mapped = LDAP_ROLE_MAP[group];
                  if (mapped === 'admin') role = 'admin';
                  else if (mapped === 'editor' && role !== 'admin') role = 'editor';
                }
              }
            }

            resolve({
              username: userEntry.uid || username,
              displayName: userEntry.displayName || userEntry.cn || username,
              email: userEntry.mail || '',
              role,
            });
          });
        });
      });
    });
  });
}

// ==================== JWT HELPERS ====================

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, displayName: user.display_name || user.displayName },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function setTokenCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SECURE ? 'strict' : 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

// ==================== AUTH MIDDLEWARE ====================

async function authenticate(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verify user still exists and is active (token revocation)
    if (pool) {
      const check = await pool.query(
        'SELECT id, username, role, is_active, must_change_password FROM users WHERE id = $1',
        [decoded.id]
      );
      if (check.rows.length === 0 || !check.rows[0].is_active) {
        res.clearCookie(COOKIE_NAME);
        return res.status(401).json({ error: 'Account disabled or deleted.' });
      }
      // Use latest role from DB (not stale JWT)
      decoded.role = check.rows[0].role;
      decoded.mustChangePassword = check.rows[0].must_change_password;
    }
    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

function requirePermission(...perms) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const userPerms = PERMISSIONS[req.user.role] || [];
    const hasAll = perms.every(p => userPerms.includes(p));
    if (!hasAll) {
      return res.status(403).json({ error: 'Insufficient permissions', required: perms, your_role: req.user.role });
    }
    next();
  };
}

// ==================== HELPERS ====================

function validatePassword(password) {
  const errors = [];
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters.');
  else {
    if (!/[a-zA-Z]/.test(password)) errors.push('Password must contain at least one letter.');
    if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number.');
    if (!/[^a-zA-Z0-9]/.test(password)) errors.push('Password must contain at least one special character.');
  }
  return errors;
}

function validatePageInput(title, content) {
  const errors = [];
  if (!title || !title.trim()) errors.push('Title is required.');
  else if (title.trim().length > 255) errors.push('Title must be 255 characters or less.');
  if (!content || !content.trim()) errors.push('Content is required.');
  else if (content.length > 100000) errors.push('Content must be 100 000 characters or less.');
  return errors;
}

function getIp(req) {
  return req.headers['x-real-ip'] || req.ip;
}

// ==================================================
//                     ROUTES
// ==================================================

// ==================== AUTH ====================

app.post('/api/auth/login', authLimiter, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  const cleanUser = username.trim().toLowerCase();

  try {
    // Try LDAP first
    if (LDAP_ENABLED) {
      try {
        const ldapUser = await ldapAuthenticate(cleanUser, password);
        console.log(`LDAP auth OK: ${cleanUser} (${ldapUser.role})`);
        const upsert = await pool.query(`
          INSERT INTO users (username, display_name, email, role, auth_source, last_login, is_active)
          VALUES ($1, $2, $3, $4, 'ldap', CURRENT_TIMESTAMP, true)
          ON CONFLICT (username) DO UPDATE SET
            display_name = EXCLUDED.display_name, email = EXCLUDED.email,
            role = EXCLUDED.role, auth_source = 'ldap', last_login = CURRENT_TIMESTAMP
          RETURNING *`,
          [cleanUser, ldapUser.displayName, ldapUser.email, ldapUser.role]);
        const user = upsert.rows[0];
        user.must_change_password = false; // LDAP users don't need forced change
        const token = signToken(user);
        setTokenCookie(res, token);
        await auditLog(user.id, user.username, 'login', 'auth', null, { source: 'ldap' }, getIp(req));
        return res.json({ user: formatUser(user) });
      } catch (ldapErr) {
        console.log(`LDAP failed for ${cleanUser}: ${ldapErr.message} → trying local`);
      }
    }

    // Local authentication
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND auth_source = $2 AND is_active = true',
      [cleanUser, 'local']
    );
    if (result.rows.length === 0) {
      await auditLog(null, cleanUser, 'login_failed', 'auth', null, { reason: 'not found' }, getIp(req));
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await auditLog(user.id, user.username, 'login_failed', 'auth', null, { reason: 'wrong password' }, getIp(req));
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    const token = signToken(user);
    setTokenCookie(res, token);
    await auditLog(user.id, user.username, 'login', 'auth', null, { source: 'local' }, getIp(req));
    res.json({ user: formatUser(user), mustChangePassword: !!user.must_change_password });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
  await auditLog(req.user.id, req.user.username, 'logout', 'auth', null, null, getIp(req));
  res.clearCookie(COOKIE_NAME);
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, display_name, email, role, auth_source, last_login, created_at, must_change_password FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({ error: 'User not found' });
    }
    res.json(formatUser(result.rows[0]));
  } catch (err) {
    console.error('Get me error:', err.message);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Password change
app.post('/api/auth/change-password', authenticate, writeLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required.' });

  const pwErrors = validatePassword(newPassword);
  if (pwErrors.length > 0) return res.status(400).json({ error: pwErrors.join(' '), errors: pwErrors });

  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1 AND auth_source = $2', [req.user.id, 'local']);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Password change is only available for local accounts.' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      await auditLog(user.id, user.username, 'password_change_failed', 'auth', null, { reason: 'wrong current password' }, getIp(req));
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [hash, user.id]);
    await auditLog(user.id, user.username, 'password_changed', 'auth', null, null, getIp(req));

    // Issue new token with updated state
    const updated = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);
    const token = signToken(updated.rows[0]);
    setTokenCookie(res, token);

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Password change error:', err.message);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

function formatUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    email: u.email,
    role: u.role,
    authSource: u.auth_source,
    lastLogin: u.last_login,
    createdAt: u.created_at,
    mustChangePassword: u.must_change_password || false,
    permissions: PERMISSIONS[u.role] || [],
  };
}

// ==================== USER MANAGEMENT (admin) ====================

app.get('/api/users', authenticate, requirePermission('users.read'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, display_name, email, role, auth_source, is_active, last_login, created_at
       FROM users ORDER BY created_at ASC`
    );
    res.json(result.rows.map(u => ({
      id: u.id, username: u.username, displayName: u.display_name, email: u.email,
      role: u.role, authSource: u.auth_source, isActive: u.is_active,
      lastLogin: u.last_login, createdAt: u.created_at,
    })));
  } catch (err) {
    console.error('Error listing users:', err.message);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

app.post('/api/users', authenticate, requirePermission('users.manage'), writeLimiter, async (req, res) => {
  const { username, password, displayName, email, role } = req.body;
  const errors = [];
  if (!username || !username.trim()) errors.push('Username is required.');
  errors.push(...validatePassword(password));
  if (!['admin', 'editor', 'viewer'].includes(role)) errors.push('Invalid role.');
  if (errors.length > 0) return res.status(400).json({ error: errors.join(' '), errors });
  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, display_name, email, role, auth_source)
       VALUES ($1, $2, $3, $4, $5, 'local') RETURNING id, username, display_name, email, role, auth_source, created_at`,
      [username.trim().toLowerCase(), hash, displayName || username, email || null, role]
    );
    const user = result.rows[0];
    await auditLog(req.user.id, req.user.username, 'create_user', 'user', user.id, { target: user.username, role }, getIp(req));
    res.status(201).json({ id: user.id, username: user.username, displayName: user.display_name, email: user.email, role: user.role, authSource: user.auth_source });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists.' });
    console.error('Error creating user:', err.message);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', authenticate, requirePermission('users.manage'), writeLimiter, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot modify your own account' });

  const { role, isActive, displayName, email } = req.body;
  const updates = []; const params = []; let idx = 1;
  if (role && ['admin', 'editor', 'viewer'].includes(role)) { updates.push(`role = $${idx++}`); params.push(role); }
  if (typeof isActive === 'boolean') { updates.push(`is_active = $${idx++}`); params.push(isActive); }
  if (displayName !== undefined) { updates.push(`display_name = $${idx++}`); params.push(displayName); }
  if (email !== undefined) { updates.push(`email = $${idx++}`); params.push(email || null); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(id);
  try {
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, display_name, email, role, auth_source, is_active`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];
    await auditLog(req.user.id, req.user.username, 'update_user', 'user', user.id, { changes: req.body }, getIp(req));
    res.json({ id: user.id, username: user.username, displayName: user.display_name, email: user.email, role: user.role, authSource: user.auth_source, isActive: user.is_active });
  } catch (err) {
    console.error('Error updating user:', err.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', authenticate, requirePermission('users.manage'), writeLimiter, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING username', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    await auditLog(req.user.id, req.user.username, 'delete_user', 'user', id, { target: result.rows[0].username }, getIp(req));
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Error deleting user:', err.message);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ==================== USERS BASIC LIST ====================

// Lightweight user list for share dialogs (any authenticated user)
app.get('/api/users/list', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, display_name FROM users WHERE is_active = true ORDER BY display_name ASC'
    );
    res.json(result.rows.map(u => ({ id: u.id, username: u.username, displayName: u.display_name })));
  } catch (err) {
    console.error('Error listing users:', err.message);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// ==================== AUDIT LOG ====================

app.get('/api/audit', authenticate, requirePermission('audit.read'), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const result = await pool.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    const count = await pool.query('SELECT COUNT(*) FROM audit_log');
    res.json({ items: result.rows, total: parseInt(count.rows[0].count), limit, offset });
  } catch (err) {
    console.error('Audit log error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve audit log' });
  }
});

// ==================== HEALTH ====================

// Public health check — minimal info (for Docker healthcheck / load balancers)
app.get('/api/health', async (req, res) => {
  if (!pool) return res.status(503).json({ status: 'unhealthy' });
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy' });
  } catch {
    res.status(503).json({ status: 'unhealthy' });
  }
});

// Detailed health — requires authentication
app.get('/api/health/details', authenticate, requirePermission('health.read'), async (req, res) => {
  if (!pool) return res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  try {
    const result = await pool.query('SELECT NOW()');
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const pageCount = await pool.query('SELECT COUNT(*) FROM wiki_pages');
    res.json({
      status: 'healthy',
      database: 'connected',
      ldap: LDAP_ENABLED ? 'enabled' : 'disabled',
      rbac: 'active',
      roles: Object.keys(PERMISSIONS),
      counts: { users: parseInt(userCount.rows[0].count), pages: parseInt(pageCount.rows[0].count) },
      timestamp: result.rows[0].now,
      uptime: Math.floor(process.uptime()),
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', database: 'error' });
  }
});

// ==================== WIKI PAGES ====================

// Recent pages (for dashboard widget)
app.get('/api/pages/recent', authenticate, requirePermission('pages.read'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const isAdmin = req.user.role === 'admin';
  try {
    const result = await pool.query(`
      SELECT p.id, p.title, p.updated_at, p.created_at, p.visibility, u.username AS updated_by_name
      FROM wiki_pages p
      LEFT JOIN users u ON p.updated_by = u.id
      WHERE ${isAdmin ? 'TRUE' : `(p.visibility = 'published' OR p.created_by = $2 OR EXISTS (SELECT 1 FROM wiki_page_shares s WHERE s.page_id = p.id AND s.shared_with_user_id = $2))`}
      ORDER BY p.updated_at DESC
      LIMIT $1`, isAdmin ? [limit] : [limit, req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting recent pages:', err.message);
    res.status(500).json({ error: 'Failed to retrieve recent pages' });
  }
});

// Export page as markdown
app.get('/api/pages/:id/export', authenticate, requirePermission('pages.read'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const result = await pool.query('SELECT * FROM wiki_pages WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    const page = result.rows[0];
    const md = `# ${page.title}\n\n${page.content}\n\n---\n_Exported from Wiki on ${new Date().toISOString()}_\n`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${page.title.replace(/[^a-z0-9]/gi, '_')}.md"`);
    res.send(md);
  } catch (err) {
    console.error('Error exporting page:', err.message);
    res.status(500).json({ error: 'Failed to export page' });
  }
});

// Export full page tree as JSON (all pages with hierarchy)
app.get('/api/pages/export-all', authenticate, requirePermission('pages.read'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const isAdmin = req.user.role === 'admin';
  try {
    const result = await pool.query(`
      SELECT p.id, p.title, p.content, p.content_type, p.parent_id, p.created_at, p.updated_at,
             u1.username AS created_by_name, u2.username AS updated_by_name
      FROM wiki_pages p
      LEFT JOIN users u1 ON p.created_by = u1.id
      LEFT JOIN users u2 ON p.updated_by = u2.id
      WHERE ${isAdmin ? 'TRUE' : `(p.visibility = 'published' OR p.created_by = $1 OR EXISTS (SELECT 1 FROM wiki_page_shares s WHERE s.page_id = p.id AND s.shared_with_user_id = $1))`}
      ORDER BY p.parent_id NULLS FIRST, p.title ASC`, isAdmin ? [] : [req.user.id]);
    const tagsResult = await pool.query(`
      SELECT pt.page_id, t.name, t.color
      FROM wiki_page_tags pt
      JOIN wiki_tags t ON pt.tag_id = t.id`);
    const tagMap = {};
    for (const row of tagsResult.rows) {
      if (!tagMap[row.page_id]) tagMap[row.page_id] = [];
      tagMap[row.page_id].push({ name: row.name, color: row.color });
    }

    const pages = result.rows.map(p => ({ ...p, tags: tagMap[p.id] || [] }));

    // Build tree structure
    const buildTree = (parentId) => {
      return pages
        .filter(p => p.parent_id === parentId)
        .map(p => ({ ...p, children: buildTree(p.id) }));
    };
    const tree = buildTree(null);

    // Generate combined markdown
    const lines = [];
    const renderPage = (page, depth = 0) => {
      const prefix = '#'.repeat(Math.min(depth + 1, 6));
      lines.push(`${prefix} ${page.title}`);
      if (page.tags.length) lines.push(`Tags: ${page.tags.map(t => t.name).join(', ')}`);
      lines.push('');
      lines.push(page.content_type === 'html' ? `<!-- HTML content -->\n${page.content}` : page.content);
      lines.push('');
      lines.push('---');
      lines.push('');
      for (const child of page.children) renderPage(child, depth + 1);
    };
    lines.push(`# Wiki Export\n\nExported on ${new Date().toISOString()}\n\n---\n`);
    for (const page of tree) renderPage(page);

    const content = lines.join('\n');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="wiki-export-${new Date().toISOString().split('T')[0]}.md"`);
    res.send(content);
  } catch (err) {
    console.error('Error exporting all pages:', err.message);
    res.status(500).json({ error: 'Failed to export pages' });
  }
});

app.get('/api/pages/search', authenticate, requirePermission('pages.read'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json([]);
  const isAdmin = req.user.role === 'admin';
  try {
    const result = await pool.query(`
      SELECT p.*, u1.username AS created_by_name, u2.username AS updated_by_name,
             ts_rank(p.search_vector, plainto_tsquery('simple', $1)) AS rank
      FROM wiki_pages p
      LEFT JOIN users u1 ON p.created_by = u1.id
      LEFT JOIN users u2 ON p.updated_by = u2.id
      WHERE p.search_vector @@ plainto_tsquery('simple', $1)
        AND ${isAdmin ? 'TRUE' : `(p.visibility = 'published' OR p.created_by = $2 OR EXISTS (SELECT 1 FROM wiki_page_shares s WHERE s.page_id = p.id AND s.shared_with_user_id = $2))`}
      ORDER BY rank DESC, p.updated_at DESC
      LIMIT 50`,
      isAdmin ? [q] : [q, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error searching pages:', err.message);
    res.status(500).json({ error: 'Failed to search pages' });
  }
});

app.get('/api/pages', authenticate, requirePermission('pages.read'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const isAdmin = req.user.role === 'admin';
  try {
    const result = await pool.query(`
      SELECT p.*, u1.username AS created_by_name, u2.username AS updated_by_name,
             (SELECT COUNT(*) FROM wiki_pages c WHERE c.parent_id = p.id) AS children_count
      FROM wiki_pages p
      LEFT JOIN users u1 ON p.created_by = u1.id
      LEFT JOIN users u2 ON p.updated_by = u2.id
      WHERE ${isAdmin ? 'TRUE' : `(p.visibility = 'published' OR p.created_by = $1 OR EXISTS (SELECT 1 FROM wiki_page_shares s WHERE s.page_id = p.id AND s.shared_with_user_id = $1))`}
      ORDER BY p.updated_at DESC`, isAdmin ? [] : [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing pages:', err.message);
    res.status(500).json({ error: 'Failed to retrieve pages' });
  }
});

app.get('/api/pages/:id', authenticate, requirePermission('pages.read'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const result = await pool.query(`
      SELECT p.*, u1.username AS created_by_name, u2.username AS updated_by_name
      FROM wiki_pages p
      LEFT JOIN users u1 ON p.created_by = u1.id
      LEFT JOIN users u2 ON p.updated_by = u2.id
      WHERE p.id = $1`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    const page = result.rows[0];
    // Visibility check: admins see all, others need ownership, share, or published
    if (req.user.role !== 'admin' && page.visibility !== 'published' && page.created_by !== req.user.id) {
      const shared = await pool.query('SELECT 1 FROM wiki_page_shares WHERE page_id = $1 AND shared_with_user_id = $2', [id, req.user.id]);
      if (shared.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    }
    res.json(page);
  } catch (err) {
    console.error('Error getting page:', err.message);
    res.status(500).json({ error: 'Failed to retrieve page' });
  }
});

app.post('/api/pages', authenticate, requirePermission('pages.create'), writeLimiter, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const { title, content } = req.body;
  const errors = validatePageInput(title, content);
  if (errors.length > 0) return res.status(400).json({ error: errors.join(' '), errors });
  try {
    const parentId = req.body.parentId ? parseInt(req.body.parentId) : null;
    const contentType = req.body.contentType === 'html' ? 'html' : 'markdown';
    const visibility = req.body.visibility === 'published' ? 'published' : 'draft';
    const result = await pool.query(
      'INSERT INTO wiki_pages (title, content, created_by, updated_by, parent_id, content_type, visibility) VALUES ($1, $2, $3, $3, $4, $5, $6) RETURNING *',
      [title.trim(), content.trim(), req.user.id, parentId, contentType, visibility]
    );
    await pool.query(
      'INSERT INTO wiki_page_versions (page_id, title, content, created_by, version_number, content_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [result.rows[0].id, title.trim(), content.trim(), req.user.id, 1, contentType]
    );
    await auditLog(req.user.id, req.user.username, 'create_page', 'page', result.rows[0].id, { title: title.trim() }, getIp(req));
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A page with this title already exists.' });
    console.error('Error creating page:', err.message);
    res.status(500).json({ error: 'Failed to create page' });
  }
});

app.put('/api/pages/:id', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  const { title, content } = req.body;
  const errors = validatePageInput(title, content);
  if (errors.length > 0) return res.status(400).json({ error: errors.join(' '), errors });
  try {
    const current = await pool.query('SELECT * FROM wiki_pages WHERE id = $1', [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Page not found' });

    const nextVersion = await pool.query(
      'SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM wiki_page_versions WHERE page_id = $1',
      [id]
    );
    await pool.query(
      'INSERT INTO wiki_page_versions (page_id, title, content, created_by, version_number, content_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, current.rows[0].title, current.rows[0].content, req.user.id, parseInt(nextVersion.rows[0].next), current.rows[0].content_type || 'markdown']
    );

    const parentId = req.body.parentId !== undefined ? (req.body.parentId ? parseInt(req.body.parentId) : null) : current.rows[0].parent_id;
    if (parentId === id) return res.status(400).json({ error: 'A page cannot be its own parent.' });
    const contentType = req.body.contentType !== undefined ? (req.body.contentType === 'html' ? 'html' : 'markdown') : (current.rows[0].content_type || 'markdown');
    const visibility = req.body.visibility !== undefined ? (['draft','published'].includes(req.body.visibility) ? req.body.visibility : current.rows[0].visibility) : (current.rows[0].visibility || 'draft');
    const result = await pool.query(
      'UPDATE wiki_pages SET title = $1, content = $2, updated_by = $3, parent_id = $4, content_type = $5, visibility = $6 WHERE id = $7 RETURNING *',
      [title.trim(), content.trim(), req.user.id, parentId, contentType, visibility, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    await auditLog(req.user.id, req.user.username, 'update_page', 'page', id, { title: title.trim() }, getIp(req));
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A page with this title already exists.' });
    console.error('Error updating page:', err.message);
    res.status(500).json({ error: 'Failed to update page' });
  }
});

app.get('/api/pages/:id/versions', authenticate, requirePermission('pages.read'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const result = await pool.query(
      `SELECT v.*, u.username AS created_by_name
       FROM wiki_page_versions v
       LEFT JOIN users u ON v.created_by = u.id
       WHERE v.page_id = $1
       ORDER BY v.version_number DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing versions:', err.message);
    res.status(500).json({ error: 'Failed to retrieve versions' });
  }
});

app.post('/api/pages/:id/restore', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  const { versionId } = req.body;
  if (isNaN(id) || !versionId) return res.status(400).json({ error: 'Invalid page or version ID' });

  try {
    const version = await pool.query('SELECT * FROM wiki_page_versions WHERE id = $1 AND page_id = $2', [versionId, id]);
    if (version.rows.length === 0) return res.status(404).json({ error: 'Version not found' });

    const current = await pool.query('SELECT * FROM wiki_pages WHERE id = $1', [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Page not found' });

    const nextVersion = await pool.query(
      'SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM wiki_page_versions WHERE page_id = $1',
      [id]
    );
    await pool.query(
      'INSERT INTO wiki_page_versions (page_id, title, content, created_by, version_number) VALUES ($1, $2, $3, $4, $5)',
      [id, current.rows[0].title, current.rows[0].content, req.user.id, parseInt(nextVersion.rows[0].next)]
    );

    const restored = await pool.query(
      'UPDATE wiki_pages SET title = $1, content = $2, updated_by = $3 WHERE id = $4 RETURNING *',
      [version.rows[0].title, version.rows[0].content, req.user.id, id]
    );

    await auditLog(req.user.id, req.user.username, 'restore_page', 'page', id, { versionId }, getIp(req));
    res.json(restored.rows[0]);
  } catch (err) {
    console.error('Error restoring page:', err.message);
    res.status(500).json({ error: 'Failed to restore page' });
  }
});

// Toggle page visibility (publish / unpublish)
app.put('/api/pages/:id/visibility', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  const { visibility } = req.body;
  if (!['draft', 'published'].includes(visibility)) return res.status(400).json({ error: 'Visibility must be draft or published' });
  try {
    const page = await pool.query('SELECT * FROM wiki_pages WHERE id = $1', [id]);
    if (page.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    // Only owner or admin can change visibility
    if (req.user.role !== 'admin' && page.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the page owner or an admin can change visibility' });
    }
    const result = await pool.query('UPDATE wiki_pages SET visibility = $1 WHERE id = $2 RETURNING *', [visibility, id]);
    await auditLog(req.user.id, req.user.username, visibility === 'published' ? 'publish_page' : 'unpublish_page', 'page', id, { title: page.rows[0].title }, getIp(req));
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error changing visibility:', err.message);
    res.status(500).json({ error: 'Failed to change page visibility' });
  }
});

// ==================== TAGS ====================

// List all tags
app.get('/api/tags', authenticate, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const result = await pool.query(`
      SELECT t.*, COUNT(pt.page_id) AS page_count
      FROM wiki_tags t
      LEFT JOIN wiki_page_tags pt ON t.id = pt.tag_id
      GROUP BY t.id
      ORDER BY t.name ASC`);
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing tags:', err.message);
    res.status(500).json({ error: 'Failed to retrieve tags' });
  }
});

// Create tag (editor+)
app.post('/api/tags', authenticate, requirePermission('pages.create'), writeLimiter, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tag name is required.' });
  if (name.trim().length > 100) return res.status(400).json({ error: 'Tag name must be 100 characters or less.' });
  try {
    const result = await pool.query(
      'INSERT INTO wiki_tags (name, color) VALUES ($1, $2) RETURNING *',
      [name.trim().toLowerCase(), color || '#6366f1']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Tag already exists.' });
    console.error('Error creating tag:', err.message);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// Delete tag (admin only)
app.delete('/api/tags/:id', authenticate, requirePermission('users.manage'), writeLimiter, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid tag ID' });
  try {
    const result = await pool.query('DELETE FROM wiki_tags WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tag not found' });
    res.json({ message: 'Tag deleted' });
  } catch (err) {
    console.error('Error deleting tag:', err.message);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// Get tags for a page
app.get('/api/pages/:id/tags', authenticate, requirePermission('pages.read'), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const result = await pool.query(
      `SELECT t.* FROM wiki_tags t
       JOIN wiki_page_tags pt ON t.id = pt.tag_id
       WHERE pt.page_id = $1
       ORDER BY t.name ASC`, [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting page tags:', err.message);
    res.status(500).json({ error: 'Failed to retrieve page tags' });
  }
});

// Set tags for a page (replaces all)
app.put('/api/pages/:id/tags', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  const { tagIds } = req.body;
  if (!Array.isArray(tagIds)) return res.status(400).json({ error: 'tagIds must be an array.' });
  try {
    await pool.query('DELETE FROM wiki_page_tags WHERE page_id = $1', [id]);
    for (const tagId of tagIds) {
      await pool.query('INSERT INTO wiki_page_tags (page_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, tagId]);
    }
    const result = await pool.query(
      `SELECT t.* FROM wiki_tags t JOIN wiki_page_tags pt ON t.id = pt.tag_id WHERE pt.page_id = $1 ORDER BY t.name`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error setting page tags:', err.message);
    res.status(500).json({ error: 'Failed to update page tags' });
  }
});

// ==================== FAVORITES ====================

// Get user's favorites
app.get('/api/favorites', authenticate, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const result = await pool.query(`
      SELECT p.id, p.title, p.updated_at, p.created_at, f.created_at AS favorited_at,
             u.username AS updated_by_name
      FROM wiki_favorites f
      JOIN wiki_pages p ON f.page_id = p.id
      LEFT JOIN users u ON p.updated_by = u.id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC`, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting favorites:', err.message);
    res.status(500).json({ error: 'Failed to retrieve favorites' });
  }
});

// Toggle favorite
app.post('/api/favorites/:pageId', authenticate, writeLimiter, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const pageId = parseInt(req.params.pageId);
  if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const existing = await pool.query(
      'SELECT 1 FROM wiki_favorites WHERE user_id = $1 AND page_id = $2',
      [req.user.id, pageId]
    );
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM wiki_favorites WHERE user_id = $1 AND page_id = $2', [req.user.id, pageId]);
      res.json({ favorited: false });
    } else {
      await pool.query('INSERT INTO wiki_favorites (user_id, page_id) VALUES ($1, $2)', [req.user.id, pageId]);
      res.json({ favorited: true });
    }
  } catch (err) {
    console.error('Error toggling favorite:', err.message);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// Check if page is favorited
app.get('/api/favorites/:pageId/check', authenticate, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const pageId = parseInt(req.params.pageId);
  if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const result = await pool.query(
      'SELECT 1 FROM wiki_favorites WHERE user_id = $1 AND page_id = $2',
      [req.user.id, pageId]
    );
    res.json({ favorited: result.rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check favorite' });
  }
});

// ==================== SHARING ====================

// Get shares for a page
app.get('/api/pages/:id/shares', authenticate, requirePermission('pages.read'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const result = await pool.query(`
      SELECT s.id, s.page_id, s.shared_with_user_id, s.permission, s.created_at,
             u.username, u.display_name,
             sb.username AS shared_by_name
      FROM wiki_page_shares s
      JOIN users u ON s.shared_with_user_id = u.id
      LEFT JOIN users sb ON s.shared_by = sb.id
      WHERE s.page_id = $1
      ORDER BY s.created_at DESC`, [id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting shares:', err.message);
    res.status(500).json({ error: 'Failed to retrieve shares' });
  }
});

// Share a page with a user
app.post('/api/pages/:id/shares', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const pageId = parseInt(req.params.id);
  if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });
  const { userId, permission } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  if (!['read', 'edit'].includes(permission || 'read')) return res.status(400).json({ error: 'Invalid permission' });
  try {
    await pool.query(
      `INSERT INTO wiki_page_shares (page_id, shared_with_user_id, permission, shared_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (page_id, shared_with_user_id) DO UPDATE SET permission = EXCLUDED.permission`,
      [pageId, userId, permission || 'read', req.user.id]
    );
    await auditLog(req.user.id, req.user.username, 'share_page', 'page', pageId, { sharedWith: userId, permission }, getIp(req));
    const result = await pool.query(`
      SELECT s.id, s.page_id, s.shared_with_user_id, s.permission, s.created_at,
             u.username, u.display_name,
             sb.username AS shared_by_name
      FROM wiki_page_shares s
      JOIN users u ON s.shared_with_user_id = u.id
      LEFT JOIN users sb ON s.shared_by = sb.id
      WHERE s.page_id = $1
      ORDER BY s.created_at DESC`, [pageId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error sharing page:', err.message);
    res.status(500).json({ error: 'Failed to share page' });
  }
});

// Remove share
app.delete('/api/pages/:id/shares/:userId', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const pageId = parseInt(req.params.id);
  const userId = parseInt(req.params.userId);
  if (isNaN(pageId) || isNaN(userId)) return res.status(400).json({ error: 'Invalid IDs' });
  try {
    await pool.query('DELETE FROM wiki_page_shares WHERE page_id = $1 AND shared_with_user_id = $2', [pageId, userId]);
    await auditLog(req.user.id, req.user.username, 'unshare_page', 'page', pageId, { removedUser: userId }, getIp(req));
    const result = await pool.query(`
      SELECT s.id, s.page_id, s.shared_with_user_id, s.permission, s.created_at,
             u.username, u.display_name,
             sb.username AS shared_by_name
      FROM wiki_page_shares s
      JOIN users u ON s.shared_with_user_id = u.id
      LEFT JOIN users sb ON s.shared_by = sb.id
      WHERE s.page_id = $1
      ORDER BY s.created_at DESC`, [pageId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error removing share:', err.message);
    res.status(500).json({ error: 'Failed to remove share' });
  }
});

// Get pages shared with current user
app.get('/api/shared', authenticate, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const result = await pool.query(`
      SELECT p.id, p.title, p.content, p.updated_at, p.content_type,
             s.permission, s.created_at AS shared_at,
             sb.username AS shared_by_name
      FROM wiki_page_shares s
      JOIN wiki_pages p ON s.page_id = p.id
      LEFT JOIN users sb ON s.shared_by = sb.id
      WHERE s.shared_with_user_id = $1
      ORDER BY s.created_at DESC`, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting shared pages:', err.message);
    res.status(500).json({ error: 'Failed to retrieve shared pages' });
  }
});

// ==================== PAGE DELETE ====================

app.delete('/api/pages/:id', authenticate, requirePermission('pages.delete'), writeLimiter, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const result = await pool.query('DELETE FROM wiki_pages WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    await auditLog(req.user.id, req.user.username, 'delete_page', 'page', id, { title: result.rows[0].title }, getIp(req));
    res.json({ message: 'Page deleted', page: result.rows[0] });
  } catch (err) {
    console.error('Error deleting page:', err.message);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

// 404 API
app.use('/api', (req, res) => { res.status(404).json({ error: 'API endpoint not found' }); });

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ==================== START ====================

async function startServer() {
  const connected = await connectWithRetry();
  if (!connected) { console.error('Exiting – database unavailable'); process.exit(1); }
  app.listen(port, '0.0.0.0', () => {
    console.log(`API server on port ${port}`);
    console.log(`LDAP: ${LDAP_ENABLED ? 'enabled' : 'disabled'} | RBAC: active (admin, editor, viewer)`);
  });
}

process.on('SIGTERM', async () => { console.log('SIGTERM'); if (pool) await pool.end(); process.exit(0); });
process.on('SIGINT', async () => { console.log('SIGINT'); if (pool) await pool.end(); process.exit(0); });

startServer();

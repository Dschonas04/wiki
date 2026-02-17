/**
 * Datenbankverbindung und Migrationen
 */

const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { DB_CONFIG, BCRYPT_ROUNDS } = require('./config');

let pool = null;

function getPool() {
  return pool;
}

async function connectWithRetry(maxRetries = 10, delay = 3000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Connecting to database… (attempt ${i + 1}/${maxRetries})`);
      const testPool = new Pool(DB_CONFIG);
      const client = await testPool.connect();
      console.log('Connected to PostgreSQL');

      // ===== Users =====
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

      // ===== Wiki Pages =====
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

      // ===== Versionen =====
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

      // ===== Audit Log =====
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

      // Migrations: neue Spalten
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

      // Volltext-Suche
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
              FOR EACH ROW EXECUTE FUNCTION update_wiki_search_vector();
          END IF;
        END; $$
      `);

      await client.query(`
        UPDATE wiki_pages
        SET search_vector = to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,''))
        WHERE search_vector IS NULL
      `);

      // Updated-At Trigger
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

      // Passwort-Reset & Content-Type
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

      // Default-Admin
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

      // ===== Tags =====
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

      // ===== Favoriten =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_favorites (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, page_id)
        )
      `);

      // ===== Freigaben =====
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

      // FK-Migration
      await client.query(`
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'wiki_pages_created_by_fkey' AND table_name = 'wiki_pages') THEN
            ALTER TABLE wiki_pages DROP CONSTRAINT wiki_pages_created_by_fkey;
            ALTER TABLE wiki_pages ADD CONSTRAINT wiki_pages_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'wiki_pages_updated_by_fkey' AND table_name = 'wiki_pages') THEN
            ALTER TABLE wiki_pages DROP CONSTRAINT wiki_pages_updated_by_fkey;
            ALTER TABLE wiki_pages ADD CONSTRAINT wiki_pages_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
          END IF;
        END; $$
      `);

      // Soft Delete
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wiki_pages' AND column_name='deleted_at') THEN
            ALTER TABLE wiki_pages ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wiki_pages' AND column_name='deleted_by') THEN
            ALTER TABLE wiki_pages ADD COLUMN deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
          END IF;
        END; $$
      `);

      // Indizes
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

      // ===== Attachments =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_attachments (
          id SERIAL PRIMARY KEY,
          page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
          filename VARCHAR(255) NOT NULL,
          original_name VARCHAR(500) NOT NULL,
          mime_type VARCHAR(255) NOT NULL,
          size_bytes BIGINT NOT NULL,
          uploaded_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_attachments_page ON wiki_attachments(page_id)');

      // ===== Approval-System =====
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wiki_pages' AND column_name='approval_status') THEN
            ALTER TABLE wiki_pages ADD COLUMN approval_status VARCHAR(20) DEFAULT 'none';
          END IF;
        END; $$
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS approval_requests (
          id SERIAL PRIMARY KEY,
          page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
          requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          comment TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          resolved_at TIMESTAMP,
          CONSTRAINT valid_approval_status CHECK (status IN ('pending', 'approved', 'rejected'))
        )
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_approvals_page ON approval_requests(page_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests(status)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_approvals_requested ON approval_requests(requested_by)');

      // Tags per User
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wiki_tags' AND column_name='created_by') THEN
            ALTER TABLE wiki_tags ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
            ALTER TABLE wiki_tags DROP CONSTRAINT IF EXISTS wiki_tags_name_key;
            ALTER TABLE wiki_tags ADD CONSTRAINT wiki_tags_name_user_unique UNIQUE (name, created_by);
          END IF;
        END; $$
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_tags_created_by ON wiki_tags(created_by)');

      // ===== User Settings (Theme etc.) =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          setting_key VARCHAR(100) NOT NULL,
          setting_value TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, setting_key)
        )
      `);

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

module.exports = { getPool, connectWithRetry };

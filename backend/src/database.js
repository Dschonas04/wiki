/**
 * Nexora – Datenbankverbindung und Schema-Migrationen
 *
 * Dieses Modul verwaltet:
 *  - PostgreSQL-Verbindung mit automatischem Retry
 *  - Erstellung aller Tabellen (idempotent mit IF NOT EXISTS)
 *  - Migrationen (neue Spalten, Constraints, Indizes, Trigger)
 *  - Standard-Admin-Benutzer und Standard-Organisation beim ersten Start
 *
 * Neues Datenmodell:
 *  - organizations          → Organisationsebene
 *  - team_spaces            → Team-Bereiche unter einer Organisation
 *  - space_memberships      → Benutzerrollen pro Team-Bereich
 *  - folders                → Ordnerstruktur innerhalb von Bereichen (max. 3 Ebenen)
 *  - private_spaces         → Ein privater Bereich pro Benutzer
 *  - wiki_pages             → Seiten innerhalb von Bereichen/Ordnern
 *  - wiki_page_versions     → Versionshistorie jeder Seite
 *  - publish_requests       → Veröffentlichungs-Workflow mit Statusmaschine
 *  - wiki_tags              → Schlagwörter (global + benutzerdefiniert)
 *  - wiki_page_tags         → Seite-zu-Tag-Zuordnung (m:n)
 *  - wiki_favorites         → Benutzer-Favoriten
 *  - wiki_attachments       → Dateianhänge zu Seiten
 *  - audit_log              → Protokollierung aller Aktionen
 *  - user_settings          → Benutzereinstellungen (Theme etc.)
 */

const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { DB_CONFIG, BCRYPT_ROUNDS } = require('./config');

// Globaler Connection-Pool
let pool = null;

/**
 * Gibt den aktuellen Datenbank-Connection-Pool zurück.
 * @returns {Pool|null}
 */
function getPool() {
  return pool;
}

/**
 * Stellt die Datenbankverbindung her (mit Retry) und führt alle Migrationen durch.
 * @param {number} maxRetries - Max. Verbindungsversuche (Standard: 10)
 * @param {number} delay - Wartezeit zwischen Versuchen in ms (Standard: 3000)
 * @returns {Promise<boolean>} true bei Erfolg
 */
async function connectWithRetry(maxRetries = 10, delay = 3000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Datenbankverbindung wird hergestellt… (Versuch ${i + 1}/${maxRetries})`);
      const testPool = new Pool(DB_CONFIG);
      const client = await testPool.connect();
      console.log('Verbunden mit PostgreSQL');

      // ===========================================================
      // ===== 1. Benutzer-Tabelle =====
      // Speichert alle Benutzerkonten mit globaler Rolle.
      // global_role: admin | auditor | user
      // ===========================================================
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) NOT NULL UNIQUE,
          password_hash VARCHAR(255),
          display_name VARCHAR(255),
          email VARCHAR(255),
          global_role VARCHAR(20) NOT NULL DEFAULT 'user',
          auth_source VARCHAR(20) NOT NULL DEFAULT 'local',
          is_active BOOLEAN NOT NULL DEFAULT true,
          must_change_password BOOLEAN NOT NULL DEFAULT false,
          last_login TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT valid_global_role CHECK (global_role IN ('admin', 'auditor', 'user')),
          CONSTRAINT valid_auth_source CHECK (auth_source IN ('local', 'ldap'))
        )
      `);

      // ===========================================================
      // ===== 2. Organisationen =====
      // Oberste Ebene der Hierarchie.
      // ===========================================================
      await client.query(`
        CREATE TABLE IF NOT EXISTS organizations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(100) NOT NULL UNIQUE,
          description TEXT DEFAULT '',
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ===========================================================
      // ===== 3. Team-Bereiche (Team Spaces) =====
      // Öffentliche Bereiche unter einer Organisation.
      // Berechtigungen werden auf dieser Ebene vergeben.
      // ===========================================================
      await client.query(`
        CREATE TABLE IF NOT EXISTS team_spaces (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(100) NOT NULL,
          description TEXT DEFAULT '',
          icon VARCHAR(50) DEFAULT 'folder',
          is_archived BOOLEAN NOT NULL DEFAULT false,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(organization_id, slug)
        )
      `);

      // ===========================================================
      // ===== 4. Bereichs-Mitgliedschaften =====
      // Rollen: owner | editor | reviewer | viewer
      // ===========================================================
      await client.query(`
        CREATE TABLE IF NOT EXISTS space_memberships (
          id SERIAL PRIMARY KEY,
          space_id INTEGER NOT NULL REFERENCES team_spaces(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL DEFAULT 'viewer',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(space_id, user_id),
          CONSTRAINT valid_space_role CHECK (role IN ('owner', 'editor', 'reviewer', 'viewer'))
        )
      `);

      // ===========================================================
      // ===== 5. Ordner (Folders) =====
      // Hierarchisch, max. Tiefe 3 (depth 0..2). Rein strukturell.
      // ===========================================================
      await client.query(`
        CREATE TABLE IF NOT EXISTS folders (
          id SERIAL PRIMARY KEY,
          space_id INTEGER NOT NULL REFERENCES team_spaces(id) ON DELETE CASCADE,
          parent_folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(100) NOT NULL,
          depth INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT max_folder_depth CHECK (depth <= 2),
          UNIQUE(space_id, parent_folder_id, slug)
        )
      `);

      // ===========================================================
      // ===== 6. Private Bereiche =====
      // Jeder Benutzer hat genau einen.
      // ===========================================================
      await client.query(`
        CREATE TABLE IF NOT EXISTS private_spaces (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ===========================================================
      // ===== 7. Wiki-Seiten =====
      // workflow_status: draft → in_review → approved → published → archived
      //                        → changes_requested → draft
      // ===========================================================
      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_pages (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          content_type VARCHAR(20) NOT NULL DEFAULT 'markdown',
          space_id INTEGER REFERENCES team_spaces(id) ON DELETE SET NULL,
          folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
          private_space_id INTEGER REFERENCES private_spaces(id) ON DELETE CASCADE,
          parent_id INTEGER REFERENCES wiki_pages(id) ON DELETE SET NULL,
          workflow_status VARCHAR(30) NOT NULL DEFAULT 'draft',
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          deleted_at TIMESTAMP DEFAULT NULL,
          deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          search_vector tsvector,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT valid_workflow_status CHECK (
            workflow_status IN ('draft', 'in_review', 'changes_requested', 'approved', 'published', 'archived')
          )
        )
      `);

      // ===========================================================
      // ===== 8. Seitenversionen =====
      // ===========================================================
      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_page_versions (
          id SERIAL PRIMARY KEY,
          page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          content_type VARCHAR(20) NOT NULL DEFAULT 'markdown',
          version_number INTEGER NOT NULL,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ===========================================================
      // ===== 9. Veröffentlichungsanfragen =====
      // ===========================================================
      await client.query(`
        CREATE TABLE IF NOT EXISTS publish_requests (
          id SERIAL PRIMARY KEY,
          page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
          requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          target_space_id INTEGER NOT NULL REFERENCES team_spaces(id) ON DELETE CASCADE,
          target_folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'pending',
          comment TEXT,
          review_comment TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          reviewed_at TIMESTAMP,
          CONSTRAINT valid_publish_status CHECK (
            status IN ('pending', 'approved', 'rejected', 'changes_requested', 'cancelled')
          )
        )
      `);

      // ===========================================================
      // ===== 10. Tags =====
      // ===========================================================
      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_tags (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          color VARCHAR(7) DEFAULT '#6366f1',
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ===== 11. Seite-Tag-Zuordnung =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_page_tags (
          page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
          tag_id INTEGER NOT NULL REFERENCES wiki_tags(id) ON DELETE CASCADE,
          PRIMARY KEY (page_id, tag_id)
        )
      `);

      // ===== 12. Favoriten =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_favorites (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, page_id)
        )
      `);

      // ===== 13. Dateianhänge =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS wiki_attachments (
          id SERIAL PRIMARY KEY,
          page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
          filename VARCHAR(255) NOT NULL,
          original_name VARCHAR(500) NOT NULL,
          mime_type VARCHAR(255) NOT NULL,
          size_bytes BIGINT NOT NULL,
          uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ===== 14. Audit-Log =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          username VARCHAR(100),
          action VARCHAR(80) NOT NULL,
          resource_type VARCHAR(50),
          resource_id INTEGER,
          space_id INTEGER REFERENCES team_spaces(id) ON DELETE SET NULL,
          details JSONB,
          ip_address VARCHAR(45),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ===== 15. Benutzereinstellungen =====
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          setting_key VARCHAR(100) NOT NULL,
          setting_value TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, setting_key)
        )
      `);

      // ===========================================================
      // ===== 16. Seitenkommentare =====
      // ===========================================================
      await client.query(`
        CREATE TABLE IF NOT EXISTS page_comments (
          id SERIAL PRIMARY KEY,
          page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          parent_id INTEGER REFERENCES page_comments(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ===========================================================
      // ===== 17. Benachrichtigungen =====
      // ===========================================================
      await client.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT,
          link VARCHAR(500),
          is_read BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ===========================================================
      // ===== 18. Seitenvorlagen =====
      // ===========================================================
      await client.query(`
        CREATE TABLE IF NOT EXISTS page_templates (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          content_type VARCHAR(20) NOT NULL DEFAULT 'html',
          icon VARCHAR(50) DEFAULT '📄',
          category VARCHAR(100) DEFAULT 'general',
          is_default BOOLEAN NOT NULL DEFAULT false,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ===========================================================
      // ===== Migrationen für bestehende Datenbanken =====
      // ===========================================================
      await client.query(`
        DO $$ BEGIN
          -- role → global_role Migration
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='global_role') THEN
            ALTER TABLE users RENAME COLUMN role TO global_role;
            ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_role;
            UPDATE users SET global_role = 'user' WHERE global_role NOT IN ('admin', 'auditor', 'user');
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='global_role') THEN
            UPDATE users SET global_role = 'user' WHERE global_role NOT IN ('admin', 'auditor', 'user');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='must_change_password') THEN
            ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
          END IF;
          -- folders: parent_id → parent_folder_id Migration
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='folders' AND column_name='parent_id')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='folders' AND column_name='parent_folder_id') THEN
            ALTER TABLE folders RENAME COLUMN parent_id TO parent_folder_id;
          END IF;
        END; $$
      `);

      // ===== Volltext-Suche: Trigger =====
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

      // ===== Updated-At Trigger =====
      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
        $$ language 'plpgsql'
      `);
      for (const tbl of ['wiki_pages', 'users', 'organizations', 'team_spaces', 'folders']) {
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

      // ===== Indizes =====
      await client.query('CREATE INDEX IF NOT EXISTS idx_pages_space ON wiki_pages(space_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_pages_folder ON wiki_pages(folder_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_pages_private_space ON wiki_pages(private_space_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_pages_parent ON wiki_pages(parent_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_pages_workflow ON wiki_pages(workflow_status)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_wiki_pages_search ON wiki_pages USING GIN (search_vector)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_versions_page ON wiki_page_versions(page_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_spaces_org ON team_spaces(organization_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_memberships_space ON space_memberships(space_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_memberships_user ON space_memberships(user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_folders_space ON folders(space_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_folders_parent_folder ON folders(parent_folder_id)');
      // Drop old index if it exists from before migration
      await client.query('DROP INDEX IF EXISTS idx_folders_parent');
      await client.query('CREATE INDEX IF NOT EXISTS idx_page_tags_page ON wiki_page_tags(page_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_page_tags_tag ON wiki_page_tags(tag_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_tags_created_by ON wiki_tags(created_by)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_favorites_user ON wiki_favorites(user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_favorites_page ON wiki_favorites(page_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_attachments_page ON wiki_attachments(page_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_publish_page ON publish_requests(page_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_publish_status ON publish_requests(status)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_publish_target ON publish_requests(target_space_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_audit_space ON audit_log(space_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_comments_page ON page_comments(page_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_comments_user ON page_comments(user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_comments_parent ON page_comments(parent_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_templates_category ON page_templates(category)');
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name_global
        ON wiki_tags(name) WHERE created_by IS NULL
      `);

      // ===== Standard-Admin (nur beim ersten Start) =====
      const userCount = await client.query('SELECT COUNT(*) FROM users');
      if (parseInt(userCount.rows[0].count) === 0) {
        const defaultPassword = 'Admin123!';
        const hash = await bcrypt.hash(defaultPassword, BCRYPT_ROUNDS);
        await client.query(
          `INSERT INTO users (username, password_hash, display_name, email, global_role, auth_source, must_change_password)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          ['admin', hash, 'Administrator', 'admin@nexora.local', 'admin', 'local', true]
        );
        console.log('╔══════════════════════════════════════════════════╗');
        console.log('║  NEXORA – STANDARD-ADMIN ERSTELLT                ║');
        console.log('║  Benutzername: admin                             ║');
        console.log(`║  Passwort: ${defaultPassword.padEnd(37)}║`);
        console.log('║  ⚠  BITTE PASSWORT NACH ERSTEM LOGIN ÄNDERN!    ║');
        console.log('╚══════════════════════════════════════════════════╝');
      }

      // ===== Standard-Organisation =====
      const orgCount = await client.query('SELECT COUNT(*) FROM organizations');
      if (parseInt(orgCount.rows[0].count) === 0) {
        const adminUser = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
        const adminId = adminUser.rows[0]?.id || null;
        await client.query(
          `INSERT INTO organizations (name, slug, description, created_by) VALUES ($1, $2, $3, $4)`,
          ['Nexora', 'nexora', 'Standard-Organisation', adminId]
        );
        console.log('Standard-Organisation "Nexora" erstellt.');
      }

      // ===== Privaten Bereich für alle Benutzer sicherstellen =====
      await client.query(`
        INSERT INTO private_spaces (user_id)
        SELECT id FROM users WHERE id NOT IN (SELECT user_id FROM private_spaces)
      `);

      // ===== Standard-Tags =====
      const defaultTags = [
        { name: 'Kritisch', color: '#ef4444' },
        { name: 'Hoch', color: '#f97316' },
        { name: 'Mittel', color: '#eab308' },
        { name: 'Niedrig', color: '#22c55e' },
        { name: 'Info', color: '#3b82f6' },
      ];
      for (const tag of defaultTags) {
        await client.query(
          `INSERT INTO wiki_tags (name, color, created_by) VALUES ($1, $2, NULL) ON CONFLICT DO NOTHING`,
          [tag.name, tag.color]
        );
      }

      // ===== Standard-Vorlagen =====
      const templateCount = await client.query('SELECT COUNT(*) FROM page_templates');
      if (parseInt(templateCount.rows[0].count) === 0) {
        const defaultTemplates = [
          {
            name: 'Meeting-Protokoll',
            description: 'Vorlage für Besprechungs-Protokolle',
            icon: '📋',
            category: 'meetings',
            content: '<h1>Meeting-Protokoll</h1><p><strong>Datum:</strong> </p><p><strong>Teilnehmer:</strong> </p><p><strong>Moderator:</strong> </p><hr><h2>Agenda</h2><ol><li>Punkt 1</li><li>Punkt 2</li><li>Punkt 3</li></ol><h2>Beschlüsse</h2><ul><li></li></ul><h2>Offene Punkte / Aktionen</h2><table><thead><tr><th>Aktion</th><th>Verantwortlich</th><th>Deadline</th></tr></thead><tbody><tr><td></td><td></td><td></td></tr></tbody></table><h2>Nächster Termin</h2><p></p>'
          },
          {
            name: 'Technische Dokumentation',
            description: 'Vorlage für technische Anleitungen',
            icon: '⚙️',
            category: 'documentation',
            content: '<h1>Technische Dokumentation</h1><blockquote><p>Kurze Beschreibung des Systems/Features</p></blockquote><h2>Überblick</h2><p>Beschreibung des Systems und seines Zwecks.</p><h2>Voraussetzungen</h2><ul><li>Voraussetzung 1</li><li>Voraussetzung 2</li></ul><h2>Installation / Setup</h2><pre><code># Installationsschritte hier</code></pre><h2>Konfiguration</h2><p>Beschreibung der Konfigurationsoptionen.</p><h2>Verwendung</h2><p>Anleitung zur Verwendung.</p><h2>Fehlerbehebung</h2><p>Häufige Probleme und Lösungen.</p>'
          },
          {
            name: 'How-To Guide',
            description: 'Schritt-für-Schritt Anleitung',
            icon: '📖',
            category: 'guides',
            content: '<h1>How-To: [Titel]</h1><blockquote><p>Was lernt der Leser in diesem Guide?</p></blockquote><h2>Ziel</h2><p>Nach dieser Anleitung können Sie…</p><h2>Voraussetzungen</h2><ul><li></li></ul><h2>Schritt 1: [Titel]</h2><p>Beschreibung…</p><h2>Schritt 2: [Titel]</h2><p>Beschreibung…</p><h2>Schritt 3: [Titel]</h2><p>Beschreibung…</p><h2>Zusammenfassung</h2><p>Sie haben gelernt, wie…</p><h2>Weiterführende Links</h2><ul><li></li></ul>'
          },
          {
            name: 'RFC / Entscheidung',
            description: 'Request for Comments – Entscheidungsvorlage',
            icon: '💡',
            category: 'decisions',
            content: '<h1>RFC: [Titel]</h1><p><strong>Status:</strong> Entwurf</p><p><strong>Autor:</strong> </p><p><strong>Datum:</strong> </p><hr><h2>Zusammenfassung</h2><p>Kurze Beschreibung des Vorschlags.</p><h2>Motivation</h2><p>Warum ist diese Änderung notwendig?</p><h2>Vorgeschlagene Lösung</h2><p>Detaillierte Beschreibung der vorgeschlagenen Lösung.</p><h2>Alternativen</h2><p>Welche Alternativen wurden in Betracht gezogen?</p><h2>Auswirkungen</h2><ul><li><strong>Vorteile:</strong> </li><li><strong>Nachteile:</strong> </li><li><strong>Risiken:</strong> </li></ul><h2>Offene Fragen</h2><ul><li></li></ul>'
          },
          {
            name: 'Leere Seite',
            description: 'Beginne mit einer leeren Seite',
            icon: '📄',
            category: 'general',
            content: ''
          }
        ];
        for (const tpl of defaultTemplates) {
          await client.query(
            `INSERT INTO page_templates (name, description, content, content_type, icon, category, is_default) VALUES ($1, $2, $3, 'html', $4, $5, true)`,
            [tpl.name, tpl.description, tpl.content, tpl.icon, tpl.category]
          );
        }
        console.log('Standard-Vorlagen erstellt.');
      }

      console.log('Nexora Datenbankschema initialisiert');
      client.release();
      pool = testPool;
      return true;
    } catch (err) {
      console.error(`DB-Verbindung fehlgeschlagen (${i + 1}/${maxRetries}):`, err.message);
      if (i < maxRetries - 1) {
        console.log(`Neuer Versuch in ${delay / 1000}s…`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  console.error('Datenbankverbindung konnte nicht hergestellt werden');
  return false;
}

module.exports = { getPool, connectWithRetry };

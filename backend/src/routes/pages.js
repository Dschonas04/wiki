/**
 * Nexora – Seiten-Routen (CRUD, Suche, Export, Versionen)
 *
 * Diese Datei enthält alle Routen für die Verwaltung von Wiki-Seiten.
 * Sie bildet das Herzstück der Nexora-Anwendung und umfasst das vollständige
 * Lebenszyklusmanagement von Seiten, einschließlich Versionierung.
 * Der Veröffentlichungsworkflow wird in publishing.js verwaltet.
 *
 * Endpunkte:
 *   GET    /pages/recent         - Zuletzt aktualisierte Seiten abrufen
 *   GET    /pages/:id/export     - Einzelne Seite als Markdown exportieren
 *   GET    /pages/export-all     - Alle Seiten als Markdown-Dokument exportieren
 *   GET    /pages/search         - Volltextsuche über alle Seiten
 *   GET    /pages                - Alle Seiten auflisten (mit Tag-Filterung)
 *   GET    /pages/:id            - Einzelne Seite abrufen
 *   POST   /pages                - Neue Seite erstellen
 *   PUT    /pages/:id            - Bestehende Seite aktualisieren
 *   GET    /pages/:id/versions   - Versionshistorie einer Seite abrufen
 *   POST   /pages/:id/restore   - Frühere Version einer Seite wiederherstellen
 *   PUT    /pages/:id/visibility - Sichtbarkeit einer Seite ändern (Entwurf/Veröffentlicht)
 *
 * Sichtbarkeitsmodell:
 *   - 'draft': Nur sichtbar für den Ersteller, Admins und freigegebene Benutzer
 *   - 'published': Sichtbar für alle authentifizierten Benutzer
 *
 * Versionierung:
 *   - Bei jeder Änderung wird automatisch eine neue Version erstellt
 *   - Ältere Versionen können wiederhergestellt werden
 */

const express = require('express');
const router = express.Router();

// Abhängigkeiten importieren
const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { auditLog } = require('../helpers/audit');
const { getIp, canAccessPage } = require('../helpers/utils');
const { validatePageInput, sanitizeHtml } = require('../helpers/validators');
const logger = require('../logger');

// ============================================================================
// GET /pages/recent - Zuletzt aktualisierte Seiten
// ============================================================================
// Gibt die zuletzt aktualisierten Seiten zurück (Standard: 10, Maximum: 50).
// Admins sehen alle Seiten; andere Benutzer sehen nur veröffentlichte Seiten,
// eigene Seiten und Seiten, die mit ihnen geteilt wurden.
router.get('/pages/recent', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Limit aus dem Query-Parameter lesen und auf maximal 50 begrenzen
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  // Prüfen, ob der Benutzer ein Administrator ist (sieht alle Seiten)
  const isPrivileged = req.user.global_role === 'admin' || req.user.global_role === 'auditor';

  try {
    // Seiten abfragen: Admins/Auditoren sehen alle, andere nur zugängliche Seiten
    // Gelöschte Seiten (deleted_at IS NOT NULL) werden ausgeschlossen
    const result = await pool.query(`
      SELECT p.id, p.title, p.updated_at, p.created_at, p.workflow_status, u.username AS updated_by_name
      FROM wiki_pages p
      LEFT JOIN users u ON p.updated_by = u.id
      WHERE p.deleted_at IS NULL AND ${isPrivileged ? 'TRUE' : `(
        (p.workflow_status = 'published' AND p.space_id IS NOT NULL AND EXISTS (SELECT 1 FROM space_memberships sm WHERE sm.space_id = p.space_id AND sm.user_id = $2))
        OR p.created_by = $2
        OR p.private_space_id IN (SELECT id FROM private_spaces WHERE user_id = $2)
      )`}
      ORDER BY p.updated_at DESC
      LIMIT $1`, isPrivileged ? [limit] : [limit, req.user.id]);
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Error getting recent pages');
    res.status(500).json({ error: 'Failed to retrieve recent pages' });
  }
});

// ============================================================================
// GET /pages/:id/export - Einzelne Seite als Markdown exportieren
// ============================================================================
// Exportiert eine einzelne Seite als Markdown-Datei zum Download.
// Der Dateiname wird aus dem Seitentitel generiert (Sonderzeichen werden ersetzt).
// Zugriffsprüfung über die canAccessPage-Hilfsfunktion.
router.get('/pages/:id/export', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Seiten-ID aus der URL validieren
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });

  try {
    // Zugriffsberechtigung prüfen (Sichtbarkeit, Freigaben)
    if (!(await canAccessPage(id, req.user))) return res.status(404).json({ error: 'Page not found' });

    // Seitendaten aus der Datenbank laden
    const result = await pool.query('SELECT * FROM wiki_pages WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    const page = result.rows[0];

    // Markdown-Inhalt zusammensetzen mit Titel und Export-Zeitstempel
    const md = `# ${page.title}\n\n${page.content}\n\n---\n_Exported from Wiki on ${new Date().toISOString()}_\n`;

    // HTTP-Header für den Dateidownload setzen
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${page.title.replace(/[^a-z0-9]/gi, '_')}.md"`);
    res.send(md);
  } catch (err) {
    logger.error({ err }, 'Error exporting page');
    res.status(500).json({ error: 'Failed to export page' });
  }
});

// ============================================================================
// GET /pages/export-all - Alle Seiten als Markdown exportieren
// ============================================================================
// Exportiert alle zugänglichen Seiten als ein einziges Markdown-Dokument.
// Die Seiten werden hierarchisch angeordnet (Eltern-Kind-Beziehung über parent_id).
// Tags werden ebenfalls mit exportiert.
// Die Überschriftentiefe richtet sich nach der Verschachtelungstiefe (max. H6).
router.get('/pages/export-all', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const isPrivileged = req.user.global_role === 'admin' || req.user.global_role === 'auditor';

  try {
    // Alle zugänglichen Seiten mit Ersteller- und Aktualisierungsinformationen laden
    const result = await pool.query(`
      SELECT p.id, p.title, p.content, p.content_type, p.parent_id, p.created_at, p.updated_at,
             u1.username AS created_by_name, u2.username AS updated_by_name
      FROM wiki_pages p
      LEFT JOIN users u1 ON p.created_by = u1.id
      LEFT JOIN users u2 ON p.updated_by = u2.id
      WHERE p.deleted_at IS NULL AND ${isPrivileged ? 'TRUE' : `(
        (p.workflow_status = 'published' AND p.space_id IS NOT NULL AND EXISTS (SELECT 1 FROM space_memberships sm WHERE sm.space_id = p.space_id AND sm.user_id = $1))
        OR p.created_by = $1
        OR p.private_space_id IN (SELECT id FROM private_spaces WHERE user_id = $1)
      )`}
      ORDER BY p.parent_id NULLS FIRST, p.title ASC`, isPrivileged ? [] : [req.user.id]);

    // Alle Tags für die Seiten laden und in einer Map organisieren
    const tagsResult = await pool.query(`
      SELECT pt.page_id, t.name, t.color FROM wiki_page_tags pt JOIN wiki_tags t ON pt.tag_id = t.id`);
    const tagMap = {};
    for (const row of tagsResult.rows) {
      if (!tagMap[row.page_id]) tagMap[row.page_id] = [];
      tagMap[row.page_id].push({ name: row.name, color: row.color });
    }

    // Tags den Seiten zuordnen
    const pages = result.rows.map(p => ({ ...p, tags: tagMap[p.id] || [] }));

    // Baumstruktur aus der flachen Liste aufbauen (rekursiv)
    const buildTree = (parentId) => pages.filter(p => p.parent_id === parentId).map(p => ({ ...p, children: buildTree(p.id) }));
    const tree = buildTree(null);

    // Markdown-Dokument zeilenweise aufbauen
    const lines = [];

    // Rekursive Funktion zum Rendern einer Seite und ihrer Unterseiten
    const renderPage = (page, depth = 0) => {
      // Überschriftentiefe basierend auf der Verschachtelungstiefe (maximal H6)
      const prefix = '#'.repeat(Math.min(depth + 1, 6));
      lines.push(`${prefix} ${page.title}`);

      // Tags anzeigen, falls vorhanden
      if (page.tags.length) lines.push(`Tags: ${page.tags.map(t => t.name).join(', ')}`);
      lines.push('');

      // Inhalt einfügen (HTML-Inhalt wird als Kommentar markiert)
      lines.push(page.content_type === 'html' ? `<!-- HTML content -->\n${page.content}` : page.content);
      lines.push('', '---', '');

      // Unterseiten rekursiv rendern
      for (const child of page.children) renderPage(child, depth + 1);
    };

    // Export-Header mit Datum hinzufügen
    lines.push(`# Wiki Export\n\nExported on ${new Date().toISOString()}\n\n---\n`);

    // Alle Seiten der obersten Ebene rendern (und deren Unterseiten rekursiv)
    for (const page of tree) renderPage(page);
    const content = lines.join('\n');

    // HTTP-Header für den Dateidownload setzen
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nexora-export-${new Date().toISOString().split('T')[0]}.md"`);
    res.send(content);
  } catch (err) {
    logger.error({ err }, 'Error exporting all pages');
    res.status(500).json({ error: 'Failed to export pages' });
  }
});

// ============================================================================
// GET /pages/search - Volltextsuche
// ============================================================================
// Durchsucht alle zugänglichen Seiten mit PostgreSQL-Volltextsuche (ts_rank).
// Der Suchbegriff wird gegen den search_vector der Seiten geprüft.
// Ergebnisse werden nach Relevanz und Aktualisierungsdatum sortiert (max. 50).
router.get('/pages/search', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Suchbegriff aus dem Query-Parameter extrahieren und bereinigen
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json([]); // Leerer Suchbegriff gibt leeres Ergebnis zurück

  const isPrivileged = req.user.global_role === 'admin' || req.user.global_role === 'auditor';

  try {
    // Volltextsuche mit plainto_tsquery und ts_rank für die Relevanz-Bewertung
    // Gelöschte Seiten und nicht-zugängliche Seiten werden ausgeschlossen
    const result = await pool.query(`
      SELECT p.*, u1.username AS created_by_name, u2.username AS updated_by_name,
             ts_rank(p.search_vector, plainto_tsquery('simple', $1)) AS rank,
             ts_headline('simple', p.title, plainto_tsquery('simple', $1),
               'StartSel=<mark>, StopSel=</mark>, MaxWords=60, MinWords=20, MaxFragments=1') AS title_highlight,
             ts_headline('simple', p.content, plainto_tsquery('simple', $1),
               'StartSel=<mark>, StopSel=</mark>, MaxWords=60, MinWords=20, MaxFragments=2') AS snippet
      FROM wiki_pages p
      LEFT JOIN users u1 ON p.created_by = u1.id
      LEFT JOIN users u2 ON p.updated_by = u2.id
      WHERE p.deleted_at IS NULL AND p.search_vector @@ plainto_tsquery('simple', $1)
        AND ${isPrivileged ? 'TRUE' : `(
          (p.workflow_status = 'published' AND p.space_id IS NOT NULL AND EXISTS (SELECT 1 FROM space_memberships sm WHERE sm.space_id = p.space_id AND sm.user_id = $2))
          OR p.created_by = $2
          OR p.private_space_id IN (SELECT id FROM private_spaces WHERE user_id = $2)
        )`}
      ORDER BY rank DESC, p.updated_at DESC
      LIMIT 50`,
      isPrivileged ? [q] : [q, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Error searching pages');
    res.status(500).json({ error: 'Failed to search pages' });
  }
});

// ============================================================================
// GET /pages - Alle Seiten auflisten
// ============================================================================
// Gibt alle zugänglichen Seiten zurück, inklusive Tags und Anzahl der Unterseiten.
// Unterstützt optionale Filterung nach Tag-ID über den Query-Parameter 'tag'.
// Admins sehen alle Seiten; andere Benutzer sehen nur zugängliche Seiten.
router.get('/pages', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const isPrivileged = req.user.global_role === 'admin' || req.user.global_role === 'auditor';

  // Paginierung: Standardwerte page=1, limit=50, Maximum 200
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
  const offset = (page - 1) * limit;

  // Optionale Tag-Filterung: Tag-ID aus dem Query-Parameter lesen
  const tagId = req.query.tag ? parseInt(req.query.tag) : null;
  // Optionale Bereichs-Filterung
  const spaceId = req.query.spaceId ? parseInt(req.query.spaceId) : null;
  const folderId = req.query.folderId ? parseInt(req.query.folderId) : null;

  try {
    // Parameter-Array für die SQL-Abfrage aufbauen
    const params = isPrivileged ? [] : [req.user.id];
    let extraConditions = '';

    // Tag-Filter dynamisch zur SQL-Abfrage hinzufügen, falls angegeben
    if (tagId) {
      const idx = params.length + 1;
      extraConditions += ` AND EXISTS (SELECT 1 FROM wiki_page_tags pt WHERE pt.page_id = p.id AND pt.tag_id = $${idx})`;
      params.push(tagId);
    }
    if (spaceId) {
      const idx = params.length + 1;
      extraConditions += ` AND p.space_id = $${idx}`;
      params.push(spaceId);
    }
    if (folderId) {
      const idx = params.length + 1;
      extraConditions += ` AND p.folder_id = $${idx}`;
      params.push(folderId);
    }

    // Alle Seiten mit Ersteller/Aktualisierungs-Infos und Anzahl der Unterseiten laden
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM wiki_pages p
      WHERE p.deleted_at IS NULL AND ${isPrivileged ? 'TRUE' : `(
        (p.workflow_status = 'published' AND p.space_id IS NOT NULL AND EXISTS (SELECT 1 FROM space_memberships sm WHERE sm.space_id = p.space_id AND sm.user_id = $1))
        OR p.created_by = $1
        OR p.private_space_id IN (SELECT id FROM private_spaces WHERE user_id = $1)
      )`}${extraConditions}`, params);
    const total = parseInt(countResult.rows[0].count);

    // Paginierungs-Parameter zur Query hinzufügen
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    params.push(limit, offset);

    const result = await pool.query(`
      SELECT p.*, u1.username AS created_by_name, u2.username AS updated_by_name,
             (SELECT COUNT(*) FROM wiki_pages c WHERE c.parent_id = p.id AND c.deleted_at IS NULL) AS children_count
      FROM wiki_pages p
      LEFT JOIN users u1 ON p.created_by = u1.id
      LEFT JOIN users u2 ON p.updated_by = u2.id
      WHERE p.deleted_at IS NULL AND ${isPrivileged ? 'TRUE' : `(
        (p.workflow_status = 'published' AND p.space_id IS NOT NULL AND EXISTS (SELECT 1 FROM space_memberships sm WHERE sm.space_id = p.space_id AND sm.user_id = $1))
        OR p.created_by = $1
        OR p.private_space_id IN (SELECT id FROM private_spaces WHERE user_id = $1)
      )`}${extraConditions}
      ORDER BY p.updated_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`, params);

    // Tags für alle abgerufenen Seiten in einem einzigen Query laden
    const pageIds = result.rows.map(p => p.id);
    let tagMap = {};
    if (pageIds.length > 0) {
      const tagsResult = await pool.query(
        `SELECT pt.page_id, t.id, t.name, t.color FROM wiki_page_tags pt JOIN wiki_tags t ON pt.tag_id = t.id WHERE pt.page_id = ANY($1)`,
        [pageIds]
      );

      // Tags in einer Map nach Seiten-ID organisieren
      for (const row of tagsResult.rows) {
        if (!tagMap[row.page_id]) tagMap[row.page_id] = [];
        tagMap[row.page_id].push({ id: row.id, name: row.name, color: row.color });
      }
    }

    // Tags den Seiten zuordnen und Ergebnis mit Paginierung zurückgeben
    const pages = result.rows.map(p => ({ ...p, tags: tagMap[p.id] || [] }));
    res.json({ items: pages, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error({ err }, 'Error listing pages');
    res.status(500).json({ error: 'Failed to retrieve pages' });
  }
});

// ============================================================================
// GET /pages/:id - Einzelne Seite abrufen
// ============================================================================
// Gibt die vollständigen Daten einer einzelnen Seite zurück.
// Zugriffsprüfung: Admins sehen alles, andere Benutzer nur veröffentlichte Seiten,
// eigene Seiten oder Seiten, die mit ihnen geteilt wurden.
router.get('/pages/:id', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Seiten-ID aus der URL validieren
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });

  try {
    // Seite mit Ersteller- und Aktualisierungsinformationen laden
    const result = await pool.query(`
      SELECT p.*, u1.username AS created_by_name, u2.username AS updated_by_name,
             pp.title AS parent_title,
             ts.name AS space_name,
             f.name AS folder_name
      FROM wiki_pages p
      LEFT JOIN users u1 ON p.created_by = u1.id
      LEFT JOIN users u2 ON p.updated_by = u2.id
      LEFT JOIN wiki_pages pp ON p.parent_id = pp.id
      LEFT JOIN team_spaces ts ON p.space_id = ts.id
      LEFT JOIN folders f ON p.folder_id = f.id
      WHERE p.id = $1 AND p.deleted_at IS NULL`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Page not found' });

    const page = result.rows[0];

    // Breadcrumb-Kette aufbauen (Eltern-Pfad)
    const breadcrumbs = [];
    if (page.parent_id) {
      let currentParentId = page.parent_id;
      let depth = 0;
      while (currentParentId && depth < 10) {
        const parentResult = await pool.query(
          'SELECT id, title, parent_id FROM wiki_pages WHERE id = $1 AND deleted_at IS NULL',
          [currentParentId]
        );
        if (parentResult.rows.length === 0) break;
        breadcrumbs.unshift({ id: parentResult.rows[0].id, title: parentResult.rows[0].title });
        currentParentId = parentResult.rows[0].parent_id;
        depth++;
      }
    }
    page.breadcrumbs = breadcrumbs;

    // Unterseiten laden
    const children = await pool.query(
      `SELECT id, title FROM wiki_pages WHERE parent_id = $1 AND deleted_at IS NULL ORDER BY title`,
      [id]
    );
    page.children = children.rows;

    // Zugriffsprüfung für Nicht-Admins/Auditoren
    if (req.user.global_role !== 'admin' && req.user.global_role !== 'auditor') {
      const isOwn = page.created_by === req.user.id;
      const isInOwnPrivateSpace = page.private_space_id && await (async () => {
        const ps = await pool.query('SELECT 1 FROM private_spaces WHERE id = $1 AND user_id = $2', [page.private_space_id, req.user.id]);
        return ps.rows.length > 0;
      })();
      const isPublishedInMySpace = page.workflow_status === 'published' && page.space_id && await (async () => {
        const sm = await pool.query('SELECT 1 FROM space_memberships WHERE space_id = $1 AND user_id = $2', [page.space_id, req.user.id]);
        return sm.rows.length > 0;
      })();
      if (!isOwn && !isInOwnPrivateSpace && !isPublishedInMySpace) {
        return res.status(404).json({ error: 'Page not found' });
      }
    }

    res.json(page);
  } catch (err) {
    logger.error({ err }, 'Error getting page');
    res.status(500).json({ error: 'Failed to retrieve page' });
  }
});

// ============================================================================
// POST /pages - Neue Seite erstellen
// ============================================================================
// Erstellt eine neue Wiki-Seite mit den angegebenen Daten.
// Erwartet im Request-Body: title, content, parentId (optional), contentType (optional),
// visibility (optional, Standard: 'draft').
// Automatisch wird die erste Version (Version 1) in der Versionshistorie angelegt.
// Erfordert die Berechtigung 'pages.create'.
router.post('/pages', authenticate, requirePermission('pages.create'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Titel und Inhalt aus dem Request-Body extrahieren
  const { title } = req.body;
  const content = sanitizeHtml(req.body.content);

  // Eingabevalidierung für Titel und Inhalt
  const errors = validatePageInput(title, content);
  if (errors.length > 0) return res.status(400).json({ error: errors.join(' '), errors });

  // Transaktion für atomare Seitenerstellung (Seite + Version + Audit)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Optionale Parameter verarbeiten
    const parentId = req.body.parentId ? parseInt(req.body.parentId) : null;
    const contentType = req.body.contentType === 'html' ? 'html' : 'markdown';
    const spaceId = req.body.spaceId ? parseInt(req.body.spaceId) : null;
    const folderId = req.body.folderId ? parseInt(req.body.folderId) : null;
    const privateSpaceId = req.body.privateSpaceId ? parseInt(req.body.privateSpaceId) : null;
    const workflowStatus = spaceId ? 'published' : 'draft';

    // Neue Seite in die Datenbank einfügen
    const result = await client.query(
      `INSERT INTO wiki_pages (title, content, created_by, updated_by, parent_id, content_type, workflow_status, space_id, folder_id, private_space_id)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [title.trim(), content.trim(), req.user.id, parentId, contentType, workflowStatus, spaceId, folderId, privateSpaceId]
    );

    // Erste Version (Version 1) in der Versionshistorie anlegen
    await client.query(
      'INSERT INTO wiki_page_versions (page_id, title, content, created_by, version_number, content_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [result.rows[0].id, title.trim(), content.trim(), req.user.id, 1, contentType]
    );

    // Seitenerstellung im Audit-Log protokollieren
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.id, req.user.username, 'create_page', 'page', result.rows[0].id, JSON.stringify({ title: title.trim() }), getIp(req)]
    );

    await client.query('COMMIT');

    // Erstellte Seite mit Status 201 (Created) zurückgeben
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    // Fehlercode 23505 = Unique-Constraint-Verletzung (Titel existiert bereits)
    if (err.code === '23505') return res.status(409).json({ error: 'A page with this title already exists.' });
    logger.error({ err }, 'Error creating page');
    res.status(500).json({ error: 'Failed to create page' });
  } finally {
    client.release();
  }
});

// ============================================================================
// PUT /pages/:id - Seite aktualisieren
// ============================================================================
// Aktualisiert eine bestehende Wiki-Seite.
// Vor der Aktualisierung wird der aktuelle Stand als neue Version gespeichert.
// Unterstützt das Ändern von: title, content, parentId, contentType, visibility.
// Eine Seite kann nicht ihre eigene übergeordnete Seite sein (Zirkelverweis-Schutz).
// Erfordert die Berechtigung 'pages.edit'.
router.put('/pages/:id', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Seiten-ID aus der URL validieren
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });

  // Titel und Inhalt aus dem Request-Body extrahieren und validieren
  const { title } = req.body;
  const content = sanitizeHtml(req.body.content);
  const errors = validatePageInput(title, content);
  if (errors.length > 0) return res.status(400).json({ error: errors.join(' '), errors });

  // Transaktion für atomare Seitenaktualisierung (Version-Backup + Update + Audit)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Aktuellen Stand der Seite laden
    const current = await client.query('SELECT * FROM wiki_pages WHERE id = $1', [id]);
    if (current.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Page not found' }); }

    // Optimistic Locking: Prüfen ob die Seite seit dem Laden verändert wurde
    if (req.body.expectedUpdatedAt) {
      const expected = new Date(req.body.expectedUpdatedAt).getTime();
      const actual = new Date(current.rows[0].updated_at).getTime();
      if (actual > expected) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'conflict',
          message: 'This page has been modified by another user. Please reload and try again.',
          updatedBy: current.rows[0].updated_by,
          updatedAt: current.rows[0].updated_at,
        });
      }
    }

    // Per-Page Autorisierung: Prüfen ob User diese Seite bearbeiten darf
    if (req.user.global_role !== 'admin') {
      const page = current.rows[0];
      const isOwn = page.created_by === req.user.id;
      const isInOwnPrivateSpace = page.private_space_id && (await client.query('SELECT 1 FROM private_spaces WHERE id = $1 AND user_id = $2', [page.private_space_id, req.user.id])).rows.length > 0;
      const hasSpaceEditRole = page.space_id && (await client.query("SELECT 1 FROM space_memberships WHERE space_id = $1 AND user_id = $2 AND role IN ('owner', 'editor')", [page.space_id, req.user.id])).rows.length > 0;
      if (!isOwn && !isInOwnPrivateSpace && !hasSpaceEditRole) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You do not have edit access to this page' });
      }
    }

    // Nächste Versionsnummer ermitteln
    const nextVersion = await client.query('SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM wiki_page_versions WHERE page_id = $1', [id]);

    // Aktuellen Stand als neue Version in der Versionshistorie speichern (vor der Änderung)
    await client.query(
      'INSERT INTO wiki_page_versions (page_id, title, content, created_by, version_number, content_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, current.rows[0].title, current.rows[0].content, req.user.id, parseInt(nextVersion.rows[0].next), current.rows[0].content_type || 'markdown']
    );

    // Übergeordnete Seite bestimmen (beibehalten, wenn nicht im Request angegeben)
    const parentId = req.body.parentId !== undefined ? (req.body.parentId ? parseInt(req.body.parentId) : null) : current.rows[0].parent_id;

    // Zirkelverweis-Schutz: Eine Seite darf nicht ihre eigene übergeordnete Seite sein
    if (parentId === id) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'A page cannot be its own parent.' }); }

    // Inhaltstyp bestimmen (beibehalten, wenn nicht im Request angegeben)
    const contentType = req.body.contentType !== undefined ? (req.body.contentType === 'html' ? 'html' : 'markdown') : (current.rows[0].content_type || 'markdown');
    const folderId = req.body.folderId !== undefined ? (req.body.folderId ? parseInt(req.body.folderId) : null) : current.rows[0].folder_id;

    // Seite in der Datenbank aktualisieren
    const result = await client.query(
      'UPDATE wiki_pages SET title = $1, content = $2, updated_by = $3, parent_id = $4, content_type = $5, folder_id = $6 WHERE id = $7 RETURNING *',
      [title.trim(), content.trim(), req.user.id, parentId, contentType, folderId, id]
    );
    if (result.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Page not found' }); }

    // Seitenaktualisierung im Audit-Log protokollieren
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.id, req.user.username, 'update_page', 'page', id, JSON.stringify({ title: title.trim() }), getIp(req)]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    // Fehlercode 23505 = Unique-Constraint-Verletzung (Titel existiert bereits)
    if (err.code === '23505') return res.status(409).json({ error: 'A page with this title already exists.' });
    logger.error({ err }, 'Error updating page');
    res.status(500).json({ error: 'Failed to update page' });
  } finally {
    client.release();
  }
});

// ============================================================================
// GET /pages/:id/versions - Versionshistorie einer Seite
// ============================================================================
// Gibt alle gespeicherten Versionen einer Seite zurück, sortiert nach Versionsnummer (absteigend).
// Jede Version enthält den Benutzernamen des Erstellers.
// Zugriffsprüfung über die canAccessPage-Hilfsfunktion.
router.get('/pages/:id/versions', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Seiten-ID aus der URL validieren
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });

  try {
    // Zugriffsberechtigung prüfen
    if (!(await canAccessPage(id, req.user))) return res.status(404).json({ error: 'Page not found' });

    // Alle Versionen der Seite laden, nach Versionsnummer absteigend sortiert
    const result = await pool.query(
      `SELECT v.*, u.username AS created_by_name FROM wiki_page_versions v LEFT JOIN users u ON v.created_by = u.id WHERE v.page_id = $1 ORDER BY v.version_number DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Error listing versions');
    res.status(500).json({ error: 'Failed to retrieve versions' });
  }
});

// ============================================================================
// POST /pages/:id/restore - Version wiederherstellen
// ============================================================================
// Stellt eine frühere Version einer Seite wieder her.
// Der aktuelle Stand wird vorher als neue Version gesichert, um keinen Inhalt zu verlieren.
// Erwartet im Request-Body: versionId (ID der wiederherzustellenden Version).
// Erfordert die Berechtigung 'pages.edit'.
router.post('/pages/:id/restore', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Seiten-ID und Versions-ID validieren
  const id = parseInt(req.params.id);
  const { versionId } = req.body;
  if (isNaN(id) || !versionId) return res.status(400).json({ error: 'Invalid page or version ID' });

  // Transaktion für atomare Versionswiederherstellung (Backup + Restore + Audit)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Gewünschte Version aus der Datenbank laden
    const version = await client.query('SELECT * FROM wiki_page_versions WHERE id = $1 AND page_id = $2', [versionId, id]);
    if (version.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Version not found' }); }

    // Aktuellen Stand der Seite laden
    const current = await client.query('SELECT * FROM wiki_pages WHERE id = $1', [id]);
    if (current.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Page not found' }); }

    // Aktuellen Stand als neue Version sichern (bevor er überschrieben wird)
    const nextVersion = await client.query('SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM wiki_page_versions WHERE page_id = $1', [id]);
    await client.query(
      'INSERT INTO wiki_page_versions (page_id, title, content, created_by, version_number, content_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, current.rows[0].title, current.rows[0].content, req.user.id, parseInt(nextVersion.rows[0].next), current.rows[0].content_type || 'markdown']
    );

    // Seite mit dem Inhalt der gewählten Version aktualisieren (inkl. content_type)
    const restored = await client.query(
      'UPDATE wiki_pages SET title = $1, content = $2, content_type = $3, updated_by = $4 WHERE id = $5 RETURNING *',
      [version.rows[0].title, version.rows[0].content, version.rows[0].content_type || 'markdown', req.user.id, id]
    );

    // Wiederherstellung im Audit-Log protokollieren
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.id, req.user.username, 'restore_page', 'page', id, JSON.stringify({ versionId }), getIp(req)]
    );

    await client.query('COMMIT');
    res.json(restored.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Error restoring page');
    res.status(500).json({ error: 'Failed to restore page' });
  } finally {
    client.release();
  }
});

// ============================================================================
// PUT /pages/:id/visibility - Sichtbarkeit ändern
// ============================================================================
// Ändert die Sichtbarkeit einer Seite zwischen 'draft' (Entwurf) und 'published' (veröffentlicht).
// Nur der Seitenbesitzer oder ein Admin darf die Sichtbarkeit ändern.
// Das Veröffentlichen erfordert Admin-Rechte; andere Benutzer müssen eine Genehmigung beantragen.
// Bei Veröffentlichung werden ausstehende Genehmigungsanfragen automatisch als genehmigt markiert.
// Erfordert die Berechtigung 'pages.edit'.
router.put('/pages/:id/visibility', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Seiten-ID aus der URL validieren
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });

  // Gewünschte Sichtbarkeit aus dem Request-Body extrahieren und validieren
  const { visibility } = req.body;
  if (!['draft', 'in_review', 'changes_requested', 'approved', 'published', 'archived'].includes(visibility)) return res.status(400).json({ error: 'Invalid workflow status' });

  // Nur Admins dürfen direkt auf published/approved/archived setzen
  // Andere Benutzer müssen den Veröffentlichungs-Workflow nutzen
  if (['published', 'approved', 'archived'].includes(visibility) && req.user.global_role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can directly publish, approve, or archive pages. Use the publishing workflow instead.' });
  }

  try {
    // Seite aus der Datenbank laden
    const page = await pool.query('SELECT * FROM wiki_pages WHERE id = $1', [id]);
    if (page.rows.length === 0) return res.status(404).json({ error: 'Page not found' });

    // Berechtigungsprüfung: Nur Seitenbesitzer oder Admin dürfen den Status ändern
    if (req.user.global_role !== 'admin' && page.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the page owner or an admin can change workflow status' });
    }

    const result = await pool.query('UPDATE wiki_pages SET workflow_status = $1 WHERE id = $2 RETURNING *', [visibility, id]);

    // Statusänderung im Audit-Log protokollieren
    await auditLog(req.user.id, req.user.username, 'change_workflow_status', 'page', id, { title: page.rows[0].title, newStatus: visibility }, getIp(req));

    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Error changing visibility');
    res.status(500).json({ error: 'Failed to change page visibility' });
  }
});

// Router exportieren für die Verwendung in der Hauptanwendung
module.exports = router;

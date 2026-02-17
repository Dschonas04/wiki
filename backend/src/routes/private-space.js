/**
 * Nexora – Privater Bereich (Private Space) Routen
 *
 * Jeder Benutzer hat genau einen privaten Bereich.
 * Dieser Bereich ist ein vollstaendiges persoenliches Wiki
 * ohne Freigabe-Workflow. Seiten koennen optional spaeter
 * in einen Team-Bereich veroeffentlicht werden.
 *
 * Endpunkte:
 *  GET    /private-space              -> Privaten Bereich mit allen Seiten laden
 *  GET    /private-space/pages/:id    -> Einzelne Seite mit Breadcrumbs und Unterseiten
 *  POST   /private-space/pages        -> Neue Seite erstellen
 *  PUT    /private-space/pages/:id    -> Seite bearbeiten (keine Workflow-Einschraenkung)
 *  DELETE /private-space/pages/:id    -> Seite loeschen
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { getPool } = require('../database');
const { auditLog } = require('../helpers/audit');

const router = Router();

/**
 * Hilfsfunktion: Privaten Bereich eines Benutzers abrufen oder erstellen.
 */
async function getOrCreatePrivateSpace(userId) {
  const pool = getPool();
  let ps = await pool.query('SELECT * FROM private_spaces WHERE user_id = $1', [userId]);
  if (ps.rows.length > 0) return ps.rows[0];

  ps = await pool.query(
    'INSERT INTO private_spaces (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING RETURNING *',
    [userId]
  );
  if (ps.rows.length > 0) return ps.rows[0];

  ps = await pool.query('SELECT * FROM private_spaces WHERE user_id = $1', [userId]);
  return ps.rows[0];
}

/**
 * Hilfsfunktion: Breadcrumbs (Elternkette) fuer eine Seite aufbauen
 */
async function buildBreadcrumbs(pool, pageId, privateSpaceId) {
  const crumbs = [];
  let currentId = pageId;
  const visited = new Set();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const r = await pool.query(
      'SELECT id, title, parent_id FROM wiki_pages WHERE id = $1 AND private_space_id = $2 AND deleted_at IS NULL',
      [currentId, privateSpaceId]
    );
    if (r.rows.length === 0) break;
    crumbs.unshift({ id: r.rows[0].id, title: r.rows[0].title });
    currentId = r.rows[0].parent_id;
  }
  // Entferne die Seite selbst aus den Breadcrumbs
  if (crumbs.length > 0) crumbs.pop();
  return crumbs;
}

// ===== GET /private-space =====
router.get('/private-space', authenticate, async (req, res) => {
  try {
    const privateSpace = await getOrCreatePrivateSpace(req.user.id);
    const pool = getPool();

    // Alle Seiten laden – mit Inhalt, parent_id und Version-Count
    const pages = await pool.query(
      `SELECT wp.id, wp.title, wp.content, wp.content_type, wp.workflow_status,
              wp.parent_id, wp.created_at, wp.updated_at,
              (SELECT COUNT(*) FROM wiki_page_versions v WHERE v.page_id = wp.id) AS version_count
       FROM wiki_pages wp
       WHERE wp.private_space_id = $1 AND wp.deleted_at IS NULL
       ORDER BY wp.updated_at DESC`,
      [privateSpace.id]
    );

    // Offene Veroeffentlichungsantraege
    const requests = await pool.query(
      `SELECT pr.*, ts.name AS target_space_name, f.name AS target_folder_name,
              u.display_name AS reviewed_by_name
       FROM publish_requests pr
       LEFT JOIN team_spaces ts ON pr.target_space_id = ts.id
       LEFT JOIN folders f ON pr.target_folder_id = f.id
       LEFT JOIN users u ON pr.reviewed_by = u.id
       WHERE pr.requested_by = $1 AND pr.status = 'pending'
       ORDER BY pr.created_at DESC`,
      [req.user.id]
    );

    res.json({
      ...privateSpace,
      pages: pages.rows,
      pending_requests: requests.rows,
    });
  } catch (err) {
    console.error('Fehler beim Laden des privaten Bereichs:', err);
    res.status(500).json({ error: 'Failed to load private space' });
  }
});

// ===== GET /private-space/pages/:id – Einzelne Seite =====
router.get('/private-space/pages/:id', authenticate, async (req, res) => {
  try {
    const privateSpace = await getOrCreatePrivateSpace(req.user.id);
    const pool = getPool();
    const pageId = req.params.id;

    const page = await pool.query(
      `SELECT wp.*, ps.user_id AS owner_id
       FROM wiki_pages wp
       JOIN private_spaces ps ON wp.private_space_id = ps.id
       WHERE wp.id = $1 AND wp.private_space_id = $2 AND wp.deleted_at IS NULL`,
      [pageId, privateSpace.id]
    );
    if (page.rows.length === 0) return res.status(404).json({ error: 'Page not found' });

    // Breadcrumbs
    const breadcrumbs = await buildBreadcrumbs(pool, parseInt(pageId), privateSpace.id);

    // Unterseiten
    const children = await pool.query(
      `SELECT id, title FROM wiki_pages
       WHERE parent_id = $1 AND private_space_id = $2 AND deleted_at IS NULL
       ORDER BY title`,
      [pageId, privateSpace.id]
    );

    const result = page.rows[0];
    delete result.owner_id;
    result.breadcrumbs = breadcrumbs;
    result.children = children.rows;

    res.json(result);
  } catch (err) {
    console.error('Fehler beim Laden der Seite:', err);
    res.status(500).json({ error: 'Failed to load page' });
  }
});

// ===== POST /private-space/pages =====
router.post('/private-space/pages', authenticate, async (req, res) => {
  try {
    const privateSpace = await getOrCreatePrivateSpace(req.user.id);
    const { title, content, contentType, parentId } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    const pool = getPool();

    // Validate parentId belongs to same private space
    if (parentId) {
      const parent = await pool.query(
        'SELECT id FROM wiki_pages WHERE id = $1 AND private_space_id = $2 AND deleted_at IS NULL',
        [parentId, privateSpace.id]
      );
      if (parent.rows.length === 0) return res.status(400).json({ error: 'Parent page not found in your private space' });
    }

    const result = await pool.query(
      `INSERT INTO wiki_pages (title, content, content_type, private_space_id, parent_id, workflow_status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $6) RETURNING *`,
      [title.trim(), content || '', contentType || 'markdown', privateSpace.id, parentId || null, req.user.id]
    );

    // Erste Version anlegen
    await pool.query(
      `INSERT INTO wiki_page_versions (page_id, title, content, content_type, version_number, created_by)
       VALUES ($1, $2, $3, $4, 1, $5)`,
      [result.rows[0].id, title.trim(), content || '', contentType || 'markdown', req.user.id]
    );

    await auditLog(req.user.id, req.user.username, 'create_page', 'wiki_page', result.rows[0].id, null, req.ip);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Fehler beim Erstellen der Seite:', err);
    res.status(500).json({ error: 'Failed to create page' });
  }
});

// ===== PUT /private-space/pages/:id =====
router.put('/private-space/pages/:id', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    const pageId = req.params.id;

    const page = await pool.query(
      `SELECT wp.*, ps.user_id AS owner_id
       FROM wiki_pages wp
       JOIN private_spaces ps ON wp.private_space_id = ps.id
       WHERE wp.id = $1 AND wp.deleted_at IS NULL`,
      [pageId]
    );
    if (page.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    if (page.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'This page does not belong to your private space' });
    }

    // KEINE Workflow-Einschraenkung – im privaten Bereich kann alles bearbeitet werden

    const { title, content, contentType, parentId } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    // Validate parentId if set
    if (parentId) {
      if (parseInt(parentId) === parseInt(pageId)) {
        return res.status(400).json({ error: 'A page cannot be its own parent' });
      }
      const parent = await pool.query(
        'SELECT id FROM wiki_pages WHERE id = $1 AND private_space_id = $2 AND deleted_at IS NULL',
        [parentId, page.rows[0].private_space_id]
      );
      if (parent.rows.length === 0) return res.status(400).json({ error: 'Parent page not found' });
    }

    // Version erstellen (alten Stand sichern)
    const oldPage = page.rows[0];
    await pool.query(
      `INSERT INTO wiki_page_versions (page_id, title, content, content_type, version_number, created_by)
       VALUES ($1, $2, $3, $4,
         (SELECT COALESCE(MAX(version_number), 0) + 1 FROM wiki_page_versions WHERE page_id = $1),
         $5)`,
      [pageId, oldPage.title, oldPage.content, oldPage.content_type, req.user.id]
    );

    // Seite aktualisieren
    const result = await pool.query(
      `UPDATE wiki_pages SET title = $1, content = $2, content_type = $3, parent_id = $4, updated_by = $5
       WHERE id = $6 RETURNING *`,
      [title.trim(), content || '', contentType || oldPage.content_type, parentId !== undefined ? (parentId || null) : oldPage.parent_id, req.user.id, pageId]
    );

    await auditLog(req.user.id, req.user.username, 'update_page', 'wiki_page', parseInt(pageId), null, req.ip);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Fehler beim Bearbeiten der Seite:', err);
    res.status(500).json({ error: 'Failed to update page' });
  }
});

// ===== DELETE /private-space/pages/:id =====
router.delete('/private-space/pages/:id', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    const pageId = req.params.id;

    const page = await pool.query(
      `SELECT wp.*, ps.user_id AS owner_id
       FROM wiki_pages wp
       JOIN private_spaces ps ON wp.private_space_id = ps.id
       WHERE wp.id = $1 AND wp.deleted_at IS NULL`,
      [pageId]
    );
    if (page.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    if (page.rows[0].owner_id !== req.user.id && req.user.global_role !== 'admin') {
      return res.status(403).json({ error: 'This page does not belong to your private space' });
    }

    // Unterseiten werden elternlos (parent_id = null)
    await pool.query(
      'UPDATE wiki_pages SET parent_id = NULL WHERE parent_id = $1 AND deleted_at IS NULL',
      [pageId]
    );

    // Soft-Delete
    await pool.query('UPDATE wiki_pages SET deleted_at = NOW() WHERE id = $1', [pageId]);
    await auditLog(req.user.id, req.user.username, 'delete_page', 'wiki_page', parseInt(pageId), null, req.ip);
    res.json({ message: 'Page deleted' });
  } catch (err) {
    console.error('Fehler beim Loeschen der Seite:', err);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

module.exports = router;

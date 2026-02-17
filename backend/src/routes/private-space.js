/**
 * Nexora – Privater Bereich (Private Space) Routen
 *
 * Jeder Benutzer hat genau einen privaten Bereich.
 * In diesem Bereich werden Entwürfe erstellt und bearbeitet,
 * bevor sie zur Veröffentlichung in einem Team-Bereich eingereicht werden.
 *
 * Endpunkte:
 *  GET    /private-space           → Eigenen privaten Bereich mit Seiten laden
 *  POST   /private-space/pages     → Neue Seite im privaten Bereich erstellen
 *  PUT    /private-space/pages/:id → Seite im privaten Bereich bearbeiten
 *  DELETE /private-space/pages/:id → Seite im privaten Bereich löschen
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { getPool } = require('../database');
const { auditLog } = require('../helpers/audit');

const router = Router();

/**
 * Hilfsfunktion: Privaten Bereich eines Benutzers abrufen oder erstellen.
 * @param {number} userId - Benutzer-ID
 * @returns {Promise<Object>} Privater Bereich
 */
async function getOrCreatePrivateSpace(userId) {
  const pool = getPool();

  // Bestehenden privaten Bereich suchen
  let ps = await pool.query('SELECT * FROM private_spaces WHERE user_id = $1', [userId]);
  if (ps.rows.length > 0) return ps.rows[0];

  // Neuen privaten Bereich erstellen
  ps = await pool.query(
    'INSERT INTO private_spaces (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING RETURNING *',
    [userId]
  );
  if (ps.rows.length > 0) return ps.rows[0];

  // Falls ON CONFLICT → erneut laden
  ps = await pool.query('SELECT * FROM private_spaces WHERE user_id = $1', [userId]);
  return ps.rows[0];
}

// ===== GET /private-space – Privater Bereich mit Seiten =====
router.get('/private-space', authenticate, async (req, res) => {
  try {
    const privateSpace = await getOrCreatePrivateSpace(req.user.id);
    const pool = getPool();

    // Alle Seiten im privaten Bereich laden
    const pages = await pool.query(
      `SELECT wp.id, wp.title, wp.content_type, wp.workflow_status,
              wp.created_at, wp.updated_at,
              (SELECT COUNT(*) FROM wiki_page_versions v WHERE v.page_id = wp.id) AS version_count
       FROM wiki_pages wp
       WHERE wp.private_space_id = $1 AND wp.deleted_at IS NULL
       ORDER BY wp.updated_at DESC`,
      [privateSpace.id]
    );

    // Offene Veröffentlichungsanträge laden
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

// ===== POST /private-space/pages – Neue Seite erstellen =====
router.post('/private-space/pages', authenticate, async (req, res) => {
  try {
    const privateSpace = await getOrCreatePrivateSpace(req.user.id);
    const { title, content, contentType } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO wiki_pages (title, content, content_type, private_space_id, workflow_status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, 'draft', $5, $5) RETURNING *`,
      [title.trim(), content || '', contentType || 'markdown', privateSpace.id, req.user.id]
    );

    await auditLog(req.user.id, req.user.username, 'create_page', 'wiki_page', result.rows[0].id, null, req);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Fehler beim Erstellen der Seite:', err);
    res.status(500).json({ error: 'Failed to create page' });
  }
});

// ===== PUT /private-space/pages/:id – Seite bearbeiten =====
router.put('/private-space/pages/:id', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    const pageId = req.params.id;

    // Seite laden und Zugehörigkeit prüfen
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

    // Nur Entwürfe und Seiten mit angefragten Änderungen können bearbeitet werden
    if (!['draft', 'changes_requested'].includes(page.rows[0].workflow_status)) {
      return res.status(400).json({ error: `Cannot edit page in '${page.rows[0].workflow_status}' status` });
    }

    const { title, content, contentType } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    // Version erstellen (alten Stand sichern)
    const oldPage = page.rows[0];
    await pool.query(
      `INSERT INTO wiki_page_versions (page_id, title, content, content_type, version_number, created_by, change_summary)
       VALUES ($1, $2, $3, $4,
         (SELECT COALESCE(MAX(version_number), 0) + 1 FROM wiki_page_versions WHERE page_id = $1),
         $5, 'Automatische Sicherung vor Bearbeitung')`,
      [pageId, oldPage.title, oldPage.content, oldPage.content_type, req.user.id]
    );

    // Seite aktualisieren
    const result = await pool.query(
      `UPDATE wiki_pages SET title = $1, content = $2, content_type = $3, updated_by = $4 WHERE id = $5 RETURNING *`,
      [title.trim(), content || '', contentType || oldPage.content_type, req.user.id, pageId]
    );

    await auditLog(req.user.id, req.user.username, 'update_page', 'wiki_page', parseInt(pageId), null, req);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Fehler beim Bearbeiten der Seite:', err);
    res.status(500).json({ error: 'Failed to update page' });
  }
});

// ===== DELETE /private-space/pages/:id – Seite löschen =====
router.delete('/private-space/pages/:id', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    const pageId = req.params.id;

    // Seite laden und Zugehörigkeit prüfen
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

    // Seiten in Prüfung können nicht gelöscht werden
    if (page.rows[0].workflow_status === 'in_review') {
      return res.status(400).json({ error: 'Cannot delete a page that is in review. Cancel the publish request first.' });
    }

    // Soft-Delete
    await pool.query('UPDATE wiki_pages SET deleted_at = NOW() WHERE id = $1', [pageId]);
    await auditLog(req.user.id, req.user.username, 'delete_page', 'wiki_page', parseInt(pageId), null, req);
    res.json({ message: 'Page deleted' });
  } catch (err) {
    console.error('Fehler beim Löschen der Seite:', err);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

module.exports = router;

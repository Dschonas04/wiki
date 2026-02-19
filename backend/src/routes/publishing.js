/**
 * Nexora – Veröffentlichungs-Workflow (Publishing) Routen
 *
 * Implementiert den 6-stufigen Veröffentlichungsprozess:
 *   Entwurf (draft) → In Prüfung (in_review) → Änderungen angefragt (changes_requested)
 *   → Genehmigt (approved) → Veröffentlicht (published) → Archiviert (archived)
 *
 * Ablauf:
 *   1. Benutzer erstellt Seite im privaten Bereich (Entwurf)
 *   2. Benutzer stellt Veröffentlichungsantrag (→ in_review)
 *   3. Reviewer/Auditor prüft und genehmigt/lehnt ab/bittet um Änderungen
 *   4. Bei Genehmigung wird Seite in den Ziel-Bereich verschoben (→ published)
 *
 * Endpunkte:
 *  POST   /publishing/request                     → Veröffentlichungsantrag stellen
 *  GET    /publishing/requests                    → Anträge auflisten
 *  GET    /publishing/requests/:id                → Einzelner Antrag
 *  POST   /publishing/requests/:id/approve        → Genehmigen
 *  POST   /publishing/requests/:id/reject         → Ablehnen
 *  POST   /publishing/requests/:id/request-changes → Änderungen anfordern
 *  POST   /publishing/requests/:id/cancel         → Antrag zurückziehen
 *  POST   /publishing/pages/:id/archive           → Seite archivieren
 *  POST   /publishing/pages/:id/unpublish         → Veröffentlichung zurückziehen
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { getPool } = require('../database');
const { auditLog } = require('../helpers/audit');
const { getIp } = require('../helpers/utils');
const { notifyPublishStatus } = require('../helpers/email');
const logger = require('../logger');

const router = Router();

// ===== Gültige Statusübergänge =====
const VALID_TRANSITIONS = {
  draft: ['in_review'],
  in_review: ['approved', 'changes_requested', 'draft', 'published'], // published via approve-Shortcut
  changes_requested: ['in_review', 'draft'],
  approved: ['published'],
  published: ['archived', 'draft'], // draft = zurückgezogen zur Überarbeitung
  archived: ['draft'],
};

/**
 * Prüft ob ein Workflow-Statusübergang gültig ist.
 * @param {string} from - Aktueller Status
 * @param {string} to - Zielstatus
 * @returns {boolean}
 */
function isValidTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * Hilfsfunktion: Prüft ob ein Benutzer ein Reviewer ist (Auditor, Admin, oder Space-Reviewer/Owner)
 */
async function isReviewer(userId, globalRole, spaceId) {
  if (globalRole === 'admin' || globalRole === 'auditor') return true;
  if (!spaceId) return false;
  const pool = getPool();
  const r = await pool.query(
    'SELECT role FROM space_memberships WHERE space_id = $1 AND user_id = $2',
    [spaceId, userId]
  );
  return r.rows.length > 0 && ['owner', 'reviewer'].includes(r.rows[0].role);
}

// ===== POST /publishing/request – Veröffentlichungsantrag stellen =====
router.post('/publishing/request', authenticate, writeLimiter, async (req, res) => {
  try {
    const { pageId, targetSpaceId, targetFolderId, comment } = req.body;
    if (!pageId) return res.status(400).json({ error: 'pageId is required' });
    if (!targetSpaceId) return res.status(400).json({ error: 'targetSpaceId is required' });

    const pool = getPool();

    // Seite prüfen – muss dem Benutzer gehören und im Entwurfsstatus sein
    const page = await pool.query(
      'SELECT * FROM wiki_pages WHERE id = $1 AND deleted_at IS NULL',
      [pageId]
    );
    if (page.rows.length === 0) return res.status(404).json({ error: 'Page not found' });

    const pageData = page.rows[0];
    if (pageData.created_by !== req.user.id && req.user.global_role !== 'admin') {
      return res.status(403).json({ error: 'Only the author or an admin can request publishing' });
    }

    if (!['draft', 'changes_requested'].includes(pageData.workflow_status)) {
      return res.status(400).json({ error: `Page must be in draft or changes_requested status. Current: ${pageData.workflow_status}` });
    }

    // Ziel-Bereich prüfen
    const space = await pool.query('SELECT id FROM team_spaces WHERE id = $1 AND NOT is_archived', [targetSpaceId]);
    if (space.rows.length === 0) return res.status(404).json({ error: 'Target space not found or archived' });

    // Ziel-Ordner prüfen (falls angegeben)
    if (targetFolderId) {
      const folder = await pool.query('SELECT id, space_id FROM folders WHERE id = $1', [targetFolderId]);
      if (folder.rows.length === 0) return res.status(404).json({ error: 'Target folder not found' });
      if (folder.rows[0].space_id != targetSpaceId) {
        return res.status(400).json({ error: 'Target folder does not belong to target space' });
      }
    }

    // Bestehende offene Anträge prüfen
    const existing = await pool.query(
      `SELECT id FROM publish_requests WHERE page_id = $1 AND status = 'pending'`,
      [pageId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'There is already a pending publish request for this page' });
    }

    // Antrag erstellen
    const result = await pool.query(
      `INSERT INTO publish_requests (page_id, requested_by, target_space_id, target_folder_id, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [pageId, req.user.id, targetSpaceId, targetFolderId || null, comment?.trim() || null]
    );

    // Seitenstatus aktualisieren
    await pool.query(
      `UPDATE wiki_pages SET workflow_status = 'in_review', updated_by = $1 WHERE id = $2`,
      [req.user.id, pageId]
    );

    await auditLog(req.user.id, req.user.username, 'publish_request', 'wiki_page', pageId,
      { targetSpaceId, targetFolderId, requestId: result.rows[0].id }, getIp(req));

    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Fehler beim Erstellen des Veröffentlichungsantrags');
    res.status(500).json({ error: 'Failed to create publish request' });
  }
});

// ===== GET /publishing/requests – Anträge auflisten =====
router.get('/publishing/requests', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    const { status } = req.query;

    let query = `
      SELECT pr.*,
             wp.title AS page_title, wp.content_type,
             u1.display_name AS requested_by_name,
             u2.display_name AS reviewed_by_name,
             ts.name AS target_space_name,
             f.name AS target_folder_name
      FROM publish_requests pr
      JOIN wiki_pages wp ON pr.page_id = wp.id
      JOIN users u1 ON pr.requested_by = u1.id
      LEFT JOIN users u2 ON pr.reviewed_by = u2.id
      LEFT JOIN team_spaces ts ON pr.target_space_id = ts.id
      LEFT JOIN folders f ON pr.target_folder_id = f.id
    `;
    const params = [];
    const conditions = [];

    // Nicht-privilegierte Benutzer sehen nur eigene Anträge
    if (req.user.global_role !== 'admin' && req.user.global_role !== 'auditor') {
      conditions.push(`pr.requested_by = $${params.length + 1}`);
      params.push(req.user.id);
    }

    // Optionaler Statusfilter
    if (status) {
      conditions.push(`pr.status = $${params.length + 1}`);
      params.push(status);
    }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY pr.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Fehler beim Laden der Anträge');
    res.status(500).json({ error: 'Failed to load publish requests' });
  }
});

// ===== GET /publishing/requests/:id – Einzelner Antrag =====
router.get('/publishing/requests/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid request ID' });

    const pool = getPool();
    const result = await pool.query(
      `SELECT pr.*,
              wp.title AS page_title, wp.content AS page_content, wp.content_type,
              wp.workflow_status AS current_status,
              u1.display_name AS requested_by_name,
              u2.display_name AS reviewed_by_name,
              ts.name AS target_space_name,
              f.name AS target_folder_name
       FROM publish_requests pr
       JOIN wiki_pages wp ON pr.page_id = wp.id
       JOIN users u1 ON pr.requested_by = u1.id
       LEFT JOIN users u2 ON pr.reviewed_by = u2.id
       LEFT JOIN team_spaces ts ON pr.target_space_id = ts.id
       LEFT JOIN folders f ON pr.target_folder_id = f.id
       WHERE pr.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Publish request not found' });

    // Zugriffsprüfung: Eigener Antrag, Admin, oder Auditor
    const prData = result.rows[0];
    if (prData.requested_by !== req.user.id && req.user.global_role !== 'admin' && req.user.global_role !== 'auditor') {
      // Prüfe ob Benutzer Reviewer im Zielbereich ist
      if (!(await isReviewer(req.user.id, req.user.global_role, prData.target_space_id))) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json(prData);
  } catch (err) {
    logger.error({ err }, 'Fehler beim Laden des Antrags');
    res.status(500).json({ error: 'Failed to load publish request' });
  }
});

// ===== POST /publishing/requests/:id/approve – Genehmigen =====
router.post('/publishing/requests/:id/approve', authenticate, writeLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid request ID' });

    const pool = getPool();
    const pr = await pool.query('SELECT * FROM publish_requests WHERE id = $1', [id]);
    if (pr.rows.length === 0) return res.status(404).json({ error: 'Publish request not found' });

    const prData = pr.rows[0];
    if (prData.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }

    // Workflow-Status der Seite validieren
    const pageCheck = await pool.query('SELECT workflow_status FROM wiki_pages WHERE id = $1', [prData.page_id]);
    if (pageCheck.rows.length > 0 && !isValidTransition(pageCheck.rows[0].workflow_status, 'published')) {
      return res.status(400).json({ error: `Invalid transition: ${pageCheck.rows[0].workflow_status} → published` });
    }

    // Prüfe Reviewer-Berechtigung
    if (!(await isReviewer(req.user.id, req.user.global_role, prData.target_space_id))) {
      return res.status(403).json({ error: 'Only reviewers can approve requests' });
    }

    const { comment } = req.body;

    // Transaktion: Antrag genehmigen + Seite verschieben + Status ändern
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Antrag genehmigen
      await client.query(
        `UPDATE publish_requests SET status = 'approved', reviewed_by = $1, review_comment = $2, reviewed_at = NOW() WHERE id = $3`,
        [req.user.id, comment?.trim() || null, id]
      );

      // Seite in den Zielbereich verschieben und veröffentlichen
      await client.query(
        `UPDATE wiki_pages SET
           space_id = $1,
           folder_id = $2,
           private_space_id = NULL,
           workflow_status = 'published',
           updated_by = $3
         WHERE id = $4`,
        [prData.target_space_id, prData.target_folder_id, req.user.id, prData.page_id]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await auditLog(req.user.id, req.user.username, 'publish_approve', 'wiki_page', prData.page_id,
      { requestId: id, targetSpaceId: prData.target_space_id }, getIp(req));

    notifyPublishStatus(id, 'approved', comment?.trim() || null).catch(() => {});

    res.json({ message: 'Publish request approved. Page is now published.' });
  } catch (err) {
    logger.error({ err }, 'Fehler beim Genehmigen');
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// ===== POST /publishing/requests/:id/reject – Ablehnen =====
router.post('/publishing/requests/:id/reject', authenticate, writeLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid request ID' });

    const pool = getPool();
    const pr = await pool.query('SELECT * FROM publish_requests WHERE id = $1', [id]);
    if (pr.rows.length === 0) return res.status(404).json({ error: 'Publish request not found' });

    const prData = pr.rows[0];
    if (prData.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    // Workflow-Status der Seite validieren
    const pageCheck = await pool.query('SELECT workflow_status FROM wiki_pages WHERE id = $1', [prData.page_id]);
    if (pageCheck.rows.length > 0 && !isValidTransition(pageCheck.rows[0].workflow_status, 'draft')) {
      return res.status(400).json({ error: `Invalid transition: ${pageCheck.rows[0].workflow_status} → draft` });
    }

    if (!(await isReviewer(req.user.id, req.user.global_role, prData.target_space_id))) {
      return res.status(403).json({ error: 'Only reviewers can reject requests' });
    }

    const { comment } = req.body;
    if (!comment?.trim()) return res.status(400).json({ error: 'A comment is required when rejecting' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE publish_requests SET status = 'rejected', reviewed_by = $1, review_comment = $2, reviewed_at = NOW() WHERE id = $3`,
        [req.user.id, comment.trim(), id]
      );

      await client.query(
        `UPDATE wiki_pages SET workflow_status = 'draft', updated_by = $1 WHERE id = $2`,
        [req.user.id, prData.page_id]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await auditLog(req.user.id, req.user.username, 'publish_reject', 'wiki_page', prData.page_id,
      { requestId: id, comment: comment.trim() }, getIp(req));

    notifyPublishStatus(id, 'rejected', comment.trim()).catch(() => {});

    res.json({ message: 'Publish request rejected' });
  } catch (err) {
    logger.error({ err }, 'Fehler beim Ablehnen');
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// ===== POST /publishing/requests/:id/request-changes – Änderungen anfordern =====
router.post('/publishing/requests/:id/request-changes', authenticate, writeLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid request ID' });

    const pool = getPool();
    const pr = await pool.query('SELECT * FROM publish_requests WHERE id = $1', [id]);
    if (pr.rows.length === 0) return res.status(404).json({ error: 'Publish request not found' });

    const prData = pr.rows[0];
    if (prData.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    // Workflow-Status der Seite validieren
    const pageCheck = await pool.query('SELECT workflow_status FROM wiki_pages WHERE id = $1', [prData.page_id]);
    if (pageCheck.rows.length > 0 && !isValidTransition(pageCheck.rows[0].workflow_status, 'changes_requested')) {
      return res.status(400).json({ error: `Invalid transition: ${pageCheck.rows[0].workflow_status} → changes_requested` });
    }

    if (!(await isReviewer(req.user.id, req.user.global_role, prData.target_space_id))) {
      return res.status(403).json({ error: 'Only reviewers can request changes' });
    }

    const { comment } = req.body;
    if (!comment?.trim()) return res.status(400).json({ error: 'A comment is required when requesting changes' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE publish_requests SET status = 'changes_requested', review_comment = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3`,
        [comment.trim(), req.user.id, id]
      );

      await client.query(
        `UPDATE wiki_pages SET workflow_status = 'changes_requested', updated_by = $1 WHERE id = $2`,
        [req.user.id, prData.page_id]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await auditLog(req.user.id, req.user.username, 'publish_changes_requested', 'wiki_page', prData.page_id,
      { requestId: id, comment: comment.trim() }, getIp(req));

    notifyPublishStatus(id, 'changes_requested', comment.trim()).catch(() => {});

    res.json({ message: 'Changes requested' });
  } catch (err) {
    logger.error({ err }, 'Fehler beim Anfordern von Änderungen');
    res.status(500).json({ error: 'Failed to request changes' });
  }
});

// ===== POST /publishing/requests/:id/cancel – Antrag zurückziehen =====
router.post('/publishing/requests/:id/cancel', authenticate, writeLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid request ID' });

    const pool = getPool();
    const pr = await pool.query('SELECT * FROM publish_requests WHERE id = $1', [id]);
    if (pr.rows.length === 0) return res.status(404).json({ error: 'Publish request not found' });

    const prData = pr.rows[0];
    if (prData.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    // Nur der Antragsteller oder Admin kann zurückziehen
    if (prData.requested_by !== req.user.id && req.user.global_role !== 'admin') {
      return res.status(403).json({ error: 'Only the requester or an admin can cancel' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE publish_requests SET status = 'cancelled', reviewed_at = NOW() WHERE id = $1`,
        [id]
      );

      await client.query(
        `UPDATE wiki_pages SET workflow_status = 'draft', updated_by = $1 WHERE id = $2`,
        [req.user.id, prData.page_id]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await auditLog(req.user.id, req.user.username, 'publish_cancel', 'wiki_page', prData.page_id,
      { requestId: id }, getIp(req));

    res.json({ message: 'Publish request cancelled' });
  } catch (err) {
    logger.error({ err }, 'Fehler beim Zurückziehen');
    res.status(500).json({ error: 'Failed to cancel request' });
  }
});

// ===== POST /publishing/pages/:id/archive – Seite archivieren =====
router.post('/publishing/pages/:id/archive', authenticate, writeLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });

    const pool = getPool();
    const page = await pool.query('SELECT * FROM wiki_pages WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (page.rows.length === 0) return res.status(404).json({ error: 'Page not found' });

    const pageData = page.rows[0];
    if (pageData.workflow_status !== 'published') {
      return res.status(400).json({ error: 'Only published pages can be archived' });
    }

    // Nur Space-Owner, Admin oder Auditor
    if (req.user.global_role !== 'admin' && req.user.global_role !== 'auditor') {
      if (pageData.space_id) {
        const membership = await pool.query(
          'SELECT role FROM space_memberships WHERE space_id = $1 AND user_id = $2',
          [pageData.space_id, req.user.id]
        );
        if (!membership.rows[0] || membership.rows[0].role !== 'owner') {
          return res.status(403).json({ error: 'Only space owners, admins, or auditors can archive pages' });
        }
      }
    }

    await pool.query(
      `UPDATE wiki_pages SET workflow_status = 'archived', updated_by = $1 WHERE id = $2`,
      [req.user.id, id]
    );

    await auditLog(req.user.id, req.user.username, 'page_archive', 'wiki_page', id, null, getIp(req));
    res.json({ message: 'Page archived' });
  } catch (err) {
    logger.error({ err }, 'Fehler beim Archivieren');
    res.status(500).json({ error: 'Failed to archive page' });
  }
});

// ===== POST /publishing/pages/:id/unpublish – Veröffentlichung zurückziehen =====
router.post('/publishing/pages/:id/unpublish', authenticate, writeLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });

    const pool = getPool();
    const page = await pool.query('SELECT * FROM wiki_pages WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (page.rows.length === 0) return res.status(404).json({ error: 'Page not found' });

    if (!['published', 'archived'].includes(page.rows[0].workflow_status)) {
      return res.status(400).json({ error: 'Page must be published or archived to unpublish' });
    }

    // Nur Admin
    if (req.user.global_role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can unpublish pages' });
    }

    await pool.query(
      `UPDATE wiki_pages SET workflow_status = 'draft', space_id = NULL, folder_id = NULL, updated_by = $1 WHERE id = $2`,
      [req.user.id, id]
    );

    await auditLog(req.user.id, req.user.username, 'page_unpublish', 'wiki_page', id, null, getIp(req));
    res.json({ message: 'Page unpublished and returned to draft' });
  } catch (err) {
    logger.error({ err }, 'Fehler beim Zurückziehen der Veröffentlichung');
    res.status(500).json({ error: 'Failed to unpublish page' });
  }
});

module.exports = router;

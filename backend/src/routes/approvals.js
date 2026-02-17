/**
 * Approval-System (Genehmigungsworkflow)
 */

const express = require('express');
const router = express.Router();

const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { auditLog } = require('../helpers/audit');
const { getIp } = require('../helpers/utils');

// Genehmigung anfragen
router.post('/pages/:id/request-approval', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const page = await pool.query('SELECT * FROM wiki_pages WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (page.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    if (page.rows[0].created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the page owner can request approval' });
    }
    if (page.rows[0].visibility === 'published') {
      return res.status(400).json({ error: 'Page is already published' });
    }
    const existing = await pool.query("SELECT id FROM approval_requests WHERE page_id = $1 AND status = 'pending'", [id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An approval request is already pending for this page' });
    }
    const result = await pool.query('INSERT INTO approval_requests (page_id, requested_by) VALUES ($1, $2) RETURNING *', [id, req.user.id]);
    await pool.query("UPDATE wiki_pages SET approval_status = 'pending' WHERE id = $1", [id]);
    await auditLog(req.user.id, req.user.username, 'request_approval', 'page', id, { title: page.rows[0].title }, getIp(req));
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error requesting approval:', err.message);
    res.status(500).json({ error: 'Failed to request approval' });
  }
});

// Genehmigung abbrechen
router.post('/pages/:id/cancel-approval', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const page = await pool.query('SELECT * FROM wiki_pages WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (page.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    if (page.rows[0].created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the page owner or admin can cancel the approval request' });
    }
    await pool.query("UPDATE approval_requests SET status = 'rejected', comment = 'Cancelled by owner', resolved_at = CURRENT_TIMESTAMP WHERE page_id = $1 AND status = 'pending'", [id]);
    await pool.query("UPDATE wiki_pages SET approval_status = 'none' WHERE id = $1", [id]);
    res.json({ message: 'Approval request cancelled' });
  } catch (err) {
    console.error('Error cancelling approval:', err.message);
    res.status(500).json({ error: 'Failed to cancel approval request' });
  }
});

// Genehmigungen auflisten
router.get('/approvals', authenticate, requirePermission('users.manage'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const status = (req.query.status || 'pending').toString();
  try {
    const result = await pool.query(`
      SELECT a.*, p.title AS page_title, p.visibility AS page_visibility,
             u.username AS requested_by_name, u.display_name AS requested_by_display,
             r.username AS reviewer_name
      FROM approval_requests a
      JOIN wiki_pages p ON a.page_id = p.id
      JOIN users u ON a.requested_by = u.id
      LEFT JOIN users r ON a.reviewer_id = r.id
      WHERE a.status = $1
      ORDER BY a.created_at DESC`, [status]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing approvals:', err.message);
    res.status(500).json({ error: 'Failed to retrieve approvals' });
  }
});

// Anzahl offener Genehmigungen
router.get('/approvals/count', authenticate, requirePermission('users.manage'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const result = await pool.query("SELECT COUNT(*) FROM approval_requests WHERE status = 'pending'");
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to count approvals' });
  }
});

// Genehmigen
router.post('/approvals/:id/approve', authenticate, requirePermission('users.manage'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid request ID' });
  const { comment } = req.body || {};
  try {
    const request = await pool.query('SELECT * FROM approval_requests WHERE id = $1', [id]);
    if (request.rows.length === 0) return res.status(404).json({ error: 'Approval request not found' });
    if (request.rows[0].status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });
    await pool.query('UPDATE approval_requests SET status = $1, reviewer_id = $2, comment = $3, resolved_at = CURRENT_TIMESTAMP WHERE id = $4', ['approved', req.user.id, comment || null, id]);
    await pool.query("UPDATE wiki_pages SET visibility = 'published', approval_status = 'approved' WHERE id = $1", [request.rows[0].page_id]);
    await auditLog(req.user.id, req.user.username, 'approve_page', 'page', request.rows[0].page_id, { approval_id: id, comment }, getIp(req));
    res.json({ message: 'Page approved and published' });
  } catch (err) {
    console.error('Error approving page:', err.message);
    res.status(500).json({ error: 'Failed to approve page' });
  }
});

// Ablehnen
router.post('/approvals/:id/reject', authenticate, requirePermission('users.manage'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid request ID' });
  const { comment } = req.body || {};
  try {
    const request = await pool.query('SELECT * FROM approval_requests WHERE id = $1', [id]);
    if (request.rows.length === 0) return res.status(404).json({ error: 'Approval request not found' });
    if (request.rows[0].status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });
    await pool.query('UPDATE approval_requests SET status = $1, reviewer_id = $2, comment = $3, resolved_at = CURRENT_TIMESTAMP WHERE id = $4', ['rejected', req.user.id, comment || null, id]);
    await pool.query("UPDATE wiki_pages SET approval_status = 'rejected' WHERE id = $1", [request.rows[0].page_id]);
    await auditLog(req.user.id, req.user.username, 'reject_page', 'page', request.rows[0].page_id, { approval_id: id, comment }, getIp(req));
    res.json({ message: 'Page approval rejected' });
  } catch (err) {
    console.error('Error rejecting page:', err.message);
    res.status(500).json({ error: 'Failed to reject page' });
  }
});

// Genehmigungsstatus einer Seite
router.get('/pages/:id/approval-status', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const result = await pool.query(`
      SELECT a.*, r.username AS reviewer_name FROM approval_requests a
      LEFT JOIN users r ON a.reviewer_id = r.id WHERE a.page_id = $1
      ORDER BY a.created_at DESC LIMIT 1`, [id]);
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('Error getting approval status:', err.message);
    res.status(500).json({ error: 'Failed to get approval status' });
  }
});

module.exports = router;

/**
 * Papierkorb (Soft Delete, Wiederherstellen, Endgültig löschen)
 */

const express = require('express');
const router = express.Router();

const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { auditLog } = require('../helpers/audit');
const { getIp } = require('../helpers/utils');

// Papierkorb auflisten
router.get('/trash', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const isAdmin = req.user.role === 'admin';
  try {
    const result = await pool.query(`
      SELECT p.id, p.title, p.deleted_at, p.visibility,
             u1.username AS created_by_name, u2.username AS deleted_by_name
      FROM wiki_pages p
      LEFT JOIN users u1 ON p.created_by = u1.id
      LEFT JOIN users u2 ON p.deleted_by = u2.id
      WHERE p.deleted_at IS NOT NULL AND ${isAdmin ? 'TRUE' : 'p.created_by = $1'}
      ORDER BY p.deleted_at DESC`, isAdmin ? [] : [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting trash:', err.message);
    res.status(500).json({ error: 'Failed to retrieve trash' });
  }
});

// Wiederherstellen
router.post('/trash/:id/restore', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const page = await pool.query('SELECT * FROM wiki_pages WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
    if (page.rows.length === 0) return res.status(404).json({ error: 'Page not found in trash' });
    if (req.user.role !== 'admin' && page.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the page owner or an admin can restore this page' });
    }
    const result = await pool.query('UPDATE wiki_pages SET deleted_at = NULL, deleted_by = NULL WHERE id = $1 RETURNING *', [id]);
    await auditLog(req.user.id, req.user.username, 'restore_from_trash', 'page', id, { title: result.rows[0].title }, getIp(req));
    res.json({ message: 'Page restored', page: result.rows[0] });
  } catch (err) {
    console.error('Error restoring page:', err.message);
    res.status(500).json({ error: 'Failed to restore page' });
  }
});

// Endgültig löschen
router.delete('/trash/:id', authenticate, requirePermission('pages.delete'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const result = await pool.query('DELETE FROM wiki_pages WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Page not found in trash' });
    await auditLog(req.user.id, req.user.username, 'permanent_delete_page', 'page', id, { title: result.rows[0].title }, getIp(req));
    res.json({ message: 'Page permanently deleted' });
  } catch (err) {
    console.error('Error permanently deleting page:', err.message);
    res.status(500).json({ error: 'Failed to permanently delete page' });
  }
});

// Soft Delete (in den Papierkorb)
router.delete('/pages/:id', authenticate, requirePermission('pages.delete'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const result = await pool.query(
      'UPDATE wiki_pages SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING *',
      [req.user.id, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    await auditLog(req.user.id, req.user.username, 'delete_page', 'page', id, { title: result.rows[0].title }, getIp(req));
    res.json({ message: 'Page moved to trash', page: result.rows[0] });
  } catch (err) {
    console.error('Error deleting page:', err.message);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

module.exports = router;

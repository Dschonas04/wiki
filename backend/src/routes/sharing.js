/**
 * Seitenfreigaben (Sharing)
 */

const express = require('express');
const router = express.Router();

const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { auditLog } = require('../helpers/audit');
const { getIp } = require('../helpers/utils');

// Freigaben einer Seite
router.get('/pages/:id/shares', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const result = await pool.query(`
      SELECT s.id, s.page_id, s.shared_with_user_id, s.permission, s.created_at,
             u.username, u.display_name, sb.username AS shared_by_name
      FROM wiki_page_shares s
      JOIN users u ON s.shared_with_user_id = u.id
      LEFT JOIN users sb ON s.shared_by = sb.id
      WHERE s.page_id = $1 ORDER BY s.created_at DESC`, [id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting shares:', err.message);
    res.status(500).json({ error: 'Failed to retrieve shares' });
  }
});

// Seite freigeben
router.post('/pages/:id/shares', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();
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
             u.username, u.display_name, sb.username AS shared_by_name
      FROM wiki_page_shares s
      JOIN users u ON s.shared_with_user_id = u.id
      LEFT JOIN users sb ON s.shared_by = sb.id
      WHERE s.page_id = $1 ORDER BY s.created_at DESC`, [pageId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error sharing page:', err.message);
    res.status(500).json({ error: 'Failed to share page' });
  }
});

// Freigabe entfernen
router.delete('/pages/:id/shares/:userId', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const pageId = parseInt(req.params.id);
  const userId = parseInt(req.params.userId);
  if (isNaN(pageId) || isNaN(userId)) return res.status(400).json({ error: 'Invalid IDs' });
  try {
    await pool.query('DELETE FROM wiki_page_shares WHERE page_id = $1 AND shared_with_user_id = $2', [pageId, userId]);
    await auditLog(req.user.id, req.user.username, 'unshare_page', 'page', pageId, { removedUser: userId }, getIp(req));
    const result = await pool.query(`
      SELECT s.id, s.page_id, s.shared_with_user_id, s.permission, s.created_at,
             u.username, u.display_name, sb.username AS shared_by_name
      FROM wiki_page_shares s
      JOIN users u ON s.shared_with_user_id = u.id
      LEFT JOIN users sb ON s.shared_by = sb.id
      WHERE s.page_id = $1 ORDER BY s.created_at DESC`, [pageId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error removing share:', err.message);
    res.status(500).json({ error: 'Failed to remove share' });
  }
});

// Mit mir geteilte Seiten
router.get('/shared', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const result = await pool.query(`
      SELECT p.id, p.title, p.content, p.updated_at, p.content_type,
             s.permission, s.created_at AS shared_at, sb.username AS shared_by_name
      FROM wiki_page_shares s
      JOIN wiki_pages p ON s.page_id = p.id
      LEFT JOIN users sb ON s.shared_by = sb.id
      WHERE s.shared_with_user_id = $1 ORDER BY s.created_at DESC`, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting shared pages:', err.message);
    res.status(500).json({ error: 'Failed to retrieve shared pages' });
  }
});

module.exports = router;

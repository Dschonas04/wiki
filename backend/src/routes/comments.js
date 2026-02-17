/**
 * Nexora – Kommentar-Routen
 *
 * CRUD-Operationen für Seitenkommentare mit Thread-Unterstützung.
 *
 * Endpunkte:
 *   GET    /pages/:pageId/comments       - Kommentare einer Seite abrufen
 *   POST   /pages/:pageId/comments       - Neuen Kommentar erstellen
 *   PUT    /comments/:id                 - Kommentar bearbeiten
 *   DELETE /comments/:id                 - Kommentar löschen
 */

const express = require('express');
const router = express.Router();
const { getPool } = require('../database');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../helpers/audit');
const { getIp } = require('../helpers/utils');

// ============================================================================
// GET /pages/:pageId/comments – Kommentare einer Seite laden
// ============================================================================
router.get('/pages/:pageId/comments', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const pageId = parseInt(req.params.pageId);
  if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

  try {
    const result = await pool.query(`
      SELECT c.id, c.page_id, c.user_id, c.content, c.parent_id,
             c.created_at, c.updated_at,
             u.username, u.display_name
      FROM page_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.page_id = $1
      ORDER BY c.created_at ASC
    `, [pageId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error getting comments:', err.message);
    res.status(500).json({ error: 'Failed to load comments' });
  }
});

// ============================================================================
// POST /pages/:pageId/comments – Neuen Kommentar erstellen
// ============================================================================
router.post('/pages/:pageId/comments', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const pageId = parseInt(req.params.pageId);
  if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

  const { content, parentId } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment content is required' });
  }

  try {
    // Verify page exists
    const page = await pool.query('SELECT id, title, created_by FROM wiki_pages WHERE id = $1 AND deleted_at IS NULL', [pageId]);
    if (page.rows.length === 0) return res.status(404).json({ error: 'Page not found' });

    // If parent comment, verify it exists and belongs to same page
    if (parentId) {
      const parent = await pool.query('SELECT id FROM page_comments WHERE id = $1 AND page_id = $2', [parentId, pageId]);
      if (parent.rows.length === 0) return res.status(400).json({ error: 'Parent comment not found' });
    }

    const result = await pool.query(`
      INSERT INTO page_comments (page_id, user_id, content, parent_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [pageId, req.user.id, content.trim(), parentId || null]);

    // Fetch with user info
    const comment = await pool.query(`
      SELECT c.*, u.username, u.display_name
      FROM page_comments c JOIN users u ON c.user_id = u.id
      WHERE c.id = $1
    `, [result.rows[0].id]);

    // Create notification for page author if different from commenter
    const pageData = page.rows[0];
    if (pageData.created_by && pageData.created_by !== req.user.id) {
      await pool.query(`
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES ($1, 'comment', $2, $3, $4)
      `, [
        pageData.created_by,
        'Neuer Kommentar',
        `${req.user.username} hat "${pageData.title}" kommentiert`,
        `/pages/${pageId}`
      ]);
    }

    // If reply, notify parent comment author
    if (parentId) {
      const parentComment = await pool.query('SELECT user_id FROM page_comments WHERE id = $1', [parentId]);
      if (parentComment.rows.length > 0 && parentComment.rows[0].user_id !== req.user.id) {
        await pool.query(`
          INSERT INTO notifications (user_id, type, title, message, link)
          VALUES ($1, 'reply', $2, $3, $4)
        `, [
          parentComment.rows[0].user_id,
          'Antwort auf Kommentar',
          `${req.user.username} hat auf deinen Kommentar geantwortet`,
          `/pages/${pageId}`
        ]);
      }
    }

    await auditLog(pool, req.user.id, req.user.username, 'comment.create', 'comment', result.rows[0].id, { pageId }, getIp(req));

    res.status(201).json(comment.rows[0]);
  } catch (err) {
    console.error('Error creating comment:', err.message);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// ============================================================================
// PUT /comments/:id – Kommentar bearbeiten
// ============================================================================
router.put('/comments/:id', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid comment ID' });

  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment content is required' });
  }

  try {
    const existing = await pool.query('SELECT * FROM page_comments WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Comment not found' });

    // Only author or admin can edit
    if (existing.rows[0].user_id !== req.user.id && req.user.global_role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await pool.query('UPDATE page_comments SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [content.trim(), id]);

    const result = await pool.query(`
      SELECT c.*, u.username, u.display_name
      FROM page_comments c JOIN users u ON c.user_id = u.id
      WHERE c.id = $1
    `, [id]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating comment:', err.message);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// ============================================================================
// DELETE /comments/:id – Kommentar löschen
// ============================================================================
router.delete('/comments/:id', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid comment ID' });

  try {
    const existing = await pool.query('SELECT * FROM page_comments WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Comment not found' });

    // Only author or admin can delete
    if (existing.rows[0].user_id !== req.user.id && req.user.global_role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await pool.query('DELETE FROM page_comments WHERE id = $1', [id]);
    await auditLog(pool, req.user.id, req.user.username, 'comment.delete', 'comment', id, { pageId: existing.rows[0].page_id }, getIp(req));

    res.json({ message: 'Comment deleted' });
  } catch (err) {
    console.error('Error deleting comment:', err.message);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

module.exports = router;

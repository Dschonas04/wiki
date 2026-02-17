/**
 * Tags (Erstellen, Löschen, Seiten-Tags)
 */

const express = require('express');
const router = express.Router();

const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { isValidColor } = require('../helpers/validators');

// Alle Tags
router.get('/tags', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const isAdmin = req.user.role === 'admin';
  try {
    const result = await pool.query(`
      SELECT t.*, COUNT(pt.page_id) AS page_count FROM wiki_tags t
      LEFT JOIN wiki_page_tags pt ON t.id = pt.tag_id
      WHERE ${isAdmin ? 'TRUE' : '(t.created_by = $1 OR t.created_by IS NULL)'}
      GROUP BY t.id ORDER BY t.name ASC`, isAdmin ? [] : [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing tags:', err.message);
    res.status(500).json({ error: 'Failed to retrieve tags' });
  }
});

// Tag erstellen
router.post('/tags', authenticate, requirePermission('pages.create'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tag name is required.' });
  if (name.trim().length > 100) return res.status(400).json({ error: 'Tag name must be 100 characters or less.' });
  const tagColor = color && isValidColor(color) ? color : '#6366f1';
  try {
    const result = await pool.query(
      'INSERT INTO wiki_tags (name, color, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name.trim().toLowerCase(), tagColor, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'You already have a tag with this name.' });
    console.error('Error creating tag:', err.message);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// Tag löschen
router.delete('/tags/:id', authenticate, requirePermission('pages.create'), writeLimiter, async (req, res) => {
  const pool = getPool();
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid tag ID' });
  try {
    const tag = await pool.query('SELECT * FROM wiki_tags WHERE id = $1', [id]);
    if (tag.rows.length === 0) return res.status(404).json({ error: 'Tag not found' });
    if (req.user.role !== 'admin' && tag.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the tag owner or an admin can delete this tag' });
    }
    const result = await pool.query('DELETE FROM wiki_tags WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tag not found' });
    res.json({ message: 'Tag deleted' });
  } catch (err) {
    console.error('Error deleting tag:', err.message);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// Seiten-Tags lesen
router.get('/pages/:id/tags', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  const isAdmin = req.user.role === 'admin';
  try {
    const result = await pool.query(
      `SELECT t.* FROM wiki_tags t JOIN wiki_page_tags pt ON t.id = pt.tag_id
       WHERE pt.page_id = $1 AND ${isAdmin ? 'TRUE' : '(t.created_by = $2 OR t.created_by IS NULL)'}
       ORDER BY t.name ASC`, isAdmin ? [id] : [id, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting page tags:', err.message);
    res.status(500).json({ error: 'Failed to retrieve page tags' });
  }
});

// Seiten-Tags setzen
router.put('/pages/:id/tags', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  const { tagIds } = req.body;
  if (!Array.isArray(tagIds)) return res.status(400).json({ error: 'tagIds must be an array.' });
  const isAdmin = req.user.role === 'admin';
  try {
    await pool.query(
      `DELETE FROM wiki_page_tags WHERE page_id = $1 AND tag_id IN (
        SELECT id FROM wiki_tags WHERE ${isAdmin ? 'TRUE' : '(created_by = $2 OR created_by IS NULL)'}
      )`, isAdmin ? [id] : [id, req.user.id]
    );
    for (const tagId of tagIds) {
      await pool.query('INSERT INTO wiki_page_tags (page_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, tagId]);
    }
    const result = await pool.query(
      `SELECT t.* FROM wiki_tags t JOIN wiki_page_tags pt ON t.id = pt.tag_id
       WHERE pt.page_id = $1 AND ${isAdmin ? 'TRUE' : '(t.created_by = $2 OR t.created_by IS NULL)'}
       ORDER BY t.name`, isAdmin ? [id] : [id, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error setting page tags:', err.message);
    res.status(500).json({ error: 'Failed to update page tags' });
  }
});

module.exports = router;

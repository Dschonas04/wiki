/**
 * Favoriten
 */

const express = require('express');
const router = express.Router();

const { getPool } = require('../database');
const { authenticate } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');

// Favoriten auflisten
router.get('/favorites', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const result = await pool.query(`
      SELECT p.id, p.title, p.updated_at, p.created_at, f.created_at AS favorited_at,
             u.username AS updated_by_name
      FROM wiki_favorites f
      JOIN wiki_pages p ON f.page_id = p.id
      LEFT JOIN users u ON p.updated_by = u.id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC`, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting favorites:', err.message);
    res.status(500).json({ error: 'Failed to retrieve favorites' });
  }
});

// Favorit umschalten
router.post('/favorites/:pageId', authenticate, writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const pageId = parseInt(req.params.pageId);
  if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const existing = await pool.query('SELECT 1 FROM wiki_favorites WHERE user_id = $1 AND page_id = $2', [req.user.id, pageId]);
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM wiki_favorites WHERE user_id = $1 AND page_id = $2', [req.user.id, pageId]);
      res.json({ favorited: false });
    } else {
      await pool.query('INSERT INTO wiki_favorites (user_id, page_id) VALUES ($1, $2)', [req.user.id, pageId]);
      res.json({ favorited: true });
    }
  } catch (err) {
    console.error('Error toggling favorite:', err.message);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// Favorit prüfen
router.get('/favorites/:pageId/check', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const pageId = parseInt(req.params.pageId);
  if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const result = await pool.query('SELECT 1 FROM wiki_favorites WHERE user_id = $1 AND page_id = $2', [req.user.id, pageId]);
    res.json({ favorited: result.rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check favorite' });
  }
});

module.exports = router;

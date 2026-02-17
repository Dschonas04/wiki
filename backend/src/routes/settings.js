/**
 * Benutzereinstellungen (Theme etc.)
 */

const express = require('express');
const router = express.Router();

const { getPool } = require('../database');
const { authenticate } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');

const VALID_THEMES = ['light', 'dark', 'orange', 'midnight', 'contrast', 'soft-dark'];

// Theme lesen
router.get('/settings/theme', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const result = await pool.query(
      "SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = 'theme'",
      [req.user.id]
    );
    const theme = result.rows.length > 0 ? result.rows[0].setting_value : 'light';
    res.json({ theme });
  } catch (err) {
    console.error('Error getting theme:', err.message);
    res.status(500).json({ error: 'Failed to get theme' });
  }
});

// Theme setzen
router.put('/settings/theme', authenticate, writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const { theme } = req.body;
  if (!theme || !VALID_THEMES.includes(theme)) {
    return res.status(400).json({ error: `Invalid theme. Valid: ${VALID_THEMES.join(', ')}` });
  }
  try {
    await pool.query(
      `INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at)
       VALUES ($1, 'theme', $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, theme]
    );
    res.json({ theme });
  } catch (err) {
    console.error('Error setting theme:', err.message);
    res.status(500).json({ error: 'Failed to save theme' });
  }
});

module.exports = router;

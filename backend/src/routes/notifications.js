/**
 * Nexora – Benachrichtigungs-Routen
 *
 * Verwaltung von In-App-Benachrichtigungen.
 *
 * Endpunkte:
 *   GET    /notifications            - Benachrichtigungen des Benutzers
 *   GET    /notifications/unread     - Anzahl ungelesener Benachrichtigungen
 *   PUT    /notifications/:id/read   - Als gelesen markieren
 *   PUT    /notifications/read-all   - Alle als gelesen markieren
 *   DELETE /notifications/:id        - Benachrichtigung löschen
 */

const express = require('express');
const router = express.Router();
const { getPool } = require('../database');
const { authenticate } = require('../middleware/auth');
const logger = require('../logger');

// ============================================================================
// GET /notifications – Benachrichtigungen laden
// ============================================================================
router.get('/notifications', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  try {
    const result = await pool.query(`
      SELECT * FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      items: result.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    logger.error({ err }, 'Error getting notifications');
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// ============================================================================
// GET /notifications/unread – Anzahl ungelesener Benachrichtigungen
// ============================================================================
router.get('/notifications/unread', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    logger.error({ err }, 'Error getting unread count');
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// ============================================================================
// PUT /notifications/:id/read – Einzelne als gelesen markieren
// ============================================================================
router.put('/notifications/:id/read', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    res.json({ message: 'Marked as read' });
  } catch (err) {
    logger.error({ err }, 'Error marking notification read');
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// ============================================================================
// PUT /notifications/read-all – Alle als gelesen markieren
// ============================================================================
router.put('/notifications/read-all', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ message: 'All marked as read' });
  } catch (err) {
    logger.error({ err }, 'Error marking all read');
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

// ============================================================================
// DELETE /notifications/:id – Benachrichtigung löschen
// ============================================================================
router.delete('/notifications/:id', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

  try {
    await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    logger.error({ err }, 'Error deleting notification');
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

module.exports = router;

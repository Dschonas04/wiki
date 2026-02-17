/**
 * Audit-Log
 */

const express = require('express');
const router = express.Router();

const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.get('/audit', authenticate, requirePermission('audit.read'), async (req, res) => {
  const pool = getPool();
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const result = await pool.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    const count = await pool.query('SELECT COUNT(*) FROM audit_log');
    res.json({ items: result.rows, total: parseInt(count.rows[0].count), limit, offset });
  } catch (err) {
    console.error('Audit log error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve audit log' });
  }
});

module.exports = router;

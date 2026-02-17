/**
 * Health-Checks
 */

const express = require('express');
const router = express.Router();

const { LDAP_ENABLED, PERMISSIONS } = require('../config');
const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');

// Public (Docker Healthcheck)
router.get('/health', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ status: 'unhealthy' });
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy' });
  } catch {
    res.status(503).json({ status: 'unhealthy' });
  }
});

// Detailliert (Auth erforderlich)
router.get('/health/details', authenticate, requirePermission('health.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  try {
    const result = await pool.query('SELECT NOW()');
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const pageCount = await pool.query('SELECT COUNT(*) FROM wiki_pages');
    res.json({
      status: 'healthy',
      database: 'connected',
      ldap: LDAP_ENABLED ? 'enabled' : 'disabled',
      rbac: 'active',
      roles: Object.keys(PERMISSIONS),
      counts: { users: parseInt(userCount.rows[0].count), pages: parseInt(pageCount.rows[0].count) },
      timestamp: result.rows[0].now,
      uptime: Math.floor(process.uptime()),
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', database: 'error' });
  }
});

module.exports = router;

/**
 * Audit-Logging
 */

const { getPool } = require('../database');

async function auditLog(userId, username, action, resourceType, resourceId, details, ipAddress) {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, username, action, resourceType, resourceId, details ? JSON.stringify(details) : null, ipAddress]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = { auditLog };

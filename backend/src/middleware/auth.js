/**
 * Authentifizierungs-Middleware
 */

const jwt = require('jsonwebtoken');
const { JWT_SECRET, COOKIE_NAME, PERMISSIONS } = require('../config');
const { getPool } = require('../database');

async function authenticate(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const pool = getPool();
    if (pool) {
      const check = await pool.query(
        'SELECT id, username, role, is_active, must_change_password FROM users WHERE id = $1',
        [decoded.id]
      );
      if (check.rows.length === 0 || !check.rows[0].is_active) {
        res.clearCookie(COOKIE_NAME);
        return res.status(401).json({ error: 'Account disabled or deleted.' });
      }
      decoded.role = check.rows[0].role;
      decoded.mustChangePassword = check.rows[0].must_change_password;
    }
    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

function requirePermission(...perms) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const userPerms = PERMISSIONS[req.user.role] || [];
    const hasAll = perms.every(p => userPerms.includes(p));
    if (!hasAll) {
      return res.status(403).json({ error: 'Insufficient permissions', required: perms, your_role: req.user.role });
    }
    next();
  };
}

module.exports = { authenticate, requirePermission };

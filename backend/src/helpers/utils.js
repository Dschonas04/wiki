/**
 * Hilfsfunktionen
 */

const { getPool } = require('../database');
const { PERMISSIONS } = require('../config');

function getIp(req) {
  return req.headers['x-real-ip'] || req.ip;
}

async function canAccessPage(pageId, user) {
  const pool = getPool();
  if (!pool) return false;
  if (user.role === 'admin') return true;
  const result = await pool.query(
    `SELECT 1 FROM wiki_pages WHERE id = $1 AND (visibility = 'published' OR created_by = $2 OR EXISTS (SELECT 1 FROM wiki_page_shares WHERE page_id = $1 AND shared_with_user_id = $2))`,
    [pageId, user.id]
  );
  return result.rows.length > 0;
}

function formatUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    email: u.email,
    role: u.role,
    authSource: u.auth_source,
    lastLogin: u.last_login,
    createdAt: u.created_at,
    mustChangePassword: u.must_change_password || false,
    permissions: PERMISSIONS[u.role] || [],
  };
}

module.exports = { getIp, canAccessPage, formatUser };

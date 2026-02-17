/**
 * Nexora – Admin-Dashboard-Routen
 *
 * Analytics und Statistiken für Administratoren.
 *
 * Endpunkte:
 *   GET /dashboard/stats      - Gesamtstatistiken
 *   GET /dashboard/activity   - Aktivitäts-Timeline (letzte 30 Tage)
 *   GET /dashboard/top-pages  - Meistbearbeitete Seiten
 *   GET /dashboard/top-users  - Aktivste Benutzer
 */

const express = require('express');
const router = express.Router();
const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');

// ============================================================================
// GET /dashboard/stats – Gesamtstatistiken
// ============================================================================
router.get('/dashboard/stats', authenticate, requirePermission('admin'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const [pages, users, spaces, comments, drafts, published, templates] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM wiki_pages WHERE deleted_at IS NULL'),
      pool.query('SELECT COUNT(*) FROM users WHERE is_active = true'),
      pool.query('SELECT COUNT(*) FROM team_spaces WHERE is_archived = false'),
      pool.query('SELECT COUNT(*) FROM page_comments'),
      pool.query("SELECT COUNT(*) FROM wiki_pages WHERE deleted_at IS NULL AND workflow_status = 'draft'"),
      pool.query("SELECT COUNT(*) FROM wiki_pages WHERE deleted_at IS NULL AND workflow_status = 'published'"),
      pool.query('SELECT COUNT(*) FROM page_templates'),
    ]);

    res.json({
      totalPages: parseInt(pages.rows[0].count),
      activeUsers: parseInt(users.rows[0].count),
      teamSpaces: parseInt(spaces.rows[0].count),
      totalComments: parseInt(comments.rows[0].count),
      draftPages: parseInt(drafts.rows[0].count),
      publishedPages: parseInt(published.rows[0].count),
      templateCount: parseInt(templates.rows[0].count),
    });
  } catch (err) {
    console.error('Error getting dashboard stats:', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ============================================================================
// GET /dashboard/activity – Aktivitäts-Timeline (letzte 30 Tage)
// ============================================================================
router.get('/dashboard/activity', authenticate, requirePermission('admin'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    // Pages created per day
    const pagesPerDay = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM wiki_pages
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days' AND deleted_at IS NULL
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    // Edits per day (versions)
    const editsPerDay = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM wiki_page_versions
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    // Comments per day
    const commentsPerDay = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM page_comments
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    // Logins per day (audit_log)
    const loginsPerDay = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM audit_log
      WHERE action = 'login' AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    res.json({
      pagesPerDay: pagesPerDay.rows,
      editsPerDay: editsPerDay.rows,
      commentsPerDay: commentsPerDay.rows,
      loginsPerDay: loginsPerDay.rows,
    });
  } catch (err) {
    console.error('Error getting activity data:', err.message);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

// ============================================================================
// GET /dashboard/top-pages – Meistbearbeitete Seiten
// ============================================================================
router.get('/dashboard/top-pages', authenticate, requirePermission('admin'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  try {
    const result = await pool.query(`
      SELECT p.id, p.title, p.workflow_status, p.created_at, p.updated_at,
             u.username as created_by_name,
             COUNT(v.id) as version_count,
             COUNT(DISTINCT c.id) as comment_count
      FROM wiki_pages p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN wiki_page_versions v ON v.page_id = p.id
      LEFT JOIN page_comments c ON c.page_id = p.id
      WHERE p.deleted_at IS NULL
      GROUP BY p.id, p.title, p.workflow_status, p.created_at, p.updated_at, u.username
      ORDER BY version_count DESC, comment_count DESC
      LIMIT $1
    `, [limit]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error getting top pages:', err.message);
    res.status(500).json({ error: 'Failed to load top pages' });
  }
});

// ============================================================================
// GET /dashboard/top-users – Aktivste Benutzer
// ============================================================================
router.get('/dashboard/top-users', authenticate, requirePermission('admin'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.display_name, u.global_role, u.last_login,
             COUNT(DISTINCT p.id) as page_count,
             COUNT(DISTINCT v.id) as edit_count,
             COUNT(DISTINCT c.id) as comment_count
      FROM users u
      LEFT JOIN wiki_pages p ON p.created_by = u.id AND p.deleted_at IS NULL
      LEFT JOIN wiki_page_versions v ON v.created_by = u.id
      LEFT JOIN page_comments c ON c.user_id = u.id
      WHERE u.is_active = true
      GROUP BY u.id, u.username, u.display_name, u.global_role, u.last_login
      ORDER BY edit_count DESC, page_count DESC
      LIMIT $1
    `, [limit]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error getting top users:', err.message);
    res.status(500).json({ error: 'Failed to load top users' });
  }
});

module.exports = router;

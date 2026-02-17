/**
 * Knowledge Graph – Daten für die Wissenslandkarte
 * Nur Seiten und Parent-Child-Verbindungen (keine Tags)
 */

const express = require('express');
const router = express.Router();

const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.get('/graph', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const isAdmin = req.user.role === 'admin';

  try {
    // Alle sichtbaren Seiten
    const pagesResult = await pool.query(`
      SELECT p.id, p.title, p.parent_id, p.visibility, p.content_type,
             p.created_by, u.username AS created_by_name,
             p.updated_at
      FROM wiki_pages p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.deleted_at IS NULL
        AND ${isAdmin ? 'TRUE' : `(p.visibility = 'published' OR p.created_by = $1 OR EXISTS (SELECT 1 FROM wiki_page_shares s WHERE s.page_id = p.id AND s.shared_with_user_id = $1))`}
      ORDER BY p.title ASC`,
      isAdmin ? [] : [req.user.id]
    );

    // Nodes — nur Seiten
    const nodes = pagesResult.rows.map(p => ({
      id: `page-${p.id}`,
      pageId: p.id,
      label: p.title,
      type: 'page',
      visibility: p.visibility,
      author: p.created_by_name,
      updatedAt: p.updated_at,
    }));

    // Edges — nur Parent-Child
    const edges = [];
    for (const page of pagesResult.rows) {
      if (page.parent_id) {
        const parentExists = pagesResult.rows.some(p => p.id === page.parent_id);
        if (parentExists) {
          edges.push({
            source: `page-${page.parent_id}`,
            target: `page-${page.id}`,
            type: 'parent',
          });
        }
      }
    }

    res.json({ nodes, edges });
  } catch (err) {
    console.error('Error building graph:', err.message);
    res.status(500).json({ error: 'Failed to build knowledge graph' });
  }
});

module.exports = router;

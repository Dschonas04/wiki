/**
 * Knowledge Graph – Daten für die Wissenslandkarte
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

    // Tags pro Seite
    const tagsResult = await pool.query(`
      SELECT pt.page_id, t.id AS tag_id, t.name, t.color
      FROM wiki_page_tags pt
      JOIN wiki_tags t ON pt.tag_id = t.id
    `);

    const tagMap = {};
    for (const row of tagsResult.rows) {
      if (!tagMap[row.page_id]) tagMap[row.page_id] = [];
      tagMap[row.page_id].push({ id: row.tag_id, name: row.name, color: row.color });
    }

    // Nodes
    const nodes = pagesResult.rows.map(p => ({
      id: `page-${p.id}`,
      pageId: p.id,
      label: p.title,
      type: 'page',
      visibility: p.visibility,
      author: p.created_by_name,
      tags: tagMap[p.id] || [],
      updatedAt: p.updated_at,
    }));

    // Tag-Nodes (eindeutige Tags)
    const uniqueTags = new Map();
    for (const tags of Object.values(tagMap)) {
      for (const tag of tags) {
        if (!uniqueTags.has(tag.id)) {
          uniqueTags.set(tag.id, { id: `tag-${tag.id}`, label: tag.name, type: 'tag', color: tag.color });
        }
      }
    }
    nodes.push(...uniqueTags.values());

    // Edges
    const edges = [];

    // Parent-Child-Beziehungen
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

    // Seite → Tag Verbindungen
    for (const [pageId, tags] of Object.entries(tagMap)) {
      const pageNode = pagesResult.rows.find(p => p.id === parseInt(pageId));
      if (pageNode) {
        for (const tag of tags) {
          edges.push({
            source: `page-${pageId}`,
            target: `tag-${tag.id}`,
            type: 'tag',
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

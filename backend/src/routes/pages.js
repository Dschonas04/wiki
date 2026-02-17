/**
 * Wiki-Seiten (CRUD, Suche, Export, Versionen, Sichtbarkeit)
 */

const express = require('express');
const router = express.Router();

const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { auditLog } = require('../helpers/audit');
const { getIp, canAccessPage } = require('../helpers/utils');
const { validatePageInput } = require('../helpers/validators');

// Letzte Seiten
router.get('/pages/recent', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const isAdmin = req.user.role === 'admin';
  try {
    const result = await pool.query(`
      SELECT p.id, p.title, p.updated_at, p.created_at, p.visibility, u.username AS updated_by_name
      FROM wiki_pages p
      LEFT JOIN users u ON p.updated_by = u.id
      WHERE p.deleted_at IS NULL AND ${isAdmin ? 'TRUE' : `(p.visibility = 'published' OR p.created_by = $2 OR EXISTS (SELECT 1 FROM wiki_page_shares s WHERE s.page_id = p.id AND s.shared_with_user_id = $2))`}
      ORDER BY p.updated_at DESC
      LIMIT $1`, isAdmin ? [limit] : [limit, req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting recent pages:', err.message);
    res.status(500).json({ error: 'Failed to retrieve recent pages' });
  }
});

// Export einzelne Seite
router.get('/pages/:id/export', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    if (!(await canAccessPage(id, req.user))) return res.status(404).json({ error: 'Page not found' });
    const result = await pool.query('SELECT * FROM wiki_pages WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    const page = result.rows[0];
    const md = `# ${page.title}\n\n${page.content}\n\n---\n_Exported from Wiki on ${new Date().toISOString()}_\n`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${page.title.replace(/[^a-z0-9]/gi, '_')}.md"`);
    res.send(md);
  } catch (err) {
    console.error('Error exporting page:', err.message);
    res.status(500).json({ error: 'Failed to export page' });
  }
});

// Export alle Seiten
router.get('/pages/export-all', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const isAdmin = req.user.role === 'admin';
  try {
    const result = await pool.query(`
      SELECT p.id, p.title, p.content, p.content_type, p.parent_id, p.created_at, p.updated_at,
             u1.username AS created_by_name, u2.username AS updated_by_name
      FROM wiki_pages p
      LEFT JOIN users u1 ON p.created_by = u1.id
      LEFT JOIN users u2 ON p.updated_by = u2.id
      WHERE p.deleted_at IS NULL AND ${isAdmin ? 'TRUE' : `(p.visibility = 'published' OR p.created_by = $1 OR EXISTS (SELECT 1 FROM wiki_page_shares s WHERE s.page_id = p.id AND s.shared_with_user_id = $1))`}
      ORDER BY p.parent_id NULLS FIRST, p.title ASC`, isAdmin ? [] : [req.user.id]);
    const tagsResult = await pool.query(`
      SELECT pt.page_id, t.name, t.color FROM wiki_page_tags pt JOIN wiki_tags t ON pt.tag_id = t.id`);
    const tagMap = {};
    for (const row of tagsResult.rows) {
      if (!tagMap[row.page_id]) tagMap[row.page_id] = [];
      tagMap[row.page_id].push({ name: row.name, color: row.color });
    }
    const pages = result.rows.map(p => ({ ...p, tags: tagMap[p.id] || [] }));
    const buildTree = (parentId) => pages.filter(p => p.parent_id === parentId).map(p => ({ ...p, children: buildTree(p.id) }));
    const tree = buildTree(null);
    const lines = [];
    const renderPage = (page, depth = 0) => {
      const prefix = '#'.repeat(Math.min(depth + 1, 6));
      lines.push(`${prefix} ${page.title}`);
      if (page.tags.length) lines.push(`Tags: ${page.tags.map(t => t.name).join(', ')}`);
      lines.push('');
      lines.push(page.content_type === 'html' ? `<!-- HTML content -->\n${page.content}` : page.content);
      lines.push('', '---', '');
      for (const child of page.children) renderPage(child, depth + 1);
    };
    lines.push(`# Wiki Export\n\nExported on ${new Date().toISOString()}\n\n---\n`);
    for (const page of tree) renderPage(page);
    const content = lines.join('\n');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="wiki-export-${new Date().toISOString().split('T')[0]}.md"`);
    res.send(content);
  } catch (err) {
    console.error('Error exporting all pages:', err.message);
    res.status(500).json({ error: 'Failed to export pages' });
  }
});

// Suche
router.get('/pages/search', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json([]);
  const isAdmin = req.user.role === 'admin';
  try {
    const result = await pool.query(`
      SELECT p.*, u1.username AS created_by_name, u2.username AS updated_by_name,
             ts_rank(p.search_vector, plainto_tsquery('simple', $1)) AS rank
      FROM wiki_pages p
      LEFT JOIN users u1 ON p.created_by = u1.id
      LEFT JOIN users u2 ON p.updated_by = u2.id
      WHERE p.deleted_at IS NULL AND p.search_vector @@ plainto_tsquery('simple', $1)
        AND ${isAdmin ? 'TRUE' : `(p.visibility = 'published' OR p.created_by = $2 OR EXISTS (SELECT 1 FROM wiki_page_shares s WHERE s.page_id = p.id AND s.shared_with_user_id = $2))`}
      ORDER BY rank DESC, p.updated_at DESC
      LIMIT 50`,
      isAdmin ? [q] : [q, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error searching pages:', err.message);
    res.status(500).json({ error: 'Failed to search pages' });
  }
});

// Alle Seiten
router.get('/pages', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const isAdmin = req.user.role === 'admin';
  const tagId = req.query.tag ? parseInt(req.query.tag) : null;
  try {
    const params = isAdmin ? [] : [req.user.id];
    let tagJoin = '';
    if (tagId) {
      const idx = params.length + 1;
      tagJoin = ` AND EXISTS (SELECT 1 FROM wiki_page_tags pt WHERE pt.page_id = p.id AND pt.tag_id = $${idx})`;
      params.push(tagId);
    }
    const result = await pool.query(`
      SELECT p.*, u1.username AS created_by_name, u2.username AS updated_by_name,
             (SELECT COUNT(*) FROM wiki_pages c WHERE c.parent_id = p.id AND c.deleted_at IS NULL) AS children_count
      FROM wiki_pages p
      LEFT JOIN users u1 ON p.created_by = u1.id
      LEFT JOIN users u2 ON p.updated_by = u2.id
      WHERE p.deleted_at IS NULL AND ${isAdmin ? 'TRUE' : `(p.visibility = 'published' OR p.created_by = $1 OR EXISTS (SELECT 1 FROM wiki_page_shares s WHERE s.page_id = p.id AND s.shared_with_user_id = $1))`}${tagJoin}
      ORDER BY p.updated_at DESC`, params);

    // Attach tags to each page
    const pageIds = result.rows.map(p => p.id);
    let tagMap = {};
    if (pageIds.length > 0) {
      const tagsResult = await pool.query(
        `SELECT pt.page_id, t.id, t.name, t.color FROM wiki_page_tags pt JOIN wiki_tags t ON pt.tag_id = t.id WHERE pt.page_id = ANY($1)`,
        [pageIds]
      );
      for (const row of tagsResult.rows) {
        if (!tagMap[row.page_id]) tagMap[row.page_id] = [];
        tagMap[row.page_id].push({ id: row.id, name: row.name, color: row.color });
      }
    }
    const pages = result.rows.map(p => ({ ...p, tags: tagMap[p.id] || [] }));
    res.json(pages);
  } catch (err) {
    console.error('Error listing pages:', err.message);
    res.status(500).json({ error: 'Failed to retrieve pages' });
  }
});

// Einzelne Seite
router.get('/pages/:id', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    const result = await pool.query(`
      SELECT p.*, u1.username AS created_by_name, u2.username AS updated_by_name
      FROM wiki_pages p
      LEFT JOIN users u1 ON p.created_by = u1.id
      LEFT JOIN users u2 ON p.updated_by = u2.id
      WHERE p.id = $1 AND p.deleted_at IS NULL`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    const page = result.rows[0];
    if (req.user.role !== 'admin' && page.visibility !== 'published' && page.created_by !== req.user.id) {
      const shared = await pool.query('SELECT 1 FROM wiki_page_shares WHERE page_id = $1 AND shared_with_user_id = $2', [id, req.user.id]);
      if (shared.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    }
    res.json(page);
  } catch (err) {
    console.error('Error getting page:', err.message);
    res.status(500).json({ error: 'Failed to retrieve page' });
  }
});

// Seite erstellen
router.post('/pages', authenticate, requirePermission('pages.create'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const { title, content } = req.body;
  const errors = validatePageInput(title, content);
  if (errors.length > 0) return res.status(400).json({ error: errors.join(' '), errors });
  try {
    const parentId = req.body.parentId ? parseInt(req.body.parentId) : null;
    const contentType = req.body.contentType === 'html' ? 'html' : 'markdown';
    const visibility = req.body.visibility === 'published' ? 'published' : 'draft';
    const result = await pool.query(
      'INSERT INTO wiki_pages (title, content, created_by, updated_by, parent_id, content_type, visibility) VALUES ($1, $2, $3, $3, $4, $5, $6) RETURNING *',
      [title.trim(), content.trim(), req.user.id, parentId, contentType, visibility]
    );
    await pool.query(
      'INSERT INTO wiki_page_versions (page_id, title, content, created_by, version_number, content_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [result.rows[0].id, title.trim(), content.trim(), req.user.id, 1, contentType]
    );
    await auditLog(req.user.id, req.user.username, 'create_page', 'page', result.rows[0].id, { title: title.trim() }, getIp(req));
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A page with this title already exists.' });
    console.error('Error creating page:', err.message);
    res.status(500).json({ error: 'Failed to create page' });
  }
});

// Seite aktualisieren
router.put('/pages/:id', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  const { title, content } = req.body;
  const errors = validatePageInput(title, content);
  if (errors.length > 0) return res.status(400).json({ error: errors.join(' '), errors });
  try {
    const current = await pool.query('SELECT * FROM wiki_pages WHERE id = $1', [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    const nextVersion = await pool.query('SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM wiki_page_versions WHERE page_id = $1', [id]);
    await pool.query(
      'INSERT INTO wiki_page_versions (page_id, title, content, created_by, version_number, content_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, current.rows[0].title, current.rows[0].content, req.user.id, parseInt(nextVersion.rows[0].next), current.rows[0].content_type || 'markdown']
    );
    const parentId = req.body.parentId !== undefined ? (req.body.parentId ? parseInt(req.body.parentId) : null) : current.rows[0].parent_id;
    if (parentId === id) return res.status(400).json({ error: 'A page cannot be its own parent.' });
    const contentType = req.body.contentType !== undefined ? (req.body.contentType === 'html' ? 'html' : 'markdown') : (current.rows[0].content_type || 'markdown');
    const visibility = req.body.visibility !== undefined ? (['draft', 'published'].includes(req.body.visibility) ? req.body.visibility : current.rows[0].visibility) : (current.rows[0].visibility || 'draft');
    const result = await pool.query(
      'UPDATE wiki_pages SET title = $1, content = $2, updated_by = $3, parent_id = $4, content_type = $5, visibility = $6 WHERE id = $7 RETURNING *',
      [title.trim(), content.trim(), req.user.id, parentId, contentType, visibility, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    await auditLog(req.user.id, req.user.username, 'update_page', 'page', id, { title: title.trim() }, getIp(req));
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A page with this title already exists.' });
    console.error('Error updating page:', err.message);
    res.status(500).json({ error: 'Failed to update page' });
  }
});

// Versionen
router.get('/pages/:id/versions', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    if (!(await canAccessPage(id, req.user))) return res.status(404).json({ error: 'Page not found' });
    const result = await pool.query(
      `SELECT v.*, u.username AS created_by_name FROM wiki_page_versions v LEFT JOIN users u ON v.created_by = u.id WHERE v.page_id = $1 ORDER BY v.version_number DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing versions:', err.message);
    res.status(500).json({ error: 'Failed to retrieve versions' });
  }
});

// Version wiederherstellen
router.post('/pages/:id/restore', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  const { versionId } = req.body;
  if (isNaN(id) || !versionId) return res.status(400).json({ error: 'Invalid page or version ID' });
  try {
    const version = await pool.query('SELECT * FROM wiki_page_versions WHERE id = $1 AND page_id = $2', [versionId, id]);
    if (version.rows.length === 0) return res.status(404).json({ error: 'Version not found' });
    const current = await pool.query('SELECT * FROM wiki_pages WHERE id = $1', [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    const nextVersion = await pool.query('SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM wiki_page_versions WHERE page_id = $1', [id]);
    await pool.query(
      'INSERT INTO wiki_page_versions (page_id, title, content, created_by, version_number) VALUES ($1, $2, $3, $4, $5)',
      [id, current.rows[0].title, current.rows[0].content, req.user.id, parseInt(nextVersion.rows[0].next)]
    );
    const restored = await pool.query(
      'UPDATE wiki_pages SET title = $1, content = $2, updated_by = $3 WHERE id = $4 RETURNING *',
      [version.rows[0].title, version.rows[0].content, req.user.id, id]
    );
    await auditLog(req.user.id, req.user.username, 'restore_page', 'page', id, { versionId }, getIp(req));
    res.json(restored.rows[0]);
  } catch (err) {
    console.error('Error restoring page:', err.message);
    res.status(500).json({ error: 'Failed to restore page' });
  }
});

// Sichtbarkeit ändern
router.put('/pages/:id/visibility', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  const { visibility } = req.body;
  if (!['draft', 'published'].includes(visibility)) return res.status(400).json({ error: 'Visibility must be draft or published' });
  try {
    const page = await pool.query('SELECT * FROM wiki_pages WHERE id = $1', [id]);
    if (page.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    if (req.user.role !== 'admin' && page.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the page owner or an admin can change visibility' });
    }
    if (visibility === 'published' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Publishing requires admin approval. Please request approval instead.' });
    }
    const newApprovalStatus = visibility === 'published' ? 'approved' : 'none';
    const result = await pool.query('UPDATE wiki_pages SET visibility = $1, approval_status = $2 WHERE id = $3 RETURNING *', [visibility, newApprovalStatus, id]);
    if (visibility === 'published') {
      await pool.query("UPDATE approval_requests SET status = 'approved', reviewer_id = $1, resolved_at = CURRENT_TIMESTAMP WHERE page_id = $2 AND status = 'pending'", [req.user.id, id]);
    }
    await auditLog(req.user.id, req.user.username, visibility === 'published' ? 'publish_page' : 'unpublish_page', 'page', id, { title: page.rows[0].title }, getIp(req));
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error changing visibility:', err.message);
    res.status(500).json({ error: 'Failed to change page visibility' });
  }
});

module.exports = router;

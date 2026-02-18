/**
 * Nexora – Ordner (Folders) Routen
 *
 * Ordner organisieren Seiten innerhalb eines Team-Bereichs.
 * Maximal 2 Ebenen tief (Ordner → Unterordner).
 * Berechtigungen werden vom übergeordneten Bereich geerbt.
 *
 * Endpunkte:
 *  GET    /spaces/:spaceId/folders    → Ordner eines Bereichs auflisten
 *  POST   /spaces/:spaceId/folders    → Ordner erstellen
 *  PUT    /folders/:id                → Ordner umbenennen/verschieben
 *  DELETE /folders/:id                → Ordner löschen (nur wenn leer)
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { getPool } = require('../database');
const { auditLog } = require('../helpers/audit');
const { getIp } = require('../helpers/utils');
const logger = require('../logger');: Slug aus Name generieren.
 */
function slugify(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9äöüß-]/g, '').replace(/-+/g, '-');
}

/**
 * Hilfsfunktion: Prüfe Schreibzugriff auf Bereich.
 * Rollen mit Schreibzugriff: owner, editor (oder globaler Admin)
 */
async function canWriteInSpace(userId, spaceId, globalRole) {
  if (globalRole === 'admin') return true;
  const pool = getPool();
  const r = await pool.query(
    `SELECT role FROM space_memberships WHERE space_id = $1 AND user_id = $2`,
    [spaceId, userId]
  );
  if (r.rows.length === 0) return false;
  return ['owner', 'editor'].includes(r.rows[0].role);
}

// ===== GET /spaces/:spaceId/folders – Ordner auflisten =====
router.get('/spaces/:spaceId/folders', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    const { spaceId } = req.params;

    const result = await pool.query(
      `SELECT f.*,
              u.display_name AS created_by_name,
              (SELECT COUNT(*) FROM wiki_pages wp WHERE wp.folder_id = f.id AND wp.deleted_at IS NULL) AS page_count
       FROM folders f
       LEFT JOIN users u ON f.created_by = u.id
       WHERE f.space_id = $1
       ORDER BY f.depth, f.sort_order, f.name`,
      [spaceId]
    );

    // Hierarchisch aufbauen: Eltern → Kinder
    const folders = result.rows;
    const rootFolders = folders.filter(f => !f.parent_folder_id);
    const children = folders.filter(f => f.parent_folder_id);

    rootFolders.forEach(folder => {
      folder.children = children.filter(c => c.parent_folder_id === folder.id);
    });

    res.json(rootFolders);
  } catch (err) {
    logger.error({ err }, 'Fehler beim Laden der Ordner');
    res.status(500).json({ error: 'Failed to load folders' });
  }
});

// ===== POST /spaces/:spaceId/folders – Ordner erstellen =====
router.post('/spaces/:spaceId/folders', authenticate, writeLimiter, async (req, res) => {
  try {
    const { spaceId } = req.params;
    if (!(await canWriteInSpace(req.user.id, spaceId, req.user.global_role))) {
      return res.status(403).json({ error: 'No write access to this space' });
    }

    const { name, parentFolderId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

    let depth = 0;
    const pool = getPool();

    // Tiefe berechnen und Eltern-Ordner validieren
    if (parentFolderId) {
      const parent = await pool.query(
        'SELECT depth, space_id FROM folders WHERE id = $1',
        [parentFolderId]
      );
      if (parent.rows.length === 0) return res.status(404).json({ error: 'Parent folder not found' });
      if (parent.rows[0].space_id != spaceId) {
        return res.status(400).json({ error: 'Parent folder belongs to a different space' });
      }
      depth = parent.rows[0].depth + 1;
      if (depth > 2) return res.status(400).json({ error: 'Maximum folder depth of 2 exceeded' });
    }

    const slug = slugify(name);

    // Höchste Sortierreihenfolge ermitteln
    const maxSort = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
       FROM folders
       WHERE space_id = $1 AND ${parentFolderId ? 'parent_folder_id = $2' : 'parent_folder_id IS NULL'}`,
      parentFolderId ? [spaceId, parentFolderId] : [spaceId]
    );

    const result = await pool.query(
      `INSERT INTO folders (space_id, name, slug, parent_folder_id, depth, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [spaceId, name.trim(), slug, parentFolderId || null, depth, maxSort.rows[0].next_order, req.user.id]
    );

    await auditLog(req.user.id, req.user.username, 'create_folder', 'folder', result.rows[0].id, null, getIp(req));
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A folder with this name already exists here' });
    logger.error({ err }, 'Fehler beim Erstellen des Ordners');
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// ===== PUT /folders/:id – Ordner bearbeiten =====
router.put('/folders/:id', authenticate, writeLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid folder ID' });

    const pool = getPool();
    const folder = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    if (folder.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });

    const existing = folder.rows[0];
    if (!(await canWriteInSpace(req.user.id, existing.space_id, req.user.global_role))) {
      return res.status(403).json({ error: 'No write access to this space' });
    }

    const { name, sortOrder } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

    const result = await pool.query(
      `UPDATE folders SET name = $1, slug = $2, sort_order = COALESCE($3, sort_order) WHERE id = $4 RETURNING *`,
      [name.trim(), slugify(name), sortOrder, id]
    );

    await auditLog(req.user.id, req.user.username, 'update_folder', 'folder', id, null, getIp(req));
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Fehler beim Bearbeiten des Ordners');
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// ===== DELETE /folders/:id – Ordner löschen =====
router.delete('/folders/:id', authenticate, writeLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid folder ID' });

    const pool = getPool();
    const folder = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    if (folder.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });

    const existing = folder.rows[0];
    if (!(await canWriteInSpace(req.user.id, existing.space_id, req.user.global_role))) {
      return res.status(403).json({ error: 'No write access to this space' });
    }

    // Prüfe ob Ordner Seiten oder Unterordner enthält
    const pages = await pool.query('SELECT COUNT(*) FROM wiki_pages WHERE folder_id = $1 AND deleted_at IS NULL', [id]);
    if (parseInt(pages.rows[0].count) > 0) {
      return res.status(409).json({ error: 'Folder is not empty. Move or delete all pages first.' });
    }

    const children = await pool.query('SELECT COUNT(*) FROM folders WHERE parent_folder_id = $1', [id]);
    if (parseInt(children.rows[0].count) > 0) {
      return res.status(409).json({ error: 'Folder has subfolders. Delete subfolders first.' });
    }

    await pool.query('DELETE FROM folders WHERE id = $1', [id]);
    await auditLog(req.user.id, req.user.username, 'delete_folder', 'folder', id, null, getIp(req));
    res.json({ message: 'Folder deleted' });
  } catch (err) {
    logger.error({ err }, 'Fehler beim Löschen des Ordners');
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

module.exports = router;

/**
 * Nexora – Team-Bereiche (Spaces) Routen
 *
 * Team-Bereiche sind die zentrale Organisationseinheit unter einer Organisation.
 * Berechtigungen werden auf dieser Ebene vergeben (nicht auf Ordnerebene).
 *
 * Bereichs-Rollen: owner | editor | reviewer | viewer
 *
 * Endpunkte:
 *  GET    /spaces                    → Alle Bereiche der Standard-Organisation
 *  GET    /spaces/:id                → Einzelner Bereich mit Ordnern & Seiten
 *  POST   /spaces                    → Bereich erstellen (Admin/berechtigte Benutzer)
 *  PUT    /spaces/:id                → Bereich bearbeiten (Owner/Admin)
 *  DELETE /spaces/:id                → Bereich archivieren (Owner/Admin)
 *  GET    /spaces/:id/members        → Mitglieder auflisten
 *  POST   /spaces/:id/members        → Mitglied hinzufügen
 *  PUT    /spaces/:id/members/:userId → Rolle ändern
 *  DELETE /spaces/:id/members/:userId → Mitglied entfernen
 */

const { Router } = require('express');
const { authenticate, requirePermission } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { getPool } = require('../database');
const { auditLog } = require('../helpers/audit');
const { getIp } = require('../helpers/utils');
const logger = require('../logger');

const router = Router();

/**
 * Hilfsfunktion: Prüft ob ein Benutzer Owner oder Admin eines Bereichs ist.
 * @param {number} userId - Benutzer-ID
 * @param {number} spaceId - Bereichs-ID
 * @param {string} globalRole - Globale Rolle des Benutzers
 * @returns {Promise<boolean>}
 */
async function isSpaceOwnerOrAdmin(userId, spaceId, globalRole) {
  if (globalRole === 'admin') return true;
  const pool = getPool();
  const r = await pool.query(
    `SELECT role FROM space_memberships WHERE space_id = $1 AND user_id = $2`,
    [spaceId, userId]
  );
  return r.rows.length > 0 && r.rows[0].role === 'owner';
}

/**
 * Hilfsfunktion: Gibt die Bereichs-Rolle eines Benutzers zurück.
 * @returns {Promise<string|null>} Rolle oder null wenn kein Mitglied
 */
async function getSpaceRole(userId, spaceId) {
  const pool = getPool();
  const r = await pool.query(
    `SELECT role FROM space_memberships WHERE space_id = $1 AND user_id = $2`,
    [spaceId, userId]
  );
  return r.rows[0]?.role || null;
}

// ===== GET /spaces – Alle Team-Bereiche =====
router.get('/spaces', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    // Standard-Organisation laden (erste Organisation)
    const orgResult = await pool.query('SELECT id FROM organizations ORDER BY id LIMIT 1');
    if (orgResult.rows.length === 0) return res.json([]);
    const orgId = orgResult.rows[0].id;

    const result = await pool.query(
      `SELECT ts.*,
              u.display_name AS created_by_name,
              (SELECT COUNT(*) FROM wiki_pages wp WHERE wp.space_id = ts.id AND wp.deleted_at IS NULL AND wp.workflow_status = 'published') AS page_count,
              (SELECT COUNT(*) FROM space_memberships sm2 WHERE sm2.space_id = ts.id) AS member_count,
              sm.role AS my_role
       FROM team_spaces ts
       LEFT JOIN users u ON ts.created_by = u.id
       LEFT JOIN space_memberships sm ON sm.space_id = ts.id AND sm.user_id = $1
       WHERE ts.organization_id = $2 AND NOT ts.is_archived
       ORDER BY ts.name`,
      [req.user.id, orgId]
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Fehler beim Laden der Bereiche');
    res.status(500).json({ error: 'Failed to load spaces' });
  }
});

// ===== GET /spaces/:id – Einzelner Bereich =====
router.get('/spaces/:id', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    const spaceId = parseInt(req.params.id);
    if (isNaN(spaceId)) return res.status(400).json({ error: 'Invalid space ID' });

    // Bereich laden
    const space = await pool.query(
      `SELECT ts.*, u.display_name AS created_by_name,
              sm.role AS my_role
       FROM team_spaces ts
       LEFT JOIN users u ON ts.created_by = u.id
       LEFT JOIN space_memberships sm ON sm.space_id = ts.id AND sm.user_id = $1
       WHERE ts.id = $2`,
      [req.user.id, spaceId]
    );
    if (space.rows.length === 0) return res.status(404).json({ error: 'Space not found' });

    // Zugriffsprüfung: Admin, Auditor oder Mitglied
    const spaceData = space.rows[0];
    const isGlobalPrivileged = req.user.global_role === 'admin' || req.user.global_role === 'auditor';
    if (!isGlobalPrivileged && !spaceData.my_role) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this space.' });
    }

    // Ordner laden (hierarchisch)
    const folders = await pool.query(
      `SELECT f.*, u.display_name AS created_by_name
       FROM folders f
       LEFT JOIN users u ON f.created_by = u.id
       WHERE f.space_id = $1
       ORDER BY f.depth, f.sort_order, f.name`,
      [spaceId]
    );

    // Veröffentlichte Seiten im Bereich laden
    const pages = await pool.query(
      `SELECT wp.id, wp.title, wp.content_type, wp.workflow_status, wp.folder_id,
              wp.created_at, wp.updated_at,
              u1.display_name AS created_by_name,
              u2.display_name AS updated_by_name
       FROM wiki_pages wp
       LEFT JOIN users u1 ON wp.created_by = u1.id
       LEFT JOIN users u2 ON wp.updated_by = u2.id
       WHERE wp.space_id = $1 AND wp.deleted_at IS NULL
       ORDER BY wp.title`,
      [spaceId]
    );

    res.json({
      ...spaceData,
      folders: folders.rows,
      pages: pages.rows,
    });
  } catch (err) {
    logger.error({ err }, 'Fehler beim Laden des Bereichs');
    res.status(500).json({ error: 'Failed to load space' });
  }
});

// ===== POST /spaces – Bereich erstellen =====
router.post('/spaces', authenticate, writeLimiter, async (req, res) => {
  try {
    const { name, description, icon, organizationId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const pool = getPool();

    // Standard-Organisation verwenden, wenn keine angegeben
    let orgId = organizationId;
    if (!orgId) {
      const org = await pool.query('SELECT id FROM organizations ORDER BY id LIMIT 1');
      if (org.rows.length === 0) return res.status(400).json({ error: 'No organization exists' });
      orgId = org.rows[0].id;
    }

    const client = await pool.connect();
    let space;
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO team_spaces (organization_id, name, slug, description, icon, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [orgId, name.trim(), slug, description?.trim() || '', icon || 'folder', req.user.id]
      );
      space = result.rows[0];

      // Ersteller wird automatisch Owner
      await client.query(
        `INSERT INTO space_memberships (space_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [space.id, req.user.id]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await auditLog(req.user.id, req.user.username, 'create_space', 'team_space', space.id, null, getIp(req));
    res.status(201).json({ ...space, my_role: 'owner' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A space with this name already exists in this organization' });
    logger.error({ err }, 'Fehler beim Erstellen des Bereichs');
    res.status(500).json({ error: 'Failed to create space' });
  }
});

// ===== PUT /spaces/:id – Bereich bearbeiten =====
router.put('/spaces/:id', authenticate, writeLimiter, async (req, res) => {
  try {
    const spaceId = parseInt(req.params.id);
    if (isNaN(spaceId)) return res.status(400).json({ error: 'Invalid space ID' });
    if (!(await isSpaceOwnerOrAdmin(req.user.id, spaceId, req.user.global_role))) {
      return res.status(403).json({ error: 'Only space owners or admins can edit spaces' });
    }

    const { name, description, icon } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

    const pool = getPool();
    const result = await pool.query(
      `UPDATE team_spaces SET name = $1, description = $2, icon = $3 WHERE id = $4 RETURNING *`,
      [name.trim(), description?.trim() || '', icon || 'folder', spaceId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Space not found' });

    await auditLog(req.user.id, req.user.username, 'update_space', 'team_space', parseInt(spaceId), null, getIp(req));
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Fehler beim Bearbeiten des Bereichs');
    res.status(500).json({ error: 'Failed to update space' });
  }
});

// ===== DELETE /spaces/:id – Bereich archivieren =====
router.delete('/spaces/:id', authenticate, writeLimiter, async (req, res) => {
  try {
    const spaceId = parseInt(req.params.id);
    if (isNaN(spaceId)) return res.status(400).json({ error: 'Invalid space ID' });
    if (!(await isSpaceOwnerOrAdmin(req.user.id, spaceId, req.user.global_role))) {
      return res.status(403).json({ error: 'Only space owners or admins can archive spaces' });
    }

    const pool = getPool();
    await pool.query('UPDATE team_spaces SET is_archived = true WHERE id = $1', [spaceId]);
    await auditLog(req.user.id, req.user.username, 'archive_space', 'team_space', parseInt(spaceId), null, getIp(req));
    res.json({ message: 'Space archived' });
  } catch (err) {
    logger.error({ err }, 'Fehler beim Archivieren des Bereichs');
    res.status(500).json({ error: 'Failed to archive space' });
  }
});

// ===== GET /spaces/:id/members – Mitglieder auflisten =====
router.get('/spaces/:id/members', authenticate, async (req, res) => {
  try {
    const spaceId = parseInt(req.params.id);
    if (isNaN(spaceId)) return res.status(400).json({ error: 'Invalid space ID' });

    const pool = getPool();
    const result = await pool.query(
      `SELECT sm.*, u.username, u.display_name, u.email, u.global_role
       FROM space_memberships sm
       JOIN users u ON sm.user_id = u.id
       WHERE sm.space_id = $1
       ORDER BY
         CASE sm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 WHEN 'reviewer' THEN 2 ELSE 3 END,
         u.display_name`,
      [spaceId]
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Fehler beim Laden der Mitglieder');
    res.status(500).json({ error: 'Failed to load members' });
  }
});

// ===== POST /spaces/:id/members – Mitglied hinzufügen =====
router.post('/spaces/:id/members', authenticate, writeLimiter, async (req, res) => {
  try {
    const spaceId = parseInt(req.params.id);
    if (isNaN(spaceId)) return res.status(400).json({ error: 'Invalid space ID' });
    if (!(await isSpaceOwnerOrAdmin(req.user.id, spaceId, req.user.global_role))) {
      return res.status(403).json({ error: 'Only space owners or admins can manage members' });
    }

    const { userId, role } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!['owner', 'editor', 'reviewer', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be: owner, editor, reviewer, viewer' });
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO space_memberships (space_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (space_id, user_id) DO UPDATE SET role = $3`,
      [spaceId, userId, role]
    );

    await auditLog(req.user.id, req.user.username, 'add_space_member', 'team_space', parseInt(spaceId),
      { targetUserId: userId, role }, getIp(req));

    // Aktualisierte Mitgliederliste zurückgeben
    const result = await pool.query(
      `SELECT sm.*, u.username, u.display_name, u.email, u.global_role
       FROM space_memberships sm JOIN users u ON sm.user_id = u.id
       WHERE sm.space_id = $1 ORDER BY u.display_name`,
      [spaceId]
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Fehler beim Hinzufügen des Mitglieds');
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// ===== PUT /spaces/:id/members/:userId – Rolle ändern =====
router.put('/spaces/:id/members/:userId', authenticate, writeLimiter, async (req, res) => {
  try {
    const spaceId = parseInt(req.params.id);
    if (isNaN(spaceId)) return res.status(400).json({ error: 'Invalid space ID' });
    if (!(await isSpaceOwnerOrAdmin(req.user.id, spaceId, req.user.global_role))) {
      return res.status(403).json({ error: 'Only space owners or admins can change roles' });
    }

    const { role } = req.body;
    if (!['owner', 'editor', 'reviewer', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const pool = getPool();
    const result = await pool.query(
      `UPDATE space_memberships SET role = $1 WHERE space_id = $2 AND user_id = $3 RETURNING *`,
      [role, spaceId, req.params.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Membership not found' });

    await auditLog(req.user.id, req.user.username, 'change_space_role', 'team_space', parseInt(spaceId),
      { targetUserId: parseInt(req.params.userId), newRole: role }, getIp(req));
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Fehler beim Ändern der Rolle');
    res.status(500).json({ error: 'Failed to change role' });
  }
});

// ===== DELETE /spaces/:id/members/:userId – Mitglied entfernen =====
router.delete('/spaces/:id/members/:userId', authenticate, writeLimiter, async (req, res) => {
  try {
    const spaceId = parseInt(req.params.id);
    if (isNaN(spaceId)) return res.status(400).json({ error: 'Invalid space ID' });
    if (!(await isSpaceOwnerOrAdmin(req.user.id, spaceId, req.user.global_role))) {
      return res.status(403).json({ error: 'Only space owners or admins can remove members' });
    }

    const pool = getPool();
    await pool.query(
      'DELETE FROM space_memberships WHERE space_id = $1 AND user_id = $2',
      [spaceId, req.params.userId]
    );

    await auditLog(req.user.id, req.user.username, 'remove_space_member', 'team_space', parseInt(spaceId),
      { targetUserId: parseInt(req.params.userId) }, getIp(req));
    res.json({ message: 'Member removed' });
  } catch (err) {
    logger.error({ err }, 'Fehler beim Entfernen des Mitglieds');
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;

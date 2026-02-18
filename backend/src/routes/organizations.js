/**
 * Nexora – Organisationen-Routen
 *
 * Verwaltet die oberste Hierarchieebene der Wissensmanagement-Plattform.
 * Jede Nexora-Instanz hat mindestens eine Organisation.
 *
 * Endpunkte:
 *  GET    /organizations       → Alle Organisationen auflisten
 *  GET    /organizations/:id   → Einzelne Organisation mit Team-Bereichen
 *  POST   /organizations       → Neue Organisation erstellen (nur Admin)
 *  PUT    /organizations/:id   → Organisation bearbeiten (nur Admin)
 */

const { Router } = require('express');
const { authenticate, requirePermission } = require('../middleware/auth');
const { getPool } = require('../database');
const { auditLog } = require('../helpers/audit');
const { writeLimiter } = require('../middleware/security');
const { getIp } = require('../helpers/utils');
const logger = require('../logger');

const router = Router();

// ===== GET /organizations – Alle Organisationen =====
router.get('/organizations', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT o.*, u.display_name AS created_by_name,
              (SELECT COUNT(*) FROM team_spaces ts WHERE ts.organization_id = o.id AND NOT ts.is_archived) AS space_count
       FROM organizations o
       LEFT JOIN users u ON o.created_by = u.id
       ORDER BY o.name`
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Fehler beim Laden der Organisationen');
    res.status(500).json({ error: 'Failed to load organizations' });
  }
});

// ===== GET /organizations/:id – Einzelne Organisation =====
router.get('/organizations/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid organization ID' });

    const pool = getPool();
    const org = await pool.query('SELECT * FROM organizations WHERE id = $1', [id]);
    if (org.rows.length === 0) return res.status(404).json({ error: 'Organization not found' });

    // Team-Bereiche dieser Organisation laden
    const spaces = await pool.query(
      `SELECT ts.*, u.display_name AS created_by_name,
              (SELECT COUNT(*) FROM wiki_pages wp WHERE wp.space_id = ts.id AND wp.deleted_at IS NULL) AS page_count,
              sm.role AS current_user_role
       FROM team_spaces ts
       LEFT JOIN users u ON ts.created_by = u.id
       LEFT JOIN space_memberships sm ON sm.space_id = ts.id AND sm.user_id = $1
       WHERE ts.organization_id = $2 AND NOT ts.is_archived
       ORDER BY ts.name`,
      [req.user.id, id]
    );

    res.json({ ...org.rows[0], spaces: spaces.rows });
  } catch (err) {
    logger.error({ err }, 'Fehler beim Laden der Organisation');
    res.status(500).json({ error: 'Failed to load organization' });
  }
});

// ===== POST /organizations – Organisation erstellen (nur Admin) =====
router.post('/organizations', authenticate, requirePermission('spaces.manage'), writeLimiter, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const pool = getPool();

    const result = await pool.query(
      `INSERT INTO organizations (name, slug, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), slug, description?.trim() || '', req.user.id]
    );

    await auditLog(req.user.id, req.user.username, 'create_organization', 'organization', result.rows[0].id, null, getIp(req));
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Organization with this name already exists' });
    logger.error({ err }, 'Fehler beim Erstellen der Organisation');
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// ===== PUT /organizations/:id – Organisation bearbeiten (nur Admin) =====
router.put('/organizations/:id', authenticate, requirePermission('spaces.manage'), writeLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid organization ID' });

    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

    const pool = getPool();
    const result = await pool.query(
      `UPDATE organizations SET name = $1, description = $2 WHERE id = $3 RETURNING *`,
      [name.trim(), description?.trim() || '', id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Organization not found' });

    await auditLog(req.user.id, req.user.username, 'update_organization', 'organization', id, null, getIp(req));
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Fehler beim Bearbeiten der Organisation');
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

module.exports = router;

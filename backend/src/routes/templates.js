/**
 * Nexora – Template-Routen
 *
 * CRUD-Operationen für Seitenvorlagen.
 *
 * Endpunkte:
 *   GET    /templates           - Alle Vorlagen abrufen
 *   GET    /templates/:id       - Einzelne Vorlage abrufen
 *   POST   /templates           - Neue Vorlage erstellen (Admin)
 *   PUT    /templates/:id       - Vorlage bearbeiten (Admin)
 *   DELETE /templates/:id       - Vorlage löschen (Admin)
 */

const express = require('express');
const router = express.Router();
const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const logger = require('../logger');

// ============================================================================
// GET /templates – Alle Vorlagen abrufen
// ============================================================================
router.get('/templates', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const result = await pool.query(`
      SELECT id, name, description, content, content_type, icon, category, is_default, created_at
      FROM page_templates
      ORDER BY is_default DESC, category, name
    `);
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Error getting templates');
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

// ============================================================================
// GET /templates/:id – Einzelne Vorlage abrufen
// ============================================================================
router.get('/templates/:id', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid template ID' });

  try {
    const result = await pool.query('SELECT * FROM page_templates WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Error getting template');
    res.status(500).json({ error: 'Failed to load template' });
  }
});

// ============================================================================
// POST /templates – Neue Vorlage erstellen (nur Admin)
// ============================================================================
router.post('/templates', authenticate, requirePermission('templates.manage'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const { name, description, content, contentType, icon, category } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required' });

  try {
    const result = await pool.query(`
      INSERT INTO page_templates (name, description, content, content_type, icon, category, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name.trim(), description || '', content || '', contentType || 'html', icon || '📄', category || 'general', req.user.id]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Error creating template');
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// ============================================================================
// PUT /templates/:id – Vorlage bearbeiten (nur Admin)
// ============================================================================
router.put('/templates/:id', authenticate, requirePermission('templates.manage'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid template ID' });

  const { name, description, content, contentType, icon, category } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM page_templates WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Template not found' });

    const result = await pool.query(`
      UPDATE page_templates SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        content = COALESCE($3, content),
        content_type = COALESCE($4, content_type),
        icon = COALESCE($5, icon),
        category = COALESCE($6, category),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [name, description, content, contentType, icon, category, id]);

    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Error updating template');
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// ============================================================================
// DELETE /templates/:id – Vorlage löschen (nur Admin)
// ============================================================================
router.delete('/templates/:id', authenticate, requirePermission('templates.manage'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid template ID' });

  try {
    const result = await pool.query('DELETE FROM page_templates WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    res.json({ message: 'Template deleted' });
  } catch (err) {
    logger.error({ err }, 'Error deleting template');
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

module.exports = router;

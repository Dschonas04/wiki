/**
 * Benutzerverwaltung (Admin)
 */

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const { BCRYPT_ROUNDS } = require('../config');
const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { auditLog } = require('../helpers/audit');
const { getIp } = require('../helpers/utils');
const { validatePassword } = require('../helpers/validators');

// Alle Benutzer (Admin)
router.get('/users', authenticate, requirePermission('users.read'), async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, username, display_name, email, role, auth_source, is_active, last_login, created_at
       FROM users ORDER BY created_at ASC`
    );
    res.json(result.rows.map(u => ({
      id: u.id, username: u.username, displayName: u.display_name, email: u.email,
      role: u.role, authSource: u.auth_source, isActive: u.is_active,
      lastLogin: u.last_login, createdAt: u.created_at,
    })));
  } catch (err) {
    console.error('Error listing users:', err.message);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Benutzer erstellen
router.post('/users', authenticate, requirePermission('users.manage'), writeLimiter, async (req, res) => {
  const { username, password, displayName, email, role } = req.body;
  const errors = [];
  if (!username || !username.trim()) errors.push('Username is required.');
  errors.push(...validatePassword(password));
  if (!['admin', 'editor', 'viewer'].includes(role)) errors.push('Invalid role.');
  if (errors.length > 0) return res.status(400).json({ error: errors.join(' '), errors });
  try {
    const pool = getPool();
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, display_name, email, role, auth_source)
       VALUES ($1, $2, $3, $4, $5, 'local') RETURNING id, username, display_name, email, role, auth_source, created_at`,
      [username.trim().toLowerCase(), hash, displayName || username, email || null, role]
    );
    const user = result.rows[0];
    await auditLog(req.user.id, req.user.username, 'create_user', 'user', user.id, { target: user.username, role }, getIp(req));
    res.status(201).json({ id: user.id, username: user.username, displayName: user.display_name, email: user.email, role: user.role, authSource: user.auth_source });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists.' });
    console.error('Error creating user:', err.message);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Benutzer aktualisieren
router.put('/users/:id', authenticate, requirePermission('users.manage'), writeLimiter, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot modify your own account' });

  const { role, isActive, displayName, email } = req.body;
  const updates = []; const params = []; let idx = 1;
  if (role && ['admin', 'editor', 'viewer'].includes(role)) { updates.push(`role = $${idx++}`); params.push(role); }
  if (typeof isActive === 'boolean') { updates.push(`is_active = $${idx++}`); params.push(isActive); }
  if (displayName !== undefined) { updates.push(`display_name = $${idx++}`); params.push(displayName); }
  if (email !== undefined) { updates.push(`email = $${idx++}`); params.push(email || null); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(id);
  try {
    const pool = getPool();
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, display_name, email, role, auth_source, is_active`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];
    await auditLog(req.user.id, req.user.username, 'update_user', 'user', user.id, { changes: req.body }, getIp(req));
    res.json({ id: user.id, username: user.username, displayName: user.display_name, email: user.email, role: user.role, authSource: user.auth_source, isActive: user.is_active });
  } catch (err) {
    console.error('Error updating user:', err.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Benutzer löschen
router.delete('/users/:id', authenticate, requirePermission('users.manage'), writeLimiter, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  try {
    const pool = getPool();
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING username', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    await auditLog(req.user.id, req.user.username, 'delete_user', 'user', id, { target: result.rows[0].username }, getIp(req));
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Error deleting user:', err.message);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Benutzerliste (leichtgewichtig, für Share-Dialoge)
router.get('/users/list', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, username, display_name FROM users WHERE is_active = true ORDER BY display_name ASC'
    );
    res.json(result.rows.map(u => ({ id: u.id, username: u.username, displayName: u.display_name })));
  } catch (err) {
    console.error('Error listing users:', err.message);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

module.exports = router;

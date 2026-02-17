/**
 * Auth-Routen (Login, Logout, Me, Passwort ändern)
 */

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const { LDAP_ENABLED, BCRYPT_ROUNDS } = require('../config');
const { getPool } = require('../database');
const { authenticate } = require('../middleware/auth');
const { authLimiter, writeLimiter } = require('../middleware/security');
const { signToken, setTokenCookie } = require('../auth/jwt');
const { ldapAuthenticate } = require('../auth/ldap');
const { auditLog } = require('../helpers/audit');
const { getIp, formatUser } = require('../helpers/utils');
const { validatePassword } = require('../helpers/validators');

// Login
router.post('/auth/login', authLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  const cleanUser = username.trim().toLowerCase();

  try {
    if (LDAP_ENABLED) {
      try {
        const ldapUser = await ldapAuthenticate(cleanUser, password);
        console.log(`LDAP auth OK: ${cleanUser} (${ldapUser.role})`);
        const upsert = await pool.query(`
          INSERT INTO users (username, display_name, email, role, auth_source, last_login, is_active)
          VALUES ($1, $2, $3, $4, 'ldap', CURRENT_TIMESTAMP, true)
          ON CONFLICT (username) DO UPDATE SET
            display_name = EXCLUDED.display_name, email = EXCLUDED.email,
            role = EXCLUDED.role, auth_source = 'ldap', last_login = CURRENT_TIMESTAMP
          RETURNING *`,
          [cleanUser, ldapUser.displayName, ldapUser.email, ldapUser.role]);
        const user = upsert.rows[0];
        user.must_change_password = false;
        const token = signToken(user);
        setTokenCookie(res, token);
        await auditLog(user.id, user.username, 'login', 'auth', null, { source: 'ldap' }, getIp(req));
        return res.json({ user: formatUser(user) });
      } catch (ldapErr) {
        console.log(`LDAP failed for ${cleanUser}: ${ldapErr.message} → trying local`);
      }
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND auth_source = $2 AND is_active = true',
      [cleanUser, 'local']
    );
    if (result.rows.length === 0) {
      await auditLog(null, cleanUser, 'login_failed', 'auth', null, { reason: 'not found' }, getIp(req));
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await auditLog(user.id, user.username, 'login_failed', 'auth', null, { reason: 'wrong password' }, getIp(req));
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    const token = signToken(user);
    setTokenCookie(res, token);
    await auditLog(user.id, user.username, 'login', 'auth', null, { source: 'local' }, getIp(req));
    res.json({ user: formatUser(user), mustChangePassword: !!user.must_change_password });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
router.post('/auth/logout', authenticate, async (req, res) => {
  await auditLog(req.user.id, req.user.username, 'logout', 'auth', null, null, getIp(req));
  res.clearCookie('wiki_token');
  res.json({ message: 'Logged out' });
});

// Me
router.get('/auth/me', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, username, display_name, email, role, auth_source, last_login, created_at, must_change_password FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      res.clearCookie('wiki_token');
      return res.status(401).json({ error: 'User not found' });
    }
    res.json(formatUser(result.rows[0]));
  } catch (err) {
    console.error('Get me error:', err.message);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Passwort ändern
router.post('/auth/change-password', authenticate, writeLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required.' });

  const pwErrors = validatePassword(newPassword);
  if (pwErrors.length > 0) return res.status(400).json({ error: pwErrors.join(' '), errors: pwErrors });

  try {
    const pool = getPool();
    const result = await pool.query('SELECT * FROM users WHERE id = $1 AND auth_source = $2', [req.user.id, 'local']);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Password change is only available for local accounts.' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      await auditLog(user.id, user.username, 'password_change_failed', 'auth', null, { reason: 'wrong current password' }, getIp(req));
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [hash, user.id]);
    await auditLog(user.id, user.username, 'password_changed', 'auth', null, null, getIp(req));

    const updated = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);
    const token = signToken(updated.rows[0]);
    setTokenCookie(res, token);

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Password change error:', err.message);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

module.exports = router;

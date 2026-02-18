/**
 * Benutzerverwaltungs-Routen (Administration)
 *
 * Diese Datei enthält alle Routen für die Verwaltung von Benutzerkonten im Nexora-System.
 * Die meisten Endpunkte erfordern Admin-Berechtigungen (users.manage).
 * Administratoren können Benutzer erstellen, bearbeiten, löschen und auflisten.
 *
 * Endpunkte:
 *   GET    /users      - Alle Benutzer auflisten (Admin, vollständige Daten)
 *   POST   /users      - Neuen Benutzer erstellen (Admin)
 *   PUT    /users/:id  - Benutzer aktualisieren (Admin, nicht sich selbst)
 *   DELETE /users/:id  - Benutzer löschen (Admin, nicht sich selbst)
 *   GET    /users/list - Leichtgewichtige Benutzerliste (für Dialoge wie Teilen)
 *
 * Sicherheit:
 *   - Berechtigungsprüfung über requirePermission-Middleware
 *   - Passwort-Hashing mit bcrypt bei der Erstellung
 *   - Schutz gegen Selbst-Modifikation und Selbst-Löschung
 *   - Audit-Logging für alle Verwaltungsaktionen
 */

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

// Konfiguration und Abhängigkeiten importieren
const { BCRYPT_ROUNDS } = require('../config');
const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { auditLog } = require('../helpers/audit');
const { getIp } = require('../helpers/utils');
const { validatePassword } = require('../helpers/validators');
const logger = require('../logger');
// GET /users - Alle Benutzer auflisten (Admin-Ansicht)
// ============================================================================
// Gibt eine vollständige Liste aller Benutzer zurück, sortiert nach Erstellungsdatum.
// Enthält alle relevanten Felder wie Rolle, Authentifizierungsquelle und Aktivitätsstatus.
// Erfordert die Berechtigung 'users.read' (typischerweise nur für Administratoren).
router.get('/users', authenticate, requirePermission('users.read'), async (req, res) => {
  try {
    const pool = getPool();

    // Alle Benutzer aus der Datenbank abrufen, sortiert nach Erstellungsdatum (älteste zuerst)
    const result = await pool.query(
      `SELECT id, username, display_name, email, global_role, auth_source, is_active, last_login, created_at
       FROM users ORDER BY created_at ASC`
    );

    // Datenbank-Feldnamen in camelCase umwandeln für das Frontend
    res.json(result.rows.map(u => ({
      id: u.id, username: u.username, displayName: u.display_name, email: u.email,
      globalRole: u.global_role, authSource: u.auth_source, isActive: u.is_active,
      lastLogin: u.last_login, createdAt: u.created_at,
    })));
  } catch (err) {
    logger.error({ err }, 'Error listing users');
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// ============================================================================
// POST /users - Neuen Benutzer erstellen
// ============================================================================
// Erstellt ein neues lokales Benutzerkonto mit den angegebenen Daten.
// Erwartet im Request-Body: username, password, displayName (optional), email (optional), role.
// Das Passwort wird gegen die Passwortrichtlinien validiert und mit bcrypt gehasht.
// Die Rolle muss eine der gültigen Rollen sein: admin, editor, viewer.
// Erfordert die Berechtigung 'users.manage'.
router.post('/users', authenticate, requirePermission('users.manage'), writeLimiter, async (req, res) => {
  // Benutzerdaten aus dem Request-Body extrahieren
  const { username, password, displayName, email, role } = req.body;

  // Eingabevalidierung: Benutzername, Passwort und Rolle prüfen
  const errors = [];
  if (!username || !username.trim()) errors.push('Username is required.');
  errors.push(...validatePassword(password)); // Passwort gegen Richtlinien prüfen
  if (!['admin', 'auditor', 'user'].includes(role)) errors.push('Invalid role.');
  if (errors.length > 0) return res.status(400).json({ error: errors.join(' '), errors });

  try {
    const pool = getPool();

    // Passwort mit bcrypt hashen
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const client = await pool.connect();
    let user;
    try {
      await client.query('BEGIN');

      // Neuen Benutzer in die Datenbank einfügen
      const result = await client.query(
        `INSERT INTO users (username, password_hash, display_name, email, global_role, auth_source)
         VALUES ($1, $2, $3, $4, $5, 'local') RETURNING id, username, display_name, email, global_role, auth_source, created_at`,
        [username.trim().toLowerCase(), hash, displayName || username, email || null, role]
      );
      user = result.rows[0];

      // Privaten Bereich für neuen Benutzer erstellen
      await client.query('INSERT INTO private_spaces (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // Benutzererstellung im Audit-Log protokollieren
    await auditLog(req.user.id, req.user.username, 'create_user', 'user', user.id, { target: user.username, role }, getIp(req));

    // Erstellten Benutzer mit Status 201 (Created) zurückgeben
    res.status(201).json({ id: user.id, username: user.username, displayName: user.display_name, email: user.email, globalRole: user.global_role, authSource: user.auth_source });
  } catch (err) {
    // Fehlercode 23505 = Unique-Constraint-Verletzung (Benutzername existiert bereits)
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists.' });
    logger.error({ err }, 'Error creating user');
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ============================================================================
// PUT /users/:id - Benutzer aktualisieren
// ============================================================================
// Aktualisiert die Daten eines bestehenden Benutzers.
// Unterstützt das Ändern von: role, isActive, displayName, email.
// Der Administrator kann sich selbst nicht bearbeiten (Sicherheitsmaßnahme).
// Die SQL-Abfrage wird dynamisch aufgebaut, um nur geänderte Felder zu aktualisieren.
// Erfordert die Berechtigung 'users.manage'.
router.put('/users/:id', authenticate, requirePermission('users.manage'), writeLimiter, async (req, res) => {
  // Benutzer-ID aus der URL extrahieren und validieren
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });

  // Selbst-Modifikation verhindern (Admin darf eigenes Konto nicht über diese Route ändern)
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot modify your own account' });

  const { role, isActive, displayName, email } = req.body;

  // Dynamische SQL-Abfrage aufbauen: Nur übergebene Felder werden aktualisiert
  const updates = []; const params = []; let idx = 1;
  if (role && ['admin', 'auditor', 'user'].includes(role)) { updates.push(`global_role = $${idx++}`); params.push(role); }
  if (typeof isActive === 'boolean') { updates.push(`is_active = $${idx++}`); params.push(isActive); }
  if (displayName !== undefined) { updates.push(`display_name = $${idx++}`); params.push(displayName); }
  if (email !== undefined) { updates.push(`email = $${idx++}`); params.push(email || null); }

  // Mindestens ein Feld muss angegeben werden
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  // Benutzer-ID als letzten Parameter hinzufügen
  params.push(id);

  try {
    const pool = getPool();

    // Dynamisches UPDATE mit den gesammelten Feldern und Parametern ausführen
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, display_name, email, global_role, auth_source, is_active`,
      params
    );

    // Benutzer nicht gefunden
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = result.rows[0];

    // Benutzeraktualisierung im Audit-Log protokollieren (mit allen Änderungen)
    await auditLog(req.user.id, req.user.username, 'update_user', 'user', user.id, { changes: req.body }, getIp(req));

    // Aktualisierte Benutzerdaten zurückgeben
    res.json({ id: user.id, username: user.username, displayName: user.display_name, email: user.email, globalRole: user.global_role, authSource: user.auth_source, isActive: user.is_active });
  } catch (err) {
    logger.error({ err }, 'Error updating user');
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ============================================================================
// DELETE /users/:id - Benutzer löschen
// ============================================================================
// Löscht einen Benutzer dauerhaft aus der Datenbank.
// Der Administrator kann sich selbst nicht löschen (Sicherheitsmaßnahme).
// Die Löschung wird im Audit-Log protokolliert.
// Erfordert die Berechtigung 'users.manage'.
router.delete('/users/:id', authenticate, requirePermission('users.manage'), writeLimiter, async (req, res) => {
  // Benutzer-ID aus der URL extrahieren und validieren
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });

  // Selbst-Löschung verhindern
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });

  try {
    const pool = getPool();

    // Benutzer aus der Datenbank löschen und Benutzernamen für das Audit-Log zurückgeben
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING username', [id]);

    // Benutzer nicht gefunden
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    // Löschung im Audit-Log protokollieren
    await auditLog(req.user.id, req.user.username, 'delete_user', 'user', id, { target: result.rows[0].username }, getIp(req));

    res.json({ message: 'User deleted' });
  } catch (err) {
    logger.error({ err }, 'Error deleting user');
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ============================================================================
// GET /users/list - Leichtgewichtige Benutzerliste
// ============================================================================
// Gibt eine vereinfachte Liste aller aktiven Benutzer zurück.
// Enthält nur ID, Benutzername und Anzeigename.
// Wird im Frontend für Dialoge wie das Teilen von Seiten verwendet.
// Erfordert nur eine gültige Authentifizierung (keine Admin-Rechte nötig).
router.get('/users/list', authenticate, async (req, res) => {
  try {
    const pool = getPool();

    // Nur aktive Benutzer abrufen, sortiert nach Anzeigename
    const result = await pool.query(
      'SELECT id, username, display_name FROM users WHERE is_active = true ORDER BY display_name ASC'
    );

    // Minimale Benutzerdaten in camelCase zurückgeben
    res.json(result.rows.map(u => ({ id: u.id, username: u.username, displayName: u.display_name })));
  } catch (err) {
    logger.error({ err }, 'Error listing users');
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Router exportieren für die Verwendung in der Hauptanwendung
module.exports = router;

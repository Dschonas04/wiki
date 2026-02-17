/**
 * Authentifizierungs-Routen
 *
 * Diese Datei enthält alle Routen für die Benutzer-Authentifizierung im Nexora-System.
 * Unterstützt werden sowohl lokale Authentifizierung (Benutzername/Passwort mit bcrypt)
 * als auch LDAP-basierte Authentifizierung, wenn diese in der Konfiguration aktiviert ist.
 *
 * Endpunkte:
 *   POST /auth/login           - Benutzer-Anmeldung (LDAP oder lokal)
 *   POST /auth/logout          - Benutzer-Abmeldung (Cookie löschen)
 *   GET  /auth/me              - Aktuellen Benutzer abrufen (Profildaten)
 *   POST /auth/change-password - Passwort ändern (nur für lokale Konten)
 *
 * Sicherheit:
 *   - Rate-Limiting auf Login- und Schreiboperationen
 *   - Passwort-Hashing mit bcrypt
 *   - JWT-Token-basierte Sitzungsverwaltung via Cookie
 *   - Audit-Logging für alle sicherheitsrelevanten Aktionen
 */

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

// Konfigurationswerte und Dienste importieren
const { LDAP_ENABLED, BCRYPT_ROUNDS, COOKIE_NAME } = require('../config');
const { getPool } = require('../database');
const { authenticate } = require('../middleware/auth');
const { authLimiter, writeLimiter } = require('../middleware/security');
const { signToken, setTokenCookie } = require('../auth/jwt');
const { ldapAuthenticate } = require('../auth/ldap');
const { auditLog } = require('../helpers/audit');
const { getIp, formatUser } = require('../helpers/utils');
const { validatePassword } = require('../helpers/validators');

// ============================================================================
// POST /auth/login - Benutzer-Anmeldung
// ============================================================================
// Authentifiziert einen Benutzer mit Benutzername und Passwort.
// Falls LDAP aktiviert ist, wird zuerst eine LDAP-Authentifizierung versucht.
// Bei LDAP-Erfolg wird der Benutzer in der Datenbank angelegt oder aktualisiert (Upsert).
// Schlägt LDAP fehl, wird auf die lokale Authentifizierung zurückgefallen.
// Bei Erfolg wird ein JWT-Token erstellt und als Cookie gesetzt.
// Rate-Limiting schützt vor Brute-Force-Angriffen.
router.post('/auth/login', authLimiter, async (req, res) => {
  // Datenbankverbindung prüfen
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Benutzername und Passwort aus dem Request-Body extrahieren
  const { username, password } = req.body;

  // Eingabevalidierung: Beide Felder sind Pflichtfelder
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

  // Benutzername bereinigen: Leerzeichen entfernen und in Kleinbuchstaben umwandeln
  const cleanUser = username.trim().toLowerCase();

  try {
    // LDAP-Authentifizierung versuchen, falls aktiviert
    if (LDAP_ENABLED) {
      try {
        // LDAP-Authentifizierung durchführen
        const ldapUser = await ldapAuthenticate(cleanUser, password);
        console.log(`LDAP auth OK: ${cleanUser} (${ldapUser.role})`);

        // Benutzer in der lokalen Datenbank anlegen oder aktualisieren (Upsert)
        // Bei Konflikt (Benutzername existiert bereits) werden die Daten aktualisiert
        const upsert = await pool.query(`
          INSERT INTO users (username, display_name, email, global_role, auth_source, last_login, is_active)
          VALUES ($1, $2, $3, $4, 'ldap', CURRENT_TIMESTAMP, true)
          ON CONFLICT (username) DO UPDATE SET
            display_name = EXCLUDED.display_name, email = EXCLUDED.email,
            global_role = EXCLUDED.global_role, auth_source = 'ldap', last_login = CURRENT_TIMESTAMP
          RETURNING *`,
          [cleanUser, ldapUser.displayName, ldapUser.email, ldapUser.role]);
        const user = upsert.rows[0];

        // LDAP-Benutzer müssen kein Passwort ändern
        user.must_change_password = false;

        // JWT-Token erstellen und als HTTP-Cookie setzen
        const token = signToken(user);
        setTokenCookie(res, token);

        // Erfolgreiche LDAP-Anmeldung im Audit-Log protokollieren
        await auditLog(user.id, user.username, 'login', 'auth', null, { source: 'ldap' }, getIp(req));

        // Benutzerdaten zurückgeben (formatiert ohne sensible Felder)
        return res.json({ user: formatUser(user) });
      } catch (ldapErr) {
        // LDAP fehlgeschlagen - Fallback auf lokale Authentifizierung
        console.log(`LDAP failed for ${cleanUser}: ${ldapErr.message} → trying local`);
      }
    }

    // Lokale Authentifizierung: Benutzer in der Datenbank suchen
    // Nur aktive, lokale Benutzer werden berücksichtigt
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND auth_source = $2 AND is_active = true',
      [cleanUser, 'local']
    );

    // Benutzer nicht gefunden - fehlgeschlagenen Versuch protokollieren
    if (result.rows.length === 0) {
      await auditLog(null, cleanUser, 'login_failed', 'auth', null, { reason: 'not found' }, getIp(req));
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];

    // Passwort mit bcrypt gegen den gespeicherten Hash vergleichen
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      // Falsches Passwort - fehlgeschlagenen Versuch protokollieren
      await auditLog(user.id, user.username, 'login_failed', 'auth', null, { reason: 'wrong password' }, getIp(req));
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Letzten Login-Zeitstempel in der Datenbank aktualisieren
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // JWT-Token erstellen und als HTTP-Cookie setzen
    const token = signToken(user);
    setTokenCookie(res, token);

    // Erfolgreiche lokale Anmeldung im Audit-Log protokollieren
    await auditLog(user.id, user.username, 'login', 'auth', null, { source: 'local' }, getIp(req));

    // Benutzerdaten und ggf. Passwort-Änderungs-Flag zurückgeben
    res.json({ user: formatUser(user), mustChangePassword: !!user.must_change_password });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============================================================================
// POST /auth/logout - Benutzer-Abmeldung
// ============================================================================
// Meldet den aktuell authentifizierten Benutzer ab.
// Das JWT-Cookie wird gelöscht und die Abmeldung im Audit-Log protokolliert.
// Erfordert eine gültige Authentifizierung (authenticate-Middleware).
router.post('/auth/logout', authenticate, async (req, res) => {
  // Abmeldung im Audit-Log protokollieren
  await auditLog(req.user.id, req.user.username, 'logout', 'auth', null, null, getIp(req));

  // JWT-Cookie aus dem Browser entfernen
  res.clearCookie(COOKIE_NAME);
  res.json({ message: 'Logged out' });
});

// ============================================================================
// GET /auth/me - Aktuellen Benutzer abrufen
// ============================================================================
// Gibt die Profildaten des aktuell angemeldeten Benutzers zurück.
// Wird vom Frontend genutzt, um den Anmeldestatus und Benutzerinformationen zu prüfen.
// Erfordert eine gültige Authentifizierung.
router.get('/auth/me', authenticate, async (req, res) => {
  try {
    const pool = getPool();

    // Benutzerdaten aus der Datenbank laden (nur ausgewählte Felder, kein Passwort-Hash)
    const result = await pool.query(
      'SELECT id, username, display_name, email, global_role, auth_source, last_login, created_at, must_change_password FROM users WHERE id = $1',
      [req.user.id]
    );

    // Benutzer nicht mehr in der Datenbank vorhanden - Cookie löschen und Fehler melden
    if (result.rows.length === 0) {
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({ error: 'User not found' });
    }

    // Formatierte Benutzerdaten zurückgeben
    res.json(formatUser(result.rows[0]));
  } catch (err) {
    console.error('Get me error:', err.message);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// ============================================================================
// POST /auth/change-password - Passwort ändern
// ============================================================================
// Ermöglicht einem lokal authentifizierten Benutzer, sein Passwort zu ändern.
// Das aktuelle Passwort muss zur Verifizierung angegeben werden.
// Das neue Passwort wird gegen die Passwortrichtlinien validiert.
// Nur für lokale Konten verfügbar (nicht für LDAP-Benutzer).
// Nach erfolgreicher Änderung wird ein neues JWT-Token ausgestellt.
router.post('/auth/change-password', authenticate, writeLimiter, async (req, res) => {
  // Aktuelles und neues Passwort aus dem Request-Body extrahieren
  const { currentPassword, newPassword } = req.body;

  // Eingabevalidierung: Beide Passwörter sind Pflichtfelder
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required.' });

  // Neues Passwort gegen die Passwortrichtlinien prüfen (Länge, Komplexität usw.)
  const pwErrors = validatePassword(newPassword);
  if (pwErrors.length > 0) return res.status(400).json({ error: pwErrors.join(' '), errors: pwErrors });

  try {
    const pool = getPool();

    // Sicherstellen, dass der Benutzer ein lokales Konto hat (keine Passwortänderung für LDAP)
    const result = await pool.query('SELECT * FROM users WHERE id = $1 AND auth_source = $2', [req.user.id, 'local']);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Password change is only available for local accounts.' });

    const user = result.rows[0];

    // Aktuelles Passwort verifizieren
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      // Fehlgeschlagene Passwortänderung protokollieren
      await auditLog(user.id, user.username, 'password_change_failed', 'auth', null, { reason: 'wrong current password' }, getIp(req));
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    // Neues Passwort hashen und in der Datenbank speichern
    // Das Flag must_change_password wird zurückgesetzt
    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [hash, user.id]);

    // Erfolgreiche Passwortänderung im Audit-Log protokollieren
    await auditLog(user.id, user.username, 'password_changed', 'auth', null, null, getIp(req));

    // Neues JWT-Token mit aktualisierten Benutzerdaten erstellen und setzen
    const updated = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);
    const token = signToken(updated.rows[0]);
    setTokenCookie(res, token);

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Password change error:', err.message);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

// Router exportieren für die Verwendung in der Hauptanwendung
module.exports = router;

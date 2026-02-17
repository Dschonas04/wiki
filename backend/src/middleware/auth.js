/**
 * Authentifizierungs-Middleware
 * 
 * Diese Datei enthält die zentrale Authentifizierungs- und Autorisierungslogik
 * für die Nexora-Anwendung. Sie stellt zwei Middleware-Funktionen bereit:
 * 
 * 1. `authenticate` – Überprüft, ob der Benutzer einen gültigen JWT-Token besitzt
 *    und ob das zugehörige Benutzerkonto aktiv ist.
 * 2. `requirePermission` – Prüft, ob der authentifizierte Benutzer über die
 *    erforderlichen Berechtigungen verfügt, um auf eine bestimmte Ressource zuzugreifen.
 * 
 * Beide Funktionen werden als Express-Middleware in den Routen verwendet.
 */

// Externe Abhängigkeit: JSON Web Token Bibliothek zum Verifizieren von Token
const jwt = require('jsonwebtoken');

// Konfigurationswerte: JWT-Geheimnis, Cookie-Name und Berechtigungszuordnungen
const { JWT_SECRET, COOKIE_NAME, PERMISSIONS } = require('../config');

// Datenbankverbindung: Pool-Objekt für PostgreSQL-Abfragen
const { getPool } = require('../database');

/**
 * Authentifizierungs-Middleware
 * 
 * Überprüft den JWT-Token aus dem Cookie des Benutzers und stellt sicher,
 * dass das Benutzerkonto in der Datenbank noch aktiv ist.
 * Bei Erfolg wird `req.user` mit den dekodierten Token-Daten befüllt.
 * 
 * @param {Object} req - Das Express-Request-Objekt (enthält Cookies)
 * @param {Object} res - Das Express-Response-Objekt (zum Senden von Fehlern)
 * @param {Function} next - Callback zum Weiterleiten an die nächste Middleware
 * @returns {void} Sendet 401-Fehler bei fehlender oder ungültiger Authentifizierung
 */
async function authenticate(req, res, next) {
  // Token aus dem HTTP-Cookie extrahieren (optional chaining für Sicherheit)
  const token = req.cookies?.[COOKIE_NAME];

  // Kein Token vorhanden → Benutzer ist nicht angemeldet
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    // JWT-Token mit dem geheimen Schlüssel verifizieren und dekodieren
    const decoded = jwt.verify(token, JWT_SECRET);

    // Datenbankverbindung holen, um den Benutzerstatus zu überprüfen
    const pool = getPool();
    if (pool) {
      // Benutzerdaten aus der Datenbank laden: ID, Benutzername, Rolle, Aktivstatus
      // und ob ein Passwortwechsel erforderlich ist
      const check = await pool.query(
        'SELECT id, username, global_role, is_active, must_change_password FROM users WHERE id = $1',
        [decoded.id]
      );

      // Benutzer existiert nicht mehr oder wurde deaktiviert
      if (check.rows.length === 0 || !check.rows[0].is_active) {
        // Cookie löschen, da die Sitzung ungültig ist
        res.clearCookie(COOKIE_NAME);
        return res.status(401).json({ error: 'Account disabled or deleted.' });
      }

      // Rolle und Passwortwechsel-Flag aus der Datenbank aktualisieren
      // (könnte sich seit der Token-Erstellung geändert haben)
      decoded.global_role = check.rows[0].global_role;
      decoded.mustChangePassword = check.rows[0].must_change_password;
    }

    // Dekodierte Benutzerdaten am Request-Objekt anhängen für nachfolgende Handler
    req.user = decoded;

    // Weiter zur nächsten Middleware oder zum Route-Handler
    next();
  } catch (err) {
    // Token ist abgelaufen oder ungültig → Cookie entfernen und Fehler zurückgeben
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

/**
 * Berechtigungs-Middleware-Fabrik
 * 
 * Erzeugt eine Middleware-Funktion, die prüft, ob der authentifizierte Benutzer
 * alle angegebenen Berechtigungen besitzt. Die Berechtigungen werden anhand
 * der Benutzerrolle aus der PERMISSIONS-Konfiguration aufgelöst.
 * 
 * @param {...string} perms - Eine oder mehrere erforderliche Berechtigungen
 *   (z.B. 'pages.create', 'users.manage')
 * @returns {Function} Express-Middleware, die bei fehlenden Berechtigungen 403 zurückgibt
 */
function requirePermission(...perms) {
  // Gibt eine Middleware-Funktion zurück (Closure über die benötigten Berechtigungen)
  return (req, res, next) => {
    // Sicherstellen, dass der Benutzer authentifiziert ist
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    // Berechtigungen für die Rolle des Benutzers aus der Konfiguration laden
    const userPerms = PERMISSIONS[req.user.global_role] || [];

    // Prüfen, ob der Benutzer ALLE geforderten Berechtigungen besitzt
    const hasAll = perms.every(p => userPerms.includes(p));

    // Fehlende Berechtigungen → 403 Forbidden mit Details zurückgeben
    if (!hasAll) {
      return res.status(403).json({ error: 'Insufficient permissions', required: perms, your_role: req.user.global_role });
    }

    // Alle Berechtigungen vorhanden → weiter zur nächsten Middleware
    next();
  };
}

// Exportiert die Middleware-Funktionen für die Verwendung in den Routen
module.exports = { authenticate, requirePermission };

/**
 * Hilfsfunktionen
 * 
 * Diese Datei enthält allgemeine Hilfsfunktionen, die in der gesamten
 * Nexora-Anwendung verwendet werden. Die Funktionen umfassen:
 * 
 * - IP-Adressermittlung des Clients
 * - Zugriffsprüfung auf Wiki-Seiten basierend auf Berechtigungen
 * - Formatierung von Benutzerobjekten für die API-Antwort
 * 
 * Diese Funktionen werden von verschiedenen Routen und Middleware importiert.
 */

// Datenbankverbindung: Pool-Objekt für PostgreSQL-Abfragen
const { getPool } = require('../database');

// Berechtigungskonfiguration: Zuordnung von Rollen zu erlaubten Aktionen
const { PERMISSIONS } = require('../config');

/**
 * Ermittelt die echte IP-Adresse des Clients
 * 
 * Hinter einem Reverse-Proxy (z.B. Nginx) wird die ursprüngliche Client-IP
 * im Header 'x-real-ip' weitergeleitet. Falls dieser Header nicht vorhanden
 * ist, wird die Standard-IP aus Express verwendet.
 * 
 * @param {Object} req - Das Express-Request-Objekt
 * @returns {string} Die IP-Adresse des Clients
 */
function getIp(req) {
  // Zuerst den Proxy-Header prüfen, dann auf Express' req.ip zurückfallen
  return req.headers['x-real-ip'] || req.ip;
}

/**
 * Prüft, ob ein Benutzer Zugriff auf eine bestimmte Wiki-Seite hat
 * 
 * Die Zugriffsprüfung folgt folgender Logik:
 * 1. Administratoren haben immer Zugriff auf alle Seiten
 * 2. Normale Benutzer haben Zugriff, wenn:
 *    a) Die Seite als 'published' (veröffentlicht) markiert ist, ODER
 *    b) Der Benutzer der Ersteller der Seite ist, ODER
 *    c) Die Seite explizit mit dem Benutzer geteilt wurde
 * 
 * @param {number} pageId - Die eindeutige ID der Wiki-Seite
 * @param {Object} user - Das Benutzerobjekt mit id und role Eigenschaften
 * @returns {Promise<boolean>} true wenn Zugriff erlaubt, false wenn nicht
 */
async function canAccessPage(pageId, user) {
  const pool = getPool();
  if (!pool) return false;
  if (user.global_role === 'admin' || user.global_role === 'auditor') return true;
  const result = await pool.query(
    `SELECT 1 FROM wiki_pages wp WHERE wp.id = $1 AND wp.deleted_at IS NULL AND (
      wp.workflow_status = 'published' AND wp.space_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM space_memberships sm WHERE sm.space_id = wp.space_id AND sm.user_id = $2
      )
      OR wp.created_by = $2
      OR wp.private_space_id IN (SELECT id FROM private_spaces WHERE user_id = $2)
    )`,
    [pageId, user.id]
  );
  return result.rows.length > 0;
}

/**
 * Formatiert ein Datenbank-Benutzerobjekt für die API-Antwort
 * 
 * Wandelt die Datenbank-Spaltennamen (snake_case) in camelCase um und
 * fügt die berechneten Berechtigungen basierend auf der Benutzerrolle hinzu.
 * Sensible Daten wie Passwort-Hashes werden hierbei nicht weitergegeben.
 * 
 * @param {Object} u - Das rohe Benutzerobjekt aus der Datenbankabfrage
 * @param {number} u.id - Eindeutige Benutzer-ID
 * @param {string} u.username - Benutzername
 * @param {string} u.display_name - Anzeigename des Benutzers
 * @param {string} u.email - E-Mail-Adresse
 * @param {string} u.role - Rolle des Benutzers (z.B. 'admin', 'editor', 'viewer')
 * @param {string} u.auth_source - Authentifizierungsquelle (z.B. 'local', 'ldap')
 * @param {string} u.last_login - Zeitstempel der letzten Anmeldung
 * @param {string} u.created_at - Zeitstempel der Kontoerstellung
 * @param {boolean} u.must_change_password - Ob ein Passwortwechsel erforderlich ist
 * @returns {Object} Formatiertes Benutzerobjekt für die JSON-API-Antwort
 */
function formatUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    email: u.email,
    globalRole: u.global_role,
    authSource: u.auth_source,
    lastLogin: u.last_login,
    createdAt: u.created_at,
    mustChangePassword: u.must_change_password || false,
    permissions: PERMISSIONS[u.global_role] || [],
  };
}

// Exportiert alle Hilfsfunktionen für die Verwendung in anderen Modulen
module.exports = { getIp, canAccessPage, formatUser };

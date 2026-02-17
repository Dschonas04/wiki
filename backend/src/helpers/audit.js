/**
 * Audit-Logging
 * 
 * Diese Datei stellt die zentrale Audit-Log-Funktion bereit, mit der
 * sicherheitsrelevante und nachvollziehbare Benutzeraktionen in der
 * Datenbank protokolliert werden.
 * 
 * Jeder Audit-Eintrag enthält:
 * - Wer die Aktion durchgeführt hat (Benutzer-ID und Benutzername)
 * - Was getan wurde (Aktionstyp)
 * - Auf welche Ressource sich die Aktion bezieht (Typ und ID)
 * - Zusätzliche Details zur Aktion
 * - Die IP-Adresse des Clients
 * 
 * Das Audit-Log dient der Nachvollziehbarkeit, Sicherheitsüberwachung
 * und Compliance-Anforderungen.
 */

// Datenbankverbindung: Pool-Objekt für PostgreSQL-Abfragen
const { getPool } = require('../database');

/**
 * Erstellt einen Eintrag im Audit-Log
 * 
 * Schreibt eine Benutzeraktion in die Tabelle 'audit_log' der Datenbank.
 * Fehler beim Schreiben des Logs werden abgefangen und auf der Konsole
 * ausgegeben, um den normalen Anwendungsfluss nicht zu unterbrechen.
 * 
 * @param {number|null} userId - Die ID des Benutzers, der die Aktion ausführt
 * @param {string} username - Der Benutzername (für schnelle Lesbarkeit im Log)
 * @param {string} action - Die Art der Aktion (z.B. 'page.create', 'user.login', 'page.delete')
 * @param {string} resourceType - Der Typ der betroffenen Ressource (z.B. 'page', 'user', 'settings')
 * @param {number|string|null} resourceId - Die eindeutige ID der betroffenen Ressource
 * @param {Object|null} details - Zusätzliche Details als Objekt (werden als JSON gespeichert)
 * @param {string} ipAddress - Die IP-Adresse des Clients für Sicherheitsnachverfolgung
 * @returns {Promise<void>} Gibt nichts zurück; Fehler werden intern behandelt
 */
async function auditLog(userId, username, action, resourceType, resourceId, details, ipAddress) {
  // Datenbankverbindung holen
  const pool = getPool();

  // Ohne Datenbankverbindung kann kein Log geschrieben werden → frühzeitig abbrechen
  if (!pool) return;

  try {
    // Audit-Eintrag in die Datenbank einfügen
    // Die Details werden als JSON-String gespeichert, falls vorhanden
    await pool.query(
      `INSERT INTO audit_log (user_id, username, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, username, action, resourceType, resourceId, details ? JSON.stringify(details) : null, ipAddress]
    );
  } catch (err) {
    // Fehler beim Audit-Logging dürfen die Anwendung nicht zum Absturz bringen
    // Stattdessen wird der Fehler nur auf der Konsole protokolliert
    console.error('Audit log error:', err.message);
  }
}

// Exportiert die Audit-Log-Funktion für die Verwendung in Routen und Middleware
module.exports = { auditLog };

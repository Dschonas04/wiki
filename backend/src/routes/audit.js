/**
 * Audit-Log
 *
 * Diese Datei stellt den Endpunkt zum Abrufen des Audit-Logs bereit.
 * Das Audit-Log protokolliert alle sicherheitsrelevanten Aktionen im Wiki-System,
 * wie z.B. Seitenerstellung, Löschung, Freigaben, Benutzeränderungen etc.
 * Die Ergebnisse werden paginiert zurückgegeben.
 *
 * Endpunkte:
 *   GET /audit – Audit-Log-Einträge abrufen (paginiert)
 *
 * Berechtigungen:
 *   - Erfordert Authentifizierung + 'audit.read'-Berechtigung
 *
 * Query-Parameter:
 *   - limit  (optional): Anzahl der Einträge pro Seite (Standard: 50, Maximum: 200)
 *   - offset (optional): Versatz für die Paginierung (Standard: 0)
 *
 * Datenbanktabellen: audit_log
 */

const express = require('express');
const router = express.Router();

// Datenbankverbindung importieren
const { getPool } = require('../database');
// Authentifizierungs- und Berechtigungs-Middleware
const { authenticate, requirePermission } = require('../middleware/auth');
const logger = require('../logger');

// ============================================================================
// GET /audit – Audit-Log-Einträge abrufen (paginiert)
// Gibt eine paginierte Liste aller Audit-Log-Einträge zurück, sortiert nach
// Erstellungsdatum (neueste zuerst). Enthält außerdem die Gesamtanzahl
// aller Einträge für die Paginierung im Frontend.
// Erfordert: Authentifizierung + 'audit.read'-Berechtigung
// Query-Parameter: limit (max. 200), offset (Standard: 0)
// Antwort: { items: [...], total: number, limit: number, offset: number }
// ============================================================================
router.get('/audit', authenticate, requirePermission('audit.read'), async (req, res) => {
  // Datenbankpool holen
  const pool = getPool();
  // Limit aus Query-Parametern lesen, Standard ist 50, Maximum ist 200
  // Math.min verhindert, dass mehr als 200 Einträge auf einmal abgefragt werden
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  // Offset aus Query-Parametern lesen, Standard ist 0 (erste Seite)
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  try {
    // Audit-Log-Einträge abfragen, sortiert nach Datum (neueste zuerst)
    const result = await pool.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    // Gesamtanzahl der Einträge für die Paginierung ermitteln
    const count = await pool.query('SELECT COUNT(*) FROM audit_log');
    // Ergebnis mit Einträgen, Gesamtanzahl und Paginierungsinformationen zurückgeben
    res.json({ items: result.rows, total: parseInt(count.rows[0].count), limit, offset });
  } catch (err) {
    // Fehlerbehandlung bei Datenbankfehlern
    logger.error({ err }, 'Audit log error');
    res.status(500).json({ error: 'Failed to retrieve audit log' });
  }
});

// Router-Modul exportieren, damit es in der Hauptanwendung eingebunden werden kann
module.exports = router;

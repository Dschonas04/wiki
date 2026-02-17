/**
 * Health-Checks
 *
 * Diese Datei stellt Endpunkte zur Überwachung des Systemzustands bereit.
 * Es gibt einen öffentlichen Endpunkt für einfache Verfügbarkeitsprüfungen
 * (z.B. Docker Healthcheck) und einen detaillierten Endpunkt für authentifizierte
 * Benutzer mit erweiterten Systeminformationen.
 *
 * Endpunkte:
 *   GET /health         – Öffentlicher Health-Check (keine Authentifizierung nötig)
 *   GET /health/details – Detaillierter Health-Check mit Systemstatistiken (Auth erforderlich)
 *
 * Berechtigungen:
 *   - /health: Öffentlich zugänglich (für Docker, Load Balancer, Monitoring etc.)
 *   - /health/details: Erfordert Authentifizierung + 'health.read'-Berechtigung
 */

const express = require('express');
const router = express.Router();

// Konfiguration importieren: LDAP-Status und verfügbare Berechtigungen
const { LDAP_ENABLED, PERMISSIONS } = require('../config');
// Datenbankverbindung importieren
const { getPool } = require('../database');
// Authentifizierungs- und Berechtigungs-Middleware
const { authenticate, requirePermission } = require('../middleware/auth');

// ============================================================================
// GET /health – Öffentlicher Health-Check (Public)
// Wird typischerweise von Docker Healthchecks, Load Balancern oder
// Monitoring-Systemen aufgerufen, um die Erreichbarkeit zu prüfen.
// Prüft nur, ob die Datenbank erreichbar ist (einfache SELECT 1 Abfrage).
// Keine Authentifizierung erforderlich.
// Antwort: { status: 'healthy' } oder { status: 'unhealthy' }
// ============================================================================
router.get('/health', async (req, res) => {
  // Datenbankpool holen
  const pool = getPool();
  // Wenn kein Pool vorhanden ist, ist die Datenbank nicht verbunden
  if (!pool) return res.status(503).json({ status: 'unhealthy' });
  try {
    // Einfache Testabfrage an die Datenbank senden
    await pool.query('SELECT 1');
    // Datenbank ist erreichbar – System ist gesund
    res.json({ status: 'healthy' });
  } catch {
    // Datenbankabfrage fehlgeschlagen – System ist nicht gesund
    res.status(503).json({ status: 'unhealthy' });
  }
});

// ============================================================================
// GET /health/details – Detaillierter Health-Check (nur für authentifizierte Benutzer)
// Gibt umfassende Systeminformationen zurück, darunter:
// - Datenbankstatus und aktuelle Serverzeit
// - LDAP-Konfigurationsstatus (aktiviert/deaktiviert)
// - RBAC-Status und verfügbare Rollen
// - Anzahl der Benutzer und Wiki-Seiten
// - Server-Uptime in Sekunden
// Erfordert: Authentifizierung + 'health.read'-Berechtigung
// ============================================================================
router.get('/health/details', authenticate, requirePermission('health.read'), async (req, res) => {
  // Datenbankpool holen
  const pool = getPool();
  // Wenn kein Pool vorhanden ist, detaillierte Fehlermeldung zurückgeben
  if (!pool) return res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  try {
    // Aktuelle Serverzeit der Datenbank abfragen
    const result = await pool.query('SELECT NOW()');
    // Gesamtanzahl der registrierten Benutzer zählen
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    // Gesamtanzahl der Wiki-Seiten zählen
    const pageCount = await pool.query('SELECT COUNT(*) FROM wiki_pages');
    // Umfassende Systeminformationen als JSON zurückgeben
    res.json({
      status: 'healthy',
      database: 'connected',
      // LDAP-Authentifizierungsstatus (aktiviert oder deaktiviert)
      ldap: LDAP_ENABLED ? 'enabled' : 'disabled',
      // Rollenbasierte Zugriffskontrolle ist immer aktiv
      rbac: 'active',
      // Liste aller verfügbaren Rollen aus der Konfiguration
      roles: Object.keys(PERMISSIONS),
      // Statistische Zähler für Benutzer und Seiten
      counts: { users: parseInt(userCount.rows[0].count), pages: parseInt(pageCount.rows[0].count) },
      // Aktueller Zeitstempel der Datenbank
      timestamp: result.rows[0].now,
      // Server-Betriebszeit in Sekunden (abgerundet)
      uptime: Math.floor(process.uptime()),
    });
  } catch (err) {
    // Fehlerbehandlung: System als ungesund melden
    res.status(503).json({ status: 'unhealthy', database: 'error' });
  }
});

// Router-Modul exportieren, damit es in der Hauptanwendung eingebunden werden kann
module.exports = router;

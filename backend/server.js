/**
 * Nexora API Server – Einstiegspunkt
 * 
 * Dies ist die Hauptdatei des Nexora-Backend-Servers. Sie initialisiert die Express-
 * Anwendung, bindet alle Middleware- und Routen-Module ein und startet den
 * HTTP-Server nach erfolgreicher Datenbankverbindung.
 * 
 * Modulare Architektur mit getrennten Routen und Middleware:
 *  - Sicherheitskonfiguration (CORS, Helmet, Rate-Limiting) in middleware/security.js
 *  - Alle API-Endpunkte unter /api/* in separaten Routen-Dateien
 *  - Datenbankverbindung mit automatischem Retry-Mechanismus
 *  - Graceful Shutdown bei SIGTERM/SIGINT Signalen
 */

// Express-Framework fuer HTTP-Server und Routing
const express = require('express');

// Konfigurationswerte aus zentraler config.js laden (Port, LDAP-Status)
const { PORT, LDAP_ENABLED } = require('./src/config');

// Strukturierter Logger (pino)
const logger = require('./src/logger');

// Datenbankmodul: connectWithRetry stellt Verbindung her, getPool liefert den Connection-Pool
const { connectWithRetry, getPool } = require('./src/database');

// Sicherheits-Middleware (CORS, Helmet, Body-Parser, Rate-Limiter etc.)
const { setupSecurity } = require('./src/middleware/security');

// ============================================================
// Express-App erstellen
// ============================================================
const app = express();

// ============================================================
// Security & Middleware konfigurieren
// Richtet CORS, Helmet, JSON-Parser, Cookie-Parser und
// Rate-Limiting ein – muss vor den Routen erfolgen.
// ============================================================
setupSecurity(app);

// ============================================================
// API-Routen einbinden
// Jede Routen-Datei exportiert einen Express-Router,
// der unter dem Praefix /api gemountet wird.
// ============================================================

// Authentifizierung: Login, Logout, Token-Refresh
app.use('/api', require('./src/routes/auth'));

// Benutzerverwaltung: CRUD-Operationen fuer Benutzerkonten
app.use('/api', require('./src/routes/users'));

// Nexora-Seiten: Erstellen, Bearbeiten, Loeschen, Suche, Versionen
app.use('/api', require('./src/routes/pages'));

// Freigabe-Workflow: Genehmigungsanfragen fuer Seiten
app.use('/api', require('./src/routes/approvals'));

// Dateianhänge: Upload und Download von Dateien zu Nexora-Seiten
app.use('/api', require('./src/routes/attachments'));

// Tags: Verwaltung von Schlagwörtern fuer Seiten
app.use('/api', require('./src/routes/tags'));

// Favoriten: Benutzer können Seiten als Favoriten markieren
app.use('/api', require('./src/routes/favorites'));

// Freigaben: Seiten mit anderen Benutzern teilen (Lese-/Schreibrechte)
app.use('/api', require('./src/routes/sharing'));

// Papierkorb: Soft-Delete und Wiederherstellung von Seiten
app.use('/api', require('./src/routes/trash'));

// Health-Check: Systemstatus und Datenbankverbindung pruefen
app.use('/api', require('./src/routes/health'));

// Audit-Log: Protokollierung aller wichtigen Benutzeraktionen
app.use('/api', require('./src/routes/audit'));

// Einstellungen: Benutzereinstellungen (z.B. Theme-Praeferenz)
app.use('/api', require('./src/routes/settings'));

// Wissensgraph: Beziehungen zwischen Seiten visualisieren
app.use('/api', require('./src/routes/graph'));

// Organisationen: Mandantenverwaltung und Organisationseinheiten
app.use('/api', require('./src/routes/organizations'));

// Spaces: Arbeitsbereiche innerhalb einer Organisation
app.use('/api', require('./src/routes/spaces'));

// Ordner: Hierarchische Strukturierung von Seiten in Spaces
app.use('/api', require('./src/routes/folders'));

// Veroeffentlichung: Seiten extern publizieren und freigeben
app.use('/api', require('./src/routes/publishing'));

// Privater Bereich: Persoenlicher Arbeitsbereich je Benutzer
app.use('/api', require('./src/routes/private-space'));

// Kommentare: Seitenkommentare mit Thread-Unterstuetzung
app.use('/api', require('./src/routes/comments'));

// Benachrichtigungen: In-App-Benachrichtigungen
app.use('/api', require('./src/routes/notifications'));

// Vorlagen: Seitenvorlagen fuer schnelle Seitenerstellung
app.use('/api', require('./src/routes/templates'));

// Admin-Dashboard: Analytics und Statistiken
app.use('/api', require('./src/routes/dashboard'));

// ============================================================
// 404-Handler fuer nicht gefundene API-Endpunkte
// Faengt alle Anfragen ab, die keiner Route zugeordnet werden konnten.
// ============================================================
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ============================================================
// Globaler Error-Handler
// Faengt unbehandelte Fehler aus allen Middleware- und Routen-Funktionen ab.
// Gibt dem Client eine generische Fehlermeldung zurueck, ohne interne Details preiszugeben.
// ============================================================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// Nexora-Server starten
// Stellt zuerst die Datenbankverbindung her (mit Retry-Logik),
// und startet dann den HTTP-Server auf dem konfigurierten Port.
// ============================================================
async function startServer() {
  // Datenbankverbindung mit automatischem Retry aufbauen
  const connected = await connectWithRetry();
  if (!connected) {
    // Ohne Datenbank kann der Server nicht arbeiten – Prozess beenden
    logger.fatal('Exiting – database unavailable');
    process.exit(1);
  }

  // HTTP-Server auf allen Netzwerk-Interfaces (0.0.0.0) starten
  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT, ldap: LDAP_ENABLED }, `Nexora API-Server laeuft auf Port ${PORT}`);
    logger.info(`LDAP: ${LDAP_ENABLED ? 'enabled' : 'disabled'} | RBAC: active (admin, auditor, user)`);
  });

  // ── Graceful Shutdown ──
  const gracefulShutdown = async (signal) => {
    logger.info(`${signal} empfangen – Graceful Shutdown`);
    server.close(async () => {
      logger.info('HTTP-Server geschlossen');
      const pool = getPool();
      if (pool) await pool.end();
      logger.info('DB-Pool geschlossen');
      process.exit(0);
    });
    // Falls server.close() hängt, nach 10s forciert beenden
    setTimeout(() => {
      logger.error('Shutdown Timeout – erzwinge Beendigung');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Nexora-Anwendung starten – ruft die async startServer-Funktion auf
startServer();

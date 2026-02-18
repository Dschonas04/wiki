/**
 * Security-Middleware (Helmet, Compression, Rate Limiting, CSRF)
 * 
 * Diese Datei konfiguriert die gesamte Sicherheitsinfrastruktur der Express-Anwendung.
 * Sie umfasst:
 * 
 * - HTTP-Sicherheitsheader (via Helmet)
 * - Antwort-Komprimierung (via Compression)
 * - Ratenbegrenzung für API-Endpunkte (allgemein, Auth-spezifisch, Schreiboperationen)
 * - Cookie-Parsing
 * - CSRF-Schutz über benutzerdefinierte Header-Prüfung
 * - Request-Logging mit Zeitstempel und Antwortzeit
 * 
 * Die Funktionen werden beim Start der Anwendung einmalig aufgerufen,
 * um die gesamte Middleware-Kette zu konfigurieren.
 */

// Helmet: Setzt verschiedene HTTP-Header zum Schutz vor bekannten Web-Schwachstellen
const helmet = require('helmet');

// CORS: Cross-Origin Resource Sharing Konfiguration
const cors = require('cors');

// Compression: Komprimiert HTTP-Antworten (gzip/deflate) für bessere Performance
const compression = require('compression');

// Rate Limiting: Begrenzt die Anzahl der Anfragen pro Zeitfenster pro IP-Adresse
const rateLimit = require('express-rate-limit');

// Cookie-Parser: Liest Cookies aus eingehenden HTTP-Anfragen
const cookieParser = require('cookie-parser');

// Express-Framework: Wird hier für den JSON-Body-Parser benötigt
const express = require('express');

// Strukturierter Logger (pino)
const logger = require('../logger');

/**
 * Konfiguriert alle Sicherheits-Middleware für die Express-Anwendung
 * 
 * Diese Funktion registriert nacheinander alle sicherheitsrelevanten Middleware:
 * Proxy-Vertrauen, Helmet, Komprimierung, Cookie-Parsing, Rate-Limiting,
 * JSON-Body-Parsing, CSRF-Schutz und Request-Logging.
 * 
 * @param {Object} app - Die Express-Anwendungsinstanz
 * @returns {void}
 */
function setupSecurity(app) {
  // Proxy-Vertrauen aktivieren (nötig hinter Reverse-Proxys wie Nginx)
  // Wert 1 bedeutet: Dem ersten Proxy in der Kette wird vertraut
  app.set('trust proxy', 1);

  // Helmet konfigurieren: Sicherheitsheader setzen
  // Content-Security-Policy und Cross-Origin-Embedder-Policy sind deaktiviert,
  // da sie mit der Wiki-Anwendung und eingebetteten Inhalten kollidieren können
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // HTTP-Antwortkomprimierung aktivieren (reduziert Bandbreite)
  app.use(compression());

  // CORS-Konfiguration: Nur Same-Origin und konfigurierte Origins erlauben
  // Wenn CORS_ORIGIN nicht gesetzt ist, wird der Request-Origin erlaubt
  // (sicher, da Nginx als Reverse-Proxy die einzige Zugangsschicht ist)
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : null;
  app.use(cors({
    origin: (origin, callback) => {
      // Anfragen ohne Origin (Same-Origin, Server-zu-Server) erlauben
      if (!origin) return callback(null, true);
      // Wenn keine Origins konfiguriert: Request-Origin erlauben (hinter Reverse-Proxy)
      if (!allowedOrigins) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('CORS not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-Requested-With'],
  }));

  // Cookie-Parser aktivieren (stellt req.cookies bereit)
  app.use(cookieParser());

  // Allgemeines API Rate-Limit
  // Beschränkt alle API-Anfragen auf maximal 300 Anfragen pro 15 Minuten pro IP
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,       // Zeitfenster: 15 Minuten (in Millisekunden)
    max: 300,                         // Maximale Anzahl an Anfragen pro Zeitfenster
    standardHeaders: true,            // Rate-Limit-Informationen in Standard-Headern senden
    legacyHeaders: false,             // Alte X-RateLimit-Header deaktivieren
    message: { error: 'Too many requests. Please try again later.' },
  }));

  // JSON-Body-Parser mit Größenbeschränkung von 1 MB
  // Verhindert übermäßig große Anfragekörper (Schutz vor DoS-Angriffen)
  app.use(express.json({ limit: '1mb' }));

  // CSRF-Schutz
  // Prüft bei schreibenden Anfragen (POST, PUT, DELETE, PATCH) auf den
  // benutzerdefinierten Header 'x-requested-with'. Dieser Header kann nicht
  // von einfachen Cross-Origin-Anfragen gesendet werden und bietet so
  // einen grundlegenden Schutz gegen CSRF-Angriffe.
  app.use('/api', (req, res, next) => {
    // Nur schreibende HTTP-Methoden prüfen
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      // Fehlender Sicherheitsheader → Anfrage ablehnen
      if (!req.headers['x-requested-with']) {
        return res.status(403).json({ error: 'Forbidden: missing security header' });
      }
    }
    // Lesende Anfragen (GET, HEAD, OPTIONS) werden durchgelassen
    next();
  });

  // Request-Logging
  // Protokolliert jede eingehende Anfrage mit Zeitstempel, HTTP-Methode,
  // URL, Statuscode, Antwortzeit und Request-ID
  app.use((req, res, next) => {
    // Startzeitpunkt der Anfrage für die Berechnung der Antwortzeit
    const start = Date.now();

    // Request-ID aus dem Header lesen (wird z.B. vom Reverse-Proxy gesetzt)
    const rid = req.headers['x-request-id'] || '-';

    // Event-Listener: Wird ausgelöst, wenn die Antwort vollständig gesendet wurde
    res.on('finish', () => {
      // Antwortzeit in Millisekunden berechnen
      const ms = Date.now() - start;
      // Strukturierte Log-Ausgabe mit pino
      logger.info({
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseTime: ms,
        requestId: rid,
        ip: req.headers['x-real-ip'] || req.ip,
      }, `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    });

    // Weiter zur nächsten Middleware
    next();
  });
}

// Rate Limiter für Auth-Endpunkte
// Striktere Begrenzung für Login- und Registrierungsendpunkte:
// Maximal 20 Anfragen pro 15 Minuten, um Brute-Force-Angriffe zu erschweren
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,       // Zeitfenster: 15 Minuten
  max: 20,                         // Nur 20 Versuche erlaubt
  standardHeaders: true,            // Standard-Rate-Limit-Header senden
  legacyHeaders: false,             // Alte Header deaktivieren
  message: { error: 'Too many login attempts. Please try again later.' },
});

// Rate Limiter für Schreiboperationen
// Begrenzung für Endpunkte, die Daten verändern (Erstellen, Bearbeiten, Löschen):
// Maximal 60 Anfragen pro 15 Minuten pro IP-Adresse
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,       // Zeitfenster: 15 Minuten
  max: 60,                         // Maximal 60 Schreibvorgänge
  standardHeaders: true,            // Standard-Rate-Limit-Header senden
  legacyHeaders: false,             // Alte Header deaktivieren
  message: { error: 'Too many write requests. Please try again later.' },
});

// Exportiert die Sicherheitskonfiguration und die spezialisierten Rate-Limiter
module.exports = { setupSecurity, authLimiter, writeLimiter };

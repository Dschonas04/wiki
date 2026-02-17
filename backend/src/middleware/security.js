/**
 * Security-Middleware (Helmet, Compression, Rate Limiting, CSRF)
 */

const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const express = require('express');

function setupSecurity(app) {
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(compression());
  app.use(cookieParser());

  // Allgemeines API Rate-Limit
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  }));

  app.use(express.json({ limit: '1mb' }));

  // CSRF-Schutz
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      if (!req.headers['x-requested-with']) {
        return res.status(403).json({ error: 'Forbidden: missing security header' });
      }
    }
    next();
  });

  // Request-Logging
  app.use((req, res, next) => {
    const start = Date.now();
    const rid = req.headers['x-request-id'] || '-';
    res.on('finish', () => {
      const ms = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms) [${rid}]`);
    });
    next();
  });
}

// Rate Limiter für Auth-Endpunkte
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// Rate Limiter für Schreiboperationen
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many write requests. Please try again later.' },
});

module.exports = { setupSecurity, authLimiter, writeLimiter };

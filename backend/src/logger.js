/**
 * Strukturierter Logger für Nexora (basierend auf pino)
 *
 * Stellt einen zentralen Logger bereit, der in allen Modulen verwendet wird.
 * Im Production-Modus wird JSON-Logging ausgegeben (für Log-Aggregation),
 * in der Entwicklung wird ein lesbares Format verwendet.
 */

const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino/file',
      options: { destination: 1 }, // stdout
    },
  }),
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: 'nexora-api' },
});

module.exports = logger;

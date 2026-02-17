/**
 * Wiki API Server – Einstiegspunkt
 * Modulare Architektur mit getrennten Routen und Middleware
 */

const express = require('express');

const { PORT, LDAP_ENABLED } = require('./src/config');
const { connectWithRetry, getPool } = require('./src/database');
const { setupSecurity } = require('./src/middleware/security');

// Express App
const app = express();

// Security & Middleware
setupSecurity(app);

// Routen einbinden
app.use('/api', require('./src/routes/auth'));
app.use('/api', require('./src/routes/users'));
app.use('/api', require('./src/routes/pages'));
app.use('/api', require('./src/routes/approvals'));
app.use('/api', require('./src/routes/attachments'));
app.use('/api', require('./src/routes/tags'));
app.use('/api', require('./src/routes/favorites'));
app.use('/api', require('./src/routes/sharing'));
app.use('/api', require('./src/routes/trash'));
app.use('/api', require('./src/routes/health'));
app.use('/api', require('./src/routes/audit'));
app.use('/api', require('./src/routes/settings'));
app.use('/api', require('./src/routes/graph'));

// 404 für nicht gefundene API-Endpunkte
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Globaler Error-Handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Server starten
async function startServer() {
  const connected = await connectWithRetry();
  if (!connected) {
    console.error('Exiting – database unavailable');
    process.exit(1);
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API server on port ${PORT}`);
    console.log(`LDAP: ${LDAP_ENABLED ? 'enabled' : 'disabled'} | RBAC: active (admin, editor, viewer)`);
  });
}

process.on('SIGTERM', async () => {
  console.log('SIGTERM');
  const pool = getPool();
  if (pool) await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT');
  const pool = getPool();
  if (pool) await pool.end();
  process.exit(0);
});

startServer();

/**
 * Benutzereinstellungen (Theme etc.)
 *
 * Diese Datei verwaltet die persönlichen Einstellungen der Benutzer.
 * Aktuell wird nur das Theme (Farbschema) unterstützt, aber die Struktur
 * ist erweiterbar für weitere Benutzereinstellungen in der Zukunft.
 *
 * Die Einstellungen werden in der Tabelle 'user_settings' als Schlüssel-Wert-Paare
 * gespeichert (setting_key / setting_value), was eine flexible Erweiterung ermöglicht.
 *
 * Endpunkte:
 *   GET /settings/theme – Aktuelles Theme des Benutzers abrufen
 *   PUT /settings/theme – Theme des Benutzers setzen oder ändern
 *
 * Berechtigungen:
 *   - Beide Endpunkte erfordern nur Authentifizierung (jeder Benutzer kann
 *     seine eigenen Einstellungen verwalten)
 *
 * Verfügbare Themes: light, dark, orange, midnight, contrast, soft-dark
 *
 * Datenbanktabellen: user_settings
 */

const express = require('express');
const router = express.Router();

// Datenbankverbindung importieren
const { getPool } = require('../database');
// Authentifizierungs-Middleware
const { authenticate, requirePermission } = require('../middleware/auth');
const logger = require('../logger');
// Rate-Limiter für Schreiboperationen zum Schutz vor Missbrauch
const { writeLimiter } = require('../middleware/security');
// E-Mail-Dienst für Konfigurationstest
const { testEmailConfig } = require('../helpers/email');

// Liste der gültigen Theme-Bezeichnungen zur Validierung
const VALID_THEMES = ['light', 'dark', 'orange', 'midnight', 'contrast', 'soft-dark'];

// ============================================================================
// GET /settings/theme – Aktuelles Theme des Benutzers abrufen
// Liest das gespeicherte Theme des authentifizierten Benutzers aus der Datenbank.
// Falls kein Theme gespeichert ist, wird 'light' als Standardwert zurückgegeben.
// Erfordert: Authentifizierung
// Antwort: { theme: string }
// ============================================================================
router.get('/settings/theme', authenticate, async (req, res) => {
  // Datenbankpool holen
  const pool = getPool();
  // Prüfen, ob die Datenbank verbunden ist
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    // Theme-Einstellung des aktuellen Benutzers aus der Datenbank lesen
    const result = await pool.query(
      "SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = 'theme'",
      [req.user.id]
    );
    // Falls ein Theme gespeichert ist, dieses verwenden; sonst 'light' als Standard
    const theme = result.rows.length > 0 ? result.rows[0].setting_value : 'light';
    // Theme als JSON zurückgeben
    res.json({ theme });
  } catch (err) {
    // Fehlerbehandlung bei Datenbankfehlern
    logger.error({ err }, 'Error getting theme');
    res.status(500).json({ error: 'Failed to get theme' });
  }
});

// ============================================================================
// PUT /settings/theme – Theme des Benutzers setzen oder ändern
// Speichert das gewählte Theme für den authentifizierten Benutzer.
// Verwendet UPSERT (INSERT ... ON CONFLICT DO UPDATE), um sowohl das
// Erstellen als auch das Aktualisieren in einer Abfrage zu erledigen.
// Erfordert: Authentifizierung + Rate-Limiter
// Body: { theme: string } – Muss eines der gültigen Themes sein
// Antwort: { theme: string }
// ============================================================================
router.put('/settings/theme', authenticate, writeLimiter, async (req, res) => {
  // Datenbankpool holen
  const pool = getPool();
  // Prüfen, ob die Datenbank verbunden ist
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  // Theme aus dem Request-Body extrahieren
  const { theme } = req.body;
  // Validierung: Theme muss angegeben sein und in der Liste der gültigen Themes enthalten sein
  if (!theme || !VALID_THEMES.includes(theme)) {
    return res.status(400).json({ error: `Invalid theme. Valid: ${VALID_THEMES.join(', ')}` });
  }
  try {
    // Theme in der Datenbank speichern (UPSERT: Erstellen oder Aktualisieren)
    // Bei einem Konflikt (gleicher Benutzer + gleicher Schlüssel) wird der Wert aktualisiert
    // Der Zeitstempel updated_at wird dabei auf die aktuelle Zeit gesetzt
    await pool.query(
      `INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at)
       VALUES ($1, 'theme', $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, theme]
    );
    // Gespeichertes Theme als Bestätigung zurückgeben
    res.json({ theme });
  } catch (err) {
    // Fehlerbehandlung bei Datenbankfehlern
    logger.error({ err }, 'Error setting theme');
    res.status(500).json({ error: 'Failed to save theme' });
  }
});

// ============================================================================
// GET /settings/language – Aktuelle Sprache des Benutzers abrufen
// ============================================================================
const VALID_LANGUAGES = ['de', 'en'];

router.get('/settings/language', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const result = await pool.query(
      "SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = 'language'",
      [req.user.id]
    );
    const language = result.rows.length > 0 ? result.rows[0].setting_value : 'de';
    res.json({ language });
  } catch (err) {
    logger.error({ err }, 'Error getting language');
    res.status(500).json({ error: 'Failed to get language' });
  }
});

// ============================================================================
// PUT /settings/language – Sprache des Benutzers setzen oder ändern
// ============================================================================
router.put('/settings/language', authenticate, writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const { language } = req.body;
  if (!language || !VALID_LANGUAGES.includes(language)) {
    return res.status(400).json({ error: `Invalid language. Valid: ${VALID_LANGUAGES.join(', ')}` });
  }
  try {
    await pool.query(
      `INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at)
       VALUES ($1, 'language', $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, language]
    );
    res.json({ language });
  } catch (err) {
    logger.error({ err }, 'Error setting language');
    res.status(500).json({ error: 'Failed to save language' });
  }
});

// ============================================================================
// PUT /settings/profile – Anzeigename ändern (jeder User)
// ============================================================================
router.put('/settings/profile', authenticate, writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const { displayName } = req.body;
  if (!displayName || !displayName.trim()) {
    return res.status(400).json({ error: 'Display name is required' });
  }
  if (displayName.trim().length > 255) {
    return res.status(400).json({ error: 'Display name too long (max 255 characters)' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET display_name = $1 WHERE id = $2 RETURNING id, username, display_name, email, global_role',
      [displayName.trim(), req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Error updating profile');
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ============================================================================
// GET /settings/admin – Admin-Einstellungen laden (nur Admin)
// ============================================================================
router.get('/settings/admin', authenticate, requirePermission('users.manage'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const result = await pool.query('SELECT setting_key, setting_value FROM admin_settings');
    const settings = {};
    for (const row of result.rows) {
      settings[row.setting_key] = row.setting_value;
    }
    // Passwort nicht im Klartext senden
    if (settings['email.pass']) settings['email.pass'] = '••••••••';
    res.json(settings);
  } catch (err) {
    logger.error({ err }, 'Error loading admin settings');
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// ============================================================================
// PUT /settings/admin – Admin-Einstellungen speichern (nur Admin)
// ============================================================================
router.put('/settings/admin', authenticate, requirePermission('users.manage'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Settings object required' });
  }

  // Nur erlaubte Einstellungs-Schlüssel akzeptieren (Allowlist)
  const ALLOWED_ADMIN_KEYS = [
    'email.enabled', 'email.host', 'email.port', 'email.secure',
    'email.user', 'email.pass', 'email.from',
    'backup.enabled', 'backup.last_run', 'backup.retention_days',
  ];

  const invalidKeys = Object.keys(settings).filter(k => !ALLOWED_ADMIN_KEYS.includes(k));
  if (invalidKeys.length > 0) {
    return res.status(400).json({ error: `Invalid setting keys: ${invalidKeys.join(', ')}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(settings)) {
      // Passwort-Platzhalter nicht überschreiben
      if (key === 'email.pass' && value === '••••••••') continue;
      await client.query(
        `INSERT INTO admin_settings (setting_key, setting_value, updated_by, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP`,
        [key, String(value), req.user.id]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Settings saved' });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Error saving admin settings');
    res.status(500).json({ error: 'Failed to save settings' });
  } finally {
    client.release();
  }
});

// ============================================================================
// POST /settings/admin/test-email – E-Mail-Konfiguration testen (nur Admin)
// ============================================================================
router.post('/settings/admin/test-email', authenticate, requirePermission('users.manage'), async (req, res) => {
  try {
    const result = await testEmailConfig();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// POST /settings/admin/backup – DB-Backup auslösen (nur Admin)
// ============================================================================
router.post('/settings/admin/backup', authenticate, requirePermission('users.manage'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    // Prüfen ob Backup aktiviert ist
    const configResult = await pool.query(
      "SELECT setting_value FROM admin_settings WHERE setting_key = 'backup.enabled'"
    );
    const isEnabled = configResult.rows.length > 0 && configResult.rows[0].setting_value === 'true';
    if (!isEnabled) {
      return res.status(400).json({ error: 'Backup feature is not enabled. Enable it in admin settings first.' });
    }

    // Backup-Zeitstempel setzen (kein echtes pg_dump in der App – nur Markierung)
    await pool.query(
      `INSERT INTO admin_settings (setting_key, setting_value, updated_by, updated_at)
       VALUES ('backup.last_run', $1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP`,
      [new Date().toISOString(), req.user.id]
    );

    res.json({
      message: 'Backup initiated',
      timestamp: new Date().toISOString(),
      note: 'In production, this would trigger pg_dump via a backup service. Currently this marks the backup timestamp.',
    });
  } catch (err) {
    logger.error({ err }, 'Error triggering backup');
    res.status(500).json({ error: 'Failed to trigger backup' });
  }
});

// Router-Modul exportieren, damit es in der Hauptanwendung eingebunden werden kann
module.exports = router;

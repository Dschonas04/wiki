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
// Authentifizierungs-Middleware (jeder angemeldete Benutzer hat Zugriff)
const { authenticate } = require('../middleware/auth');
// Rate-Limiter für Schreiboperationen zum Schutz vor Missbrauch
const { writeLimiter } = require('../middleware/security');

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
    console.error('Error getting theme:', err.message);
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
    console.error('Error setting theme:', err.message);
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
    console.error('Error getting language:', err.message);
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
    console.error('Error setting language:', err.message);
    res.status(500).json({ error: 'Failed to save language' });
  }
});

// Router-Modul exportieren, damit es in der Hauptanwendung eingebunden werden kann
module.exports = router;

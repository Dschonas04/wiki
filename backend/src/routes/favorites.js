/**
 * Favoriten-Routen (Lesezeichen für Wiki-Seiten)
 *
 * Diese Datei verwaltet die Favoriten-Funktionalität, mit der Benutzer
 * Wiki-Seiten als Lesezeichen markieren können. Jeder Benutzer hat seine
 * eigene Favoritenliste, die unabhängig von anderen Benutzern ist.
 *
 * Endpunkte:
 *   GET  /favorites              - Alle Favoriten des aktuellen Benutzers auflisten
 *   POST /favorites/:pageId      - Favorit umschalten (hinzufügen oder entfernen)
 *   GET  /favorites/:pageId/check - Prüfen, ob eine Seite als Favorit markiert ist
 *
 * Besonderheiten:
 *   - Toggle-Mechanismus: Ist die Seite bereits ein Favorit, wird sie entfernt;
 *     andernfalls wird sie hinzugefügt
 *   - Erfordert nur eine gültige Authentifizierung (keine speziellen Berechtigungen)
 *   - Favoriten werden mit Seitendetails (Titel, Aktualisierungsdatum) zurückgegeben
 */

const express = require('express');
const router = express.Router();

// Abhängigkeiten importieren
const { getPool } = require('../database');
const { authenticate } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const logger = require('../logger');

// ============================================================================
// GET /favorites - Alle Favoriten des Benutzers auflisten
// ============================================================================
// Gibt alle als Favorit markierten Seiten des aktuell angemeldeten Benutzers zurück.
// Enthält Seiteninformationen (Titel, Aktualisierungsdatum) und das Datum der Favoritenmarkierung.
// Sortiert nach Favoritenmarkierung (neueste zuerst).
router.get('/favorites', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    // Favoriten des Benutzers laden, verknüpft mit den Seitendaten und dem Aktualisierungs-Benutzer
    const result = await pool.query(`
      SELECT p.id, p.title, p.updated_at, p.created_at, f.created_at AS favorited_at,
             u.username AS updated_by_name
      FROM wiki_favorites f
      JOIN wiki_pages p ON f.page_id = p.id
      LEFT JOIN users u ON p.updated_by = u.id
      WHERE f.user_id = $1 AND p.deleted_at IS NULL
      ORDER BY f.created_at DESC`, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Error getting favorites');
    res.status(500).json({ error: 'Failed to retrieve favorites' });
  }
});

// ============================================================================
// POST /favorites/:pageId - Favorit umschalten (Toggle)
// ============================================================================
// Schaltet den Favoriten-Status einer Seite für den aktuellen Benutzer um.
// Ist die Seite bereits ein Favorit, wird sie aus den Favoriten entfernt.
// Ist die Seite noch kein Favorit, wird sie den Favoriten hinzugefügt.
// Gibt zurück, ob die Seite nach dem Toggle ein Favorit ist ({ favorited: true/false }).
// Rate-Limiting schützt vor übermäßigen Anfragen.
router.post('/favorites/:pageId', authenticate, writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Seiten-ID aus der URL validieren
  const pageId = parseInt(req.params.pageId);
  if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

  try {
    // Prüfen, ob die Seite bereits als Favorit markiert ist
    const existing = await pool.query('SELECT 1 FROM wiki_favorites WHERE user_id = $1 AND page_id = $2', [req.user.id, pageId]);

    if (existing.rows.length > 0) {
      // Favorit existiert bereits -> entfernen
      await pool.query('DELETE FROM wiki_favorites WHERE user_id = $1 AND page_id = $2', [req.user.id, pageId]);
      res.json({ favorited: false });
    } else {
      // Favorit existiert noch nicht -> hinzufügen
      await pool.query('INSERT INTO wiki_favorites (user_id, page_id) VALUES ($1, $2)', [req.user.id, pageId]);
      res.json({ favorited: true });
    }
  } catch (err) {
    logger.error({ err }, 'Error toggling favorite');
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// ============================================================================
// GET /favorites/:pageId/check - Favoritenstatus prüfen
// ============================================================================
// Prüft, ob eine bestimmte Seite vom aktuellen Benutzer als Favorit markiert ist.
// Wird im Frontend verwendet, um den Favoriten-Button korrekt anzuzeigen
// (ausgefüllt vs. nicht ausgefüllt).
// Gibt { favorited: true } oder { favorited: false } zurück.
router.get('/favorites/:pageId/check', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Seiten-ID aus der URL validieren
  const pageId = parseInt(req.params.pageId);
  if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

  try {
    // In der Datenbank prüfen, ob ein Eintrag für diesen Benutzer und diese Seite existiert
    const result = await pool.query('SELECT 1 FROM wiki_favorites WHERE user_id = $1 AND page_id = $2', [req.user.id, pageId]);

    // Ergebnis: favorited ist true, wenn mindestens ein Eintrag gefunden wurde
    res.json({ favorited: result.rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check favorite' });
  }
});

// Router exportieren für die Verwendung in der Hauptanwendung
module.exports = router;

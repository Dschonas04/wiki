/**
 * Tag-Routen (Erstellen, Löschen, Seiten-Tags verwalten)
 *
 * Diese Datei verwaltet die Tags (Schlagwörter) im Wiki-System.
 * Tags können an Wiki-Seiten angehängt werden, um sie zu kategorisieren und
 * die Navigation zu erleichtern. Jeder Tag hat einen Namen und eine Farbe.
 *
 * Endpunkte:
 *   GET    /tags             - Alle verfügbaren Tags auflisten (mit Seitenanzahl)
 *   POST   /tags             - Neuen Tag erstellen
 *   DELETE /tags/:id         - Tag löschen (nur Ersteller oder Admin)
 *   GET    /pages/:id/tags   - Tags einer bestimmten Seite abrufen
 *   PUT    /pages/:id/tags   - Tags einer Seite setzen (ersetzen)
 *
 * Tag-Sichtbarkeit:
 *   - Admins sehen alle Tags
 *   - Andere Benutzer sehen nur eigene Tags und Tags ohne Ersteller
 *
 * Tag-Farben:
 *   - Standardfarbe: #6366f1 (Indigo), wenn keine gültige Farbe angegeben wird
 *   - Farbvalidierung über die isValidColor-Hilfsfunktion
 */

const express = require('express');
const router = express.Router();

// Abhängigkeiten importieren
const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { isValidColor } = require('../helpers/validators');
const logger = require('../logger');

// ============================================================================
// GET /tags - Alle Tags auflisten
// ============================================================================
// Gibt alle verfügbaren Tags zurück, inklusive der Anzahl verknüpfter Seiten.
// Admins sehen alle Tags; andere Benutzer sehen nur eigene und unzugeordnete Tags.
// Die Ergebnisse werden alphabetisch nach Tag-Name sortiert.
router.get('/tags', authenticate, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Prüfen, ob der Benutzer ein Administrator ist
  const isAdmin = req.user.global_role === 'admin';

  try {
    // Tags mit Seitenanzahl laden (LEFT JOIN für Tags ohne Seiten)
    // Nicht-Admins sehen nur eigene Tags oder Tags ohne Ersteller (created_by IS NULL)
    const result = await pool.query(`
      SELECT t.*, COUNT(pt.page_id) AS page_count FROM wiki_tags t
      LEFT JOIN wiki_page_tags pt ON t.id = pt.tag_id
      WHERE ${isAdmin ? 'TRUE' : '(t.created_by = $1 OR t.created_by IS NULL)'}
      GROUP BY t.id ORDER BY t.name ASC`, isAdmin ? [] : [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Error listing tags');
    res.status(500).json({ error: 'Failed to retrieve tags' });
  }
});

// ============================================================================
// POST /tags - Neuen Tag erstellen
// ============================================================================
// Erstellt einen neuen Tag mit dem angegebenen Namen und einer optionalen Farbe.
// Der Tag-Name wird in Kleinbuchstaben normalisiert und darf maximal 100 Zeichen lang sein.
// Doppelte Tag-Namen pro Benutzer sind nicht erlaubt (Unique-Constraint).
// Standardfarbe: #6366f1 (Indigo), wenn keine gültige Farbe angegeben wird.
// Erfordert die Berechtigung 'pages.create'.
router.post('/tags', authenticate, requirePermission('pages.create'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Tag-Name und optionale Farbe aus dem Request-Body extrahieren
  const { name, color } = req.body;

  // Eingabevalidierung: Tag-Name ist Pflichtfeld
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tag name is required.' });

  // Maximale Länge des Tag-Namens prüfen
  if (name.trim().length > 100) return res.status(400).json({ error: 'Tag name must be 100 characters or less.' });

  // Farbe validieren und ggf. Standardfarbe verwenden
  const tagColor = color && isValidColor(color) ? color : '#6366f1';

  try {
    // Neuen Tag in die Datenbank einfügen (Name wird in Kleinbuchstaben gespeichert)
    const result = await pool.query(
      'INSERT INTO wiki_tags (name, color, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name.trim().toLowerCase(), tagColor, req.user.id]
    );

    // Erstellten Tag mit Status 201 (Created) zurückgeben
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // Fehlercode 23505 = Unique-Constraint-Verletzung (Tag-Name existiert bereits)
    if (err.code === '23505') return res.status(409).json({ error: 'You already have a tag with this name.' });
    logger.error({ err }, 'Error creating tag');
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// ============================================================================
// DELETE /tags/:id - Tag löschen
// ============================================================================
// Löscht einen Tag dauerhaft aus der Datenbank.
// Nur der Tag-Ersteller oder ein Administrator darf den Tag löschen.
// Verknüpfungen zu Seiten (wiki_page_tags) werden durch die Datenbank-Kaskade entfernt.
// Erfordert die Berechtigung 'pages.create'.
router.delete('/tags/:id', authenticate, requirePermission('pages.create'), writeLimiter, async (req, res) => {
  const pool = getPool();

  // Tag-ID aus der URL validieren
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid tag ID' });

  try {
    // Tag aus der Datenbank laden
    const tag = await pool.query('SELECT * FROM wiki_tags WHERE id = $1', [id]);
    if (tag.rows.length === 0) return res.status(404).json({ error: 'Tag not found' });

    // Berechtigungsprüfung: Nur der Tag-Ersteller oder ein Admin darf löschen
    if (req.user.global_role !== 'admin' && tag.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the tag owner or an admin can delete this tag' });
    }

    // Tag aus der Datenbank löschen
    const result = await pool.query('DELETE FROM wiki_tags WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tag not found' });

    res.json({ message: 'Tag deleted' });
  } catch (err) {
    logger.error({ err }, 'Error deleting tag');
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// ============================================================================
// GET /pages/:id/tags - Tags einer Seite abrufen
// ============================================================================
// Gibt alle Tags zurück, die einer bestimmten Seite zugeordnet sind.
// Admins sehen alle Tags; andere Benutzer sehen nur eigene und unzugeordnete Tags.
// Ergebnisse werden alphabetisch nach Tag-Name sortiert.
// Erfordert die Berechtigung 'pages.read'.
router.get('/pages/:id/tags', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();

  // Seiten-ID aus der URL validieren
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });

  const isAdmin = req.user.global_role === 'admin';

  try {
    // Tags der Seite laden (JOIN über die Verknüpfungstabelle wiki_page_tags)
    // Nicht-Admins sehen nur eigene Tags oder Tags ohne Ersteller
    const result = await pool.query(
      `SELECT t.* FROM wiki_tags t JOIN wiki_page_tags pt ON t.id = pt.tag_id
       WHERE pt.page_id = $1 AND ${isAdmin ? 'TRUE' : '(t.created_by = $2 OR t.created_by IS NULL)'}
       ORDER BY t.name ASC`, isAdmin ? [id] : [id, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Error getting page tags');
    res.status(500).json({ error: 'Failed to retrieve page tags' });
  }
});

// ============================================================================
// PUT /pages/:id/tags - Tags einer Seite setzen
// ============================================================================
// Setzt die Tags einer Seite auf die angegebene Liste von Tag-IDs.
// Vorgehensweise:
//   1. Alle bestehenden Tag-Verknüpfungen des Benutzers für diese Seite löschen
//   2. Neue Tag-Verknüpfungen für die angegebenen Tag-IDs erstellen
// Erwartet im Request-Body: tagIds (Array von Tag-IDs).
// ON CONFLICT DO NOTHING verhindert Duplikate bei gleichzeitigen Anfragen.
// Erfordert die Berechtigung 'pages.edit'.
router.put('/pages/:id/tags', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();

  // Seiten-ID aus der URL validieren
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });

  // Tag-IDs aus dem Request-Body extrahieren und validieren
  const { tagIds } = req.body;
  if (!Array.isArray(tagIds)) return res.status(400).json({ error: 'tagIds must be an array.' });

  const isAdmin = req.user.global_role === 'admin';

  try {
    // Transaktion für atomare Tag-Aktualisierung
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Schritt 1: Alle bestehenden Tag-Verknüpfungen des Benutzers für diese Seite löschen
      await client.query(
        `DELETE FROM wiki_page_tags WHERE page_id = $1 AND tag_id IN (
          SELECT id FROM wiki_tags WHERE ${isAdmin ? 'TRUE' : '(created_by = $2 OR created_by IS NULL)'}
        )`, isAdmin ? [id] : [id, req.user.id]
      );

      // Schritt 2: Neue Tag-Verknüpfungen erstellen (ON CONFLICT DO NOTHING für Idempotenz)
      for (const tagId of tagIds) {
        await client.query('INSERT INTO wiki_page_tags (page_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, tagId]);
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // Aktualisierte Tag-Liste der Seite laden und zurückgeben
    const result = await pool.query(
      `SELECT t.* FROM wiki_tags t JOIN wiki_page_tags pt ON t.id = pt.tag_id
       WHERE pt.page_id = $1 AND ${isAdmin ? 'TRUE' : '(t.created_by = $2 OR t.created_by IS NULL)'}
       ORDER BY t.name`, isAdmin ? [id] : [id, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Error setting page tags');
    res.status(500).json({ error: 'Failed to update page tags' });
  }
});

// Router exportieren für die Verwendung in der Hauptanwendung
module.exports = router;

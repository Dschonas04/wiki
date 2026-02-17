/**
 * Papierkorb (Soft Delete, Wiederherstellen, Endgültig löschen)
 *
 * Diese Datei verwaltet den Papierkorb des Wiki-Systems. Seiten werden nicht sofort
 * endgültig gelöscht, sondern zunächst in den Papierkorb verschoben (Soft Delete).
 * Von dort können sie wiederhergestellt oder endgültig gelöscht werden.
 *
 * Endpunkte:
 *   GET    /trash              – Alle Seiten im Papierkorb auflisten
 *   POST   /trash/:id/restore  – Eine Seite aus dem Papierkorb wiederherstellen
 *   DELETE /trash/:id           – Eine Seite endgültig und unwiderruflich löschen
 *   DELETE /pages/:id           – Eine Seite in den Papierkorb verschieben (Soft Delete)
 *
 * Berechtigungen:
 *   - Auflisten erfordert 'pages.read'
 *   - Wiederherstellen erfordert 'pages.edit' + Eigentümer oder Admin
 *   - Endgültiges Löschen erfordert 'pages.delete'
 *   - Soft Delete erfordert 'pages.delete'
 *
 * Hinweis: Admins sehen alle gelöschten Seiten, normale Benutzer nur ihre eigenen.
 *
 * Datenbanktabellen: wiki_pages, users, audit_log
 */

const express = require('express');
const router = express.Router();

// Datenbankverbindung importieren
const { getPool } = require('../database');
// Authentifizierungs- und Berechtigungs-Middleware
const { authenticate, requirePermission } = require('../middleware/auth');
// Rate-Limiter für Schreiboperationen zum Schutz vor Missbrauch
const { writeLimiter } = require('../middleware/security');
// Hilfsfunktion für das Audit-Logging (Protokollierung von Aktionen)
const { auditLog } = require('../helpers/audit');
// Hilfsfunktion zum Ermitteln der IP-Adresse des Benutzers
const { getIp } = require('../helpers/utils');

// ============================================================================
// GET /trash – Alle Seiten im Papierkorb auflisten
// Admins sehen alle gelöschten Seiten, normale Benutzer nur ihre eigenen.
// Gibt Titel, Löschdatum, Sichtbarkeit und die Namen von Ersteller/Löscher zurück.
// Erfordert: Authentifizierung + 'pages.read'-Berechtigung
// ============================================================================
router.get('/trash', authenticate, requirePermission('pages.read'), async (req, res) => {
  // Datenbankpool holen
  const pool = getPool();
  // Prüfen, ob die Datenbank verbunden ist
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  // Prüfen, ob der aktuelle Benutzer ein Admin ist (bestimmt die Sichtbarkeit)
  const isAdmin = req.user.global_role === 'admin';
  try {
    // Gelöschte Seiten abfragen
    // Admins sehen alle (WHERE TRUE), normale Benutzer nur ihre eigenen (WHERE created_by = $1)
    // LEFT JOINs, um die Benutzernamen von Ersteller und Löschendem aufzulösen
    const result = await pool.query(`
      SELECT p.id, p.title, p.deleted_at, p.workflow_status,
             u1.username AS created_by_name, u2.username AS deleted_by_name
      FROM wiki_pages p
      LEFT JOIN users u1 ON p.created_by = u1.id
      LEFT JOIN users u2 ON p.deleted_by = u2.id
      WHERE p.deleted_at IS NOT NULL AND ${isAdmin ? 'TRUE' : 'p.created_by = $1'}
      ORDER BY p.deleted_at DESC`, isAdmin ? [] : [req.user.id]);
    // Liste der gelöschten Seiten als JSON zurückgeben
    res.json(result.rows);
  } catch (err) {
    // Fehlerbehandlung bei Datenbankfehlern
    console.error('Error getting trash:', err.message);
    res.status(500).json({ error: 'Failed to retrieve trash' });
  }
});

// ============================================================================
// POST /trash/:id/restore – Seite aus dem Papierkorb wiederherstellen
// Setzt deleted_at und deleted_by auf NULL, sodass die Seite wieder sichtbar ist.
// Nur der Seiteneigentümer oder ein Admin darf eine Seite wiederherstellen.
// Erfordert: Authentifizierung + 'pages.edit'-Berechtigung + Rate-Limiter
// Parameter: id (Seiten-ID als URL-Parameter)
// ============================================================================
router.post('/trash/:id/restore', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  // Datenbankpool holen
  const pool = getPool();
  // Prüfen, ob die Datenbank verbunden ist
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  // Seiten-ID aus den URL-Parametern parsen
  const id = parseInt(req.params.id);
  // Validierung: Seiten-ID muss eine gültige Zahl sein
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    // Zuerst prüfen, ob die Seite im Papierkorb existiert
    const page = await pool.query('SELECT * FROM wiki_pages WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
    // Seite nicht im Papierkorb gefunden
    if (page.rows.length === 0) return res.status(404).json({ error: 'Page not found in trash' });
    // Berechtigungsprüfung: Nur der Eigentümer oder ein Admin darf wiederherstellen
    if (req.user.global_role !== 'admin' && page.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the page owner or an admin can restore this page' });
    }
    // Seite wiederherstellen: Lösch-Markierungen entfernen
    const result = await pool.query('UPDATE wiki_pages SET deleted_at = NULL, deleted_by = NULL WHERE id = $1 RETURNING *', [id]);
    // Audit-Log-Eintrag für die Wiederherstellung erstellen
    await auditLog(req.user.id, req.user.username, 'restore_from_trash', 'page', id, { title: result.rows[0].title }, getIp(req));
    // Erfolgsmeldung und wiederhergestellte Seite zurückgeben
    res.json({ message: 'Page restored', page: result.rows[0] });
  } catch (err) {
    // Fehlerbehandlung bei Datenbankfehlern
    console.error('Error restoring page:', err.message);
    res.status(500).json({ error: 'Failed to restore page' });
  }
});

// ============================================================================
// DELETE /trash/:id – Seite endgültig und unwiderruflich löschen
// Entfernt die Seite komplett aus der Datenbank. Nur Seiten im Papierkorb
// (deleted_at IS NOT NULL) können endgültig gelöscht werden.
// ACHTUNG: Diese Aktion kann nicht rückgängig gemacht werden!
// Erfordert: Authentifizierung + 'pages.delete'-Berechtigung + Rate-Limiter
// Parameter: id (Seiten-ID als URL-Parameter)
// ============================================================================
router.delete('/trash/:id', authenticate, requirePermission('pages.delete'), writeLimiter, async (req, res) => {
  // Datenbankpool holen
  const pool = getPool();
  // Prüfen, ob die Datenbank verbunden ist
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  // Seiten-ID aus den URL-Parametern parsen
  const id = parseInt(req.params.id);
  // Validierung: Seiten-ID muss eine gültige Zahl sein
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    // Seite endgültig aus der Datenbank löschen (nur wenn sie im Papierkorb ist)
    const result = await pool.query('DELETE FROM wiki_pages WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *', [id]);
    // Prüfen, ob eine Seite tatsächlich gelöscht wurde
    if (result.rows.length === 0) return res.status(404).json({ error: 'Page not found in trash' });
    // Audit-Log-Eintrag für die endgültige Löschung erstellen
    await auditLog(req.user.id, req.user.username, 'permanent_delete_page', 'page', id, { title: result.rows[0].title }, getIp(req));
    // Erfolgsmeldung zurückgeben
    res.json({ message: 'Page permanently deleted' });
  } catch (err) {
    // Fehlerbehandlung bei Datenbankfehlern
    console.error('Error permanently deleting page:', err.message);
    res.status(500).json({ error: 'Failed to permanently delete page' });
  }
});

// ============================================================================
// DELETE /pages/:id – Seite in den Papierkorb verschieben (Soft Delete)
// Die Seite wird nicht wirklich gelöscht, sondern mit einem Zeitstempel
// (deleted_at) und der ID des löschenden Benutzers (deleted_by) markiert.
// Dadurch kann sie später wiederhergestellt werden.
// Erfordert: Authentifizierung + 'pages.delete'-Berechtigung + Rate-Limiter
// Parameter: id (Seiten-ID als URL-Parameter)
// ============================================================================
router.delete('/pages/:id', authenticate, requirePermission('pages.delete'), writeLimiter, async (req, res) => {
  // Datenbankpool holen
  const pool = getPool();
  // Prüfen, ob die Datenbank verbunden ist
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  // Seiten-ID aus den URL-Parametern parsen
  const id = parseInt(req.params.id);
  // Validierung: Seiten-ID muss eine gültige Zahl sein
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    // Soft Delete: Löschzeitpunkt und löschenden Benutzer setzen
    // Nur Seiten, die noch nicht gelöscht sind (deleted_at IS NULL), können verschoben werden
    const result = await pool.query(
      'UPDATE wiki_pages SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING *',
      [req.user.id, id]
    );
    // Prüfen, ob die Seite gefunden und verschoben wurde
    if (result.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    // Audit-Log-Eintrag für das Verschieben in den Papierkorb erstellen
    await auditLog(req.user.id, req.user.username, 'delete_page', 'page', id, { title: result.rows[0].title }, getIp(req));
    // Erfolgsmeldung und verschobene Seite zurückgeben
    res.json({ message: 'Page moved to trash', page: result.rows[0] });
  } catch (err) {
    // Fehlerbehandlung bei Datenbankfehlern
    console.error('Error deleting page:', err.message);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

// Router-Modul exportieren, damit es in der Hauptanwendung eingebunden werden kann
module.exports = router;

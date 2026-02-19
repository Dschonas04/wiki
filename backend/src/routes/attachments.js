/**
 * Dateianhang-Routen (Upload, Download, Auflisten, Löschen)
 *
 * Diese Datei verwaltet Dateianhänge, die an Wiki-Seiten angehängt werden können.
 * Dateien werden auf dem Server-Dateisystem im 'uploads'-Verzeichnis gespeichert,
 * während die Metadaten in der Datenbank gesichert werden.
 *
 * Endpunkte:
 *   POST   /pages/:id/attachments     - Datei an eine Seite hochladen
 *   GET    /pages/:id/attachments     - Anhänge einer Seite auflisten
 *   GET    /attachments/:id/download  - Einzelnen Anhang herunterladen
 *   DELETE /attachments/:id           - Anhang löschen (nur Uploader oder Admin)
 *
 * Datei-Upload:
 *   - Maximale Dateigröße: 25 MB
 *   - Erlaubte MIME-Typen: Dokumente (PDF, Word, Excel, PowerPoint),
 *     Textdateien (Plain, CSV, Markdown, HTML, JSON, XML),
 *     Bilder (PNG, JPEG, GIF, WebP, SVG), Archive (ZIP, TAR, GZIP)
 *   - Dateinamen werden mit zufälligen Hex-Strings ersetzt (Sicherheit)
 *
 * Sicherheit:
 *   - Dateityp-Validierung über MIME-Type-Whitelist
 *   - Größenbeschränkung über multer
 *   - Zugriffskontrolle über canAccessPage-Hilfsfunktion
 *   - Nur der Uploader oder ein Admin kann einen Anhang löschen
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer'); // Middleware für den Datei-Upload
const router = express.Router();

// Abhängigkeiten importieren
const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { auditLog } = require('../helpers/audit');
const { getIp, canAccessPage } = require('../helpers/utils');
const logger = require('../logger');

// Upload-Verzeichnis definieren und bei Bedarf erstellen
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Whitelist der erlaubten MIME-Typen für den Datei-Upload
const ALLOWED_MIME_TYPES = [
  // Dokumentenformate
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Textformate
  'text/plain', 'text/csv', 'text/markdown',
  // Bildformate
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  // Archivformate
  'application/zip', 'application/x-tar', 'application/gzip',
  // Strukturierte Datenformate
  'application/json', 'application/xml', 'text/xml', 'text/html',
];

// Maximale Dateigröße: 25 Megabyte
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Multer-Speicherkonfiguration: Dateien werden mit zufälligen Namen gespeichert
const storage = multer.diskStorage({
  // Zielverzeichnis für hochgeladene Dateien
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  // Dateiname: 16 zufällige Bytes (32 Hex-Zeichen) + Originalendung
  filename: (req, file, cb) => {
    const unique = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

// Multer-Upload-Instanz mit Speicher-, Größen- und Typbeschränkungen
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  // Dateityp-Filter: Nur erlaubte MIME-Typen zulassen
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

// ============================================================================
// POST /pages/:id/attachments - Datei hochladen
// ============================================================================
// Lädt eine Datei hoch und verknüpft sie mit der angegebenen Wiki-Seite.
// Die Datei wird über multer verarbeitet (Feld: 'file').
// Bei Fehler (ungültiger Typ, zu groß, Seite nicht gefunden) wird die Datei gelöscht.
// Erfordert die Berechtigung 'pages.edit'.
router.post('/pages/:id/attachments', authenticate, requirePermission('pages.edit'), writeLimiter, (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Seiten-ID aus der URL validieren
  const pageId = parseInt(req.params.id);
  if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

  // Multer-Upload ausführen (einzelne Datei, Feld 'file')
  upload.single('file')(req, res, async (uploadErr) => {
    // Upload-Fehler behandeln
    if (uploadErr) {
      if (uploadErr.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (max 25 MB)' });
      return res.status(400).json({ error: uploadErr.message });
    }

    // Prüfen, ob eine Datei übermittelt wurde
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    try {
      // Prüfen, ob die Seite existiert
      const page = await pool.query('SELECT id FROM wiki_pages WHERE id = $1', [pageId]);
      if (page.rows.length === 0) {
        // Seite nicht gefunden: Hochgeladene Datei vom Dateisystem entfernen
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Page not found' });
      }

      // Anhang-Metadaten in der Datenbank speichern
      const result = await pool.query(
        `INSERT INTO wiki_attachments (page_id, filename, original_name, mime_type, size_bytes, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [pageId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id]
      );

      // Upload im Audit-Log protokollieren
      await auditLog(req.user.id, req.user.username, 'upload_attachment', 'attachment', result.rows[0].id,
        { page_id: pageId, filename: req.file.originalname, size: req.file.size }, getIp(req));

      // Anhang-Metadaten mit Status 201 (Created) zurückgeben
      res.status(201).json(result.rows[0]);
    } catch (err) {
      // Bei Fehler: Hochgeladene Datei vom Dateisystem entfernen (Aufräumen)
      if (req.file) fs.unlink(req.file.path, () => {});
      logger.error({ err }, 'Error uploading attachment');
      res.status(500).json({ error: 'Failed to upload attachment' });
    }
  });
});

// ============================================================================
// GET /pages/:id/attachments - Anhänge einer Seite auflisten
// ============================================================================
// Gibt alle Dateianhänge einer bestimmten Seite zurück.
// Enthält den Benutzernamen des Uploaders.
// Sortiert nach Erstellungsdatum (neueste zuerst).
// Zugriffsprüfung über die canAccessPage-Hilfsfunktion.
router.get('/pages/:id/attachments', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Seiten-ID aus der URL validieren
  const pageId = parseInt(req.params.id);
  if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

  try {
    // Zugriffsberechtigung auf die Seite prüfen
    if (!(await canAccessPage(pageId, req.user))) return res.status(404).json({ error: 'Page not found' });

    // Alle Anhänge der Seite mit Uploader-Informationen laden
    const result = await pool.query(`
      SELECT a.*, u.username AS uploaded_by_name FROM wiki_attachments a
      LEFT JOIN users u ON a.uploaded_by = u.id WHERE a.page_id = $1
      ORDER BY a.created_at DESC`, [pageId]);
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Error listing attachments');
    res.status(500).json({ error: 'Failed to list attachments' });
  }
});

// ============================================================================
// GET /attachments/:id/download - Anhang herunterladen
// ============================================================================
// Sendet die Datei des angegebenen Anhangs als Download an den Client.
// Prüft, ob die Datei sowohl in der Datenbank als auch auf dem Dateisystem existiert.
// Setzt die korrekten Content-Type und Content-Disposition HTTP-Header.
// Erfordert die Berechtigung 'pages.read'.
router.get('/attachments/:id/download', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Anhang-ID aus der URL validieren
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid attachment ID' });

  try {
    // Anhang-Metadaten aus der Datenbank laden
    const result = await pool.query('SELECT * FROM wiki_attachments WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });

    const att = result.rows[0];

    // Zugriffsberechtigung auf die zugehörige Seite prüfen
    if (!(await canAccessPage(att.page_id, req.user))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Path-Traversal-Schutz und Dateiexistenzprüfung
    const filePath = path.join(UPLOAD_DIR, path.basename(att.filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

    // HTTP-Header für den Dateidownload setzen
    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.original_name)}"`);
    res.setHeader('Content-Length', att.size_bytes);

    // Datei als Stream an den Client senden
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    logger.error({ err }, 'Error downloading attachment');
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

// ============================================================================
// DELETE /attachments/:id - Anhang löschen
// ============================================================================
// Löscht einen Dateianhang sowohl aus der Datenbank als auch vom Dateisystem.
// Nur der Uploader oder ein Administrator darf den Anhang löschen.
// Die Löschung wird im Audit-Log protokolliert.
// Erfordert die Berechtigung 'pages.edit'.
router.delete('/attachments/:id', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  // Anhang-ID aus der URL validieren
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid attachment ID' });

  try {
    // Anhang-Metadaten aus der Datenbank laden
    const result = await pool.query('SELECT * FROM wiki_attachments WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });

    const att = result.rows[0];

    // Berechtigungsprüfung: Nur der Uploader oder ein Admin darf löschen
    if (req.user.global_role !== 'admin' && att.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the uploader or an admin can delete this attachment' });
    }

    // Anhang aus der Datenbank löschen
    await pool.query('DELETE FROM wiki_attachments WHERE id = $1', [id]);

    // Datei vom Dateisystem entfernen (path.basename verhindert Path-Traversal)
    const filePath = path.join(UPLOAD_DIR, path.basename(att.filename));
    fs.unlink(filePath, () => {});

    // Löschung im Audit-Log protokollieren
    await auditLog(req.user.id, req.user.username, 'delete_attachment', 'attachment', id,
      { page_id: att.page_id, filename: att.original_name }, getIp(req));

    res.json({ message: 'Attachment deleted' });
  } catch (err) {
    logger.error({ err }, 'Error deleting attachment');
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// Router exportieren für die Verwendung in der Hauptanwendung
module.exports = router;

/**
 * Dateianhänge (Upload, Download, Löschen)
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

const { getPool } = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { auditLog } = require('../helpers/audit');
const { getIp, canAccessPage } = require('../helpers/utils');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/markdown',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/zip', 'application/x-tar', 'application/gzip',
  'application/json', 'application/xml', 'text/xml', 'text/html',
];

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

// Upload
router.post('/pages/:id/attachments', authenticate, requirePermission('pages.edit'), writeLimiter, (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const pageId = parseInt(req.params.id);
  if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });

  upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) {
      if (uploadErr.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (max 25 MB)' });
      return res.status(400).json({ error: uploadErr.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    try {
      const page = await pool.query('SELECT id FROM wiki_pages WHERE id = $1', [pageId]);
      if (page.rows.length === 0) {
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Page not found' });
      }
      const result = await pool.query(
        `INSERT INTO wiki_attachments (page_id, filename, original_name, mime_type, size_bytes, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [pageId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id]
      );
      await auditLog(req.user.id, req.user.username, 'upload_attachment', 'attachment', result.rows[0].id,
        { page_id: pageId, filename: req.file.originalname, size: req.file.size }, getIp(req));
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      console.error('Error uploading attachment:', err.message);
      res.status(500).json({ error: 'Failed to upload attachment' });
    }
  });
});

// Auflisten
router.get('/pages/:id/attachments', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const pageId = parseInt(req.params.id);
  if (isNaN(pageId)) return res.status(400).json({ error: 'Invalid page ID' });
  try {
    if (!(await canAccessPage(pageId, req.user))) return res.status(404).json({ error: 'Page not found' });
    const result = await pool.query(`
      SELECT a.*, u.username AS uploaded_by_name FROM wiki_attachments a
      LEFT JOIN users u ON a.uploaded_by = u.id WHERE a.page_id = $1
      ORDER BY a.created_at DESC`, [pageId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing attachments:', err.message);
    res.status(500).json({ error: 'Failed to list attachments' });
  }
});

// Download
router.get('/attachments/:id/download', authenticate, requirePermission('pages.read'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid attachment ID' });
  try {
    const result = await pool.query('SELECT * FROM wiki_attachments WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });
    const att = result.rows[0];
    const filePath = path.join(UPLOAD_DIR, att.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.original_name)}"`);
    res.setHeader('Content-Length', att.size_bytes);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('Error downloading attachment:', err.message);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

// Löschen
router.delete('/attachments/:id', authenticate, requirePermission('pages.edit'), writeLimiter, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid attachment ID' });
  try {
    const result = await pool.query('SELECT * FROM wiki_attachments WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });
    const att = result.rows[0];
    if (req.user.role !== 'admin' && att.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the uploader or an admin can delete this attachment' });
    }
    await pool.query('DELETE FROM wiki_attachments WHERE id = $1', [id]);
    const filePath = path.join(UPLOAD_DIR, att.filename);
    fs.unlink(filePath, () => {});
    await auditLog(req.user.id, req.user.username, 'delete_attachment', 'attachment', id,
      { page_id: att.page_id, filename: att.original_name }, getIp(req));
    res.json({ message: 'Attachment deleted' });
  } catch (err) {
    console.error('Error deleting attachment:', err.message);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

module.exports = router;

/**
 * Nexora – E-Mail-Benachrichtigungsdienst
 *
 * Versendet E-Mail-Benachrichtigungen über Nodemailer.
 * Die Konfiguration erfolgt über Umgebungsvariablen oder Admin-Einstellungen.
 *
 * Unterstützte Events:
 *   - Kommentar auf eigener Seite
 *   - Veröffentlichungsantrag genehmigt/abgelehnt
 *   - Seite geteilt
 */

const nodemailer = require('nodemailer');
const logger = require('../logger');
const { getPool } = require('../database');

/**
 * Escapet HTML-Sonderzeichen, um HTML-Injection in E-Mails zu verhindern.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let transporter = null;

/**
 * Lädt E-Mail-Konfiguration aus der Datenbank (admin_settings)
 */
async function getEmailConfig() {
  const pool = getPool();
  if (!pool) return null;

  try {
    const result = await pool.query(
      "SELECT setting_key, setting_value FROM admin_settings WHERE setting_key LIKE 'email.%'"
    );
    const config = {};
    for (const row of result.rows) {
      config[row.setting_key.replace('email.', '')] = row.setting_value;
    }
    return config;
  } catch {
    return null;
  }
}

/**
 * Erstellt oder aktualisiert den Nodemailer-Transporter
 */
async function getTransporter() {
  const config = await getEmailConfig();
  if (!config || config.enabled !== 'true' || !config.host || !config.from) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: config.host,
    port: parseInt(config.port || '587'),
    secure: config.secure === 'true',
    auth: config.user ? {
      user: config.user,
      pass: config.pass || '',
    } : undefined,
  });

  return transporter;
}

/**
 * Sendet eine E-Mail-Benachrichtigung
 */
async function sendNotificationEmail(to, subject, htmlBody) {
  try {
    const transport = await getTransporter();
    if (!transport) return false;

    const config = await getEmailConfig();
    if (!config) return false;

    await transport.sendMail({
      from: config.from,
      to,
      subject: `[Nexora] ${subject}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="border-bottom: 3px solid #6366f1; padding-bottom: 16px; margin-bottom: 24px;">
            <h2 style="margin: 0; color: #1a1a2e;">Nexora</h2>
          </div>
          ${htmlBody}
          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
            Diese Benachrichtigung wurde automatisch von Nexora gesendet.
          </div>
        </div>
      `,
    });

    logger.info({ to, subject }, 'E-Mail-Benachrichtigung gesendet');
    return true;
  } catch (err) {
    logger.error({ err, to, subject }, 'E-Mail-Versand fehlgeschlagen');
    return false;
  }
}

/**
 * Benachrichtigt den Seitenersteller über einen neuen Kommentar
 */
async function notifyComment(pageId, commentAuthorName, commentContent) {
  const pool = getPool();
  if (!pool) return;

  try {
    const pageResult = await pool.query(
      `SELECT p.title, u.email, u.display_name, u.id as owner_id
       FROM wiki_pages p JOIN users u ON p.created_by = u.id
       WHERE p.id = $1 AND u.email IS NOT NULL`, [pageId]
    );
    if (pageResult.rows.length === 0) return;

    const { title, email, display_name, owner_id } = pageResult.rows[0];

    // Nicht den Kommentarautor selbst benachrichtigen
    const authorResult = await pool.query('SELECT id FROM users WHERE display_name = $1 OR username = $1', [commentAuthorName]);
    if (authorResult.rows.length > 0 && authorResult.rows[0].id === owner_id) return;

    await sendNotificationEmail(
      email,
      `Neuer Kommentar auf "${escapeHtml(title)}"`,
      `<p>Hallo ${escapeHtml(display_name)},</p>
       <p><strong>${escapeHtml(commentAuthorName)}</strong> hat einen Kommentar auf deiner Seite <strong>"${escapeHtml(title)}"</strong> hinterlassen:</p>
       <blockquote style="border-left: 3px solid #6366f1; padding-left: 12px; color: #4b5563; margin: 16px 0;">
         ${escapeHtml(commentContent)}
       </blockquote>`
    );
  } catch (err) {
    logger.error({ err }, 'Fehler beim Senden der Kommentar-Benachrichtigung');
  }
}

/**
 * Benachrichtigt über Publish-Request-Statusänderung
 */
async function notifyPublishStatus(requestId, status, reviewComment) {
  const pool = getPool();
  if (!pool) return;

  try {
    const result = await pool.query(
      `SELECT pr.*, u.email, u.display_name, p.title
       FROM publish_requests pr
       JOIN users u ON pr.requested_by = u.id
       JOIN wiki_pages p ON pr.page_id = p.id
       WHERE pr.id = $1 AND u.email IS NOT NULL`, [requestId]
    );
    if (result.rows.length === 0) return;

    const { email, display_name, title } = result.rows[0];
    const statusText = status === 'approved' ? 'genehmigt ✅' : status === 'rejected' ? 'abgelehnt ❌' : 'Änderungen angefragt 🔄';

    await sendNotificationEmail(
      email,
      `Veröffentlichungsantrag ${statusText}: "${escapeHtml(title)}"`,
      `<p>Hallo ${escapeHtml(display_name)},</p>
       <p>Dein Veröffentlichungsantrag für <strong>"${escapeHtml(title)}"</strong> wurde <strong>${statusText}</strong>.</p>
       ${reviewComment ? `<p><strong>Kommentar:</strong> ${escapeHtml(reviewComment)}</p>` : ''}`
    );
  } catch (err) {
    logger.error({ err }, 'Fehler beim Senden der Publish-Benachrichtigung');
  }
}

/**
 * Testet die E-Mail-Konfiguration
 */
async function testEmailConfig() {
  try {
    const transport = await getTransporter();
    if (!transport) return { success: false, error: 'E-Mail ist nicht konfiguriert oder deaktiviert' };

    await transport.verify();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendNotificationEmail,
  notifyComment,
  notifyPublishStatus,
  testEmailConfig,
  getEmailConfig,
};

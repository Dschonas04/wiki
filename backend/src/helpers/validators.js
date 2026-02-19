/**
 * Validierungsfunktionen
 * 
 * Diese Datei enthält Funktionen zur Eingabevalidierung für die Wiki-Anwendung.
 * Sie prüfen Benutzereingaben auf Korrektheit und Sicherheit, bevor diese
 * in der Datenbank gespeichert werden.
 * 
 * Validiert werden:
 * - Passwörter (Mindestlänge, Buchstaben, Zahlen, Sonderzeichen)
 * - Wiki-Seiten-Eingaben (Titel und Inhalt)
 * - Farbwerte (Hexadezimal-Format)
 * 
 * Jede Validierungsfunktion gibt ein Array mit Fehlermeldungen zurück.
 * Ein leeres Array bedeutet: Die Eingabe ist gültig.
 */

/**
 * Validiert ein Passwort anhand von Sicherheitsrichtlinien
 * 
 * Prüft folgende Kriterien:
 * 1. Mindestlänge von 8 Zeichen
 * 2. Mindestens ein Buchstabe (Groß- oder Kleinbuchstabe)
 * 3. Mindestens eine Ziffer (0-9)
 * 4. Mindestens ein Sonderzeichen (kein Buchstabe und keine Ziffer)
 * 
 * @param {string} password - Das zu validierende Passwort
 * @returns {string[]} Array mit Fehlermeldungen; leer wenn das Passwort gültig ist
 */
function validatePassword(password) {
  // Sammelt alle Validierungsfehler
  const errors = [];

  // Prüfung 1: Passwort muss vorhanden sein und mindestens 8 Zeichen lang
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters.');
  else {
    // Prüfung 2: Mindestens ein Buchstabe (a-z oder A-Z) erforderlich
    if (!/[a-zA-Z]/.test(password)) errors.push('Password must contain at least one letter.');

    // Prüfung 3: Mindestens eine Ziffer (0-9) erforderlich
    if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number.');

    // Prüfung 4: Mindestens ein Sonderzeichen (alles außer Buchstaben und Ziffern)
    if (!/[^a-zA-Z0-9]/.test(password)) errors.push('Password must contain at least one special character.');
  }

  // Gibt die gesammelten Fehlermeldungen zurück (leeres Array = gültig)
  return errors;
}

/**
 * Validiert die Eingaben für eine Wiki-Seite (Titel und Inhalt)
 * 
 * Prüft folgende Kriterien:
 * - Titel: Muss vorhanden sein, darf nicht leer sein, maximal 255 Zeichen
 * - Inhalt: Muss vorhanden sein, darf nicht leer sein, maximal 100.000 Zeichen
 * 
 * @param {string} title - Der Seitentitel
 * @param {string} content - Der Seiteninhalt (Markdown oder HTML)
 * @returns {string[]} Array mit Fehlermeldungen; leer wenn die Eingaben gültig sind
 */
function validatePageInput(title, content) {
  // Sammelt alle Validierungsfehler
  const errors = [];

  // Titel-Validierung: Muss vorhanden und nicht leer sein
  if (!title || !title.trim()) errors.push('Title is required.');
  // Titel-Längenprüfung: Maximal 255 Zeichen (entspricht VARCHAR(255) in der Datenbank)
  else if (title.trim().length > 255) errors.push('Title must be 255 characters or less.');

  // Inhalt-Validierung: Muss vorhanden und nicht leer sein
  if (!content || !content.trim()) errors.push('Content is required.');
  // Inhalt-Längenprüfung: Maximal 100.000 Zeichen (Schutz vor übermäßig großen Seiten)
  else if (content.length > 100000) errors.push('Content must be 100 000 characters or less.');

  // Gibt die gesammelten Fehlermeldungen zurück (leeres Array = gültig)
  return errors;
}

/**
 * Prüft, ob ein Farbwert ein gültiger 6-stelliger Hexadezimal-Farbcode ist
 * 
 * Akzeptiert nur Farben im Format '#RRGGBB' (z.B. '#FF5733', '#00a1b2').
 * Kurzformen wie '#FFF' oder Farbnamen wie 'red' werden nicht akzeptiert.
 * 
 * @param {string} color - Der zu prüfende Farbwert
 * @returns {boolean} true wenn der Farbwert gültig ist, false wenn nicht
 */
function isValidColor(color) {
  // Regulärer Ausdruck: '#' gefolgt von genau 6 hexadezimalen Zeichen (0-9, a-f, A-F)
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

// Exportiert alle Validierungsfunktionen für die Verwendung in Routen
module.exports = { validatePassword, validatePageInput, isValidColor, sanitizeHtml };

const sanitizeHtmlLib = require('sanitize-html');

/**
 * Bereinigt HTML-Inhalte serverseitig (Defense-in-Depth).
 * Verwendet die sanitize-html-Bibliothek für robuste DOM-basierte Sanitisierung,
 * die gegen alle bekannten XSS-Vektoren (SVG, MathML, verschachtelte Tags etc.) schützt.
 * Die primäre Sanitisierung erfolgt im Frontend via DOMPurify.
 *
 * @param {string} html - Der zu bereinigende HTML-String
 * @returns {string} Bereinigter HTML-String
 */
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return html;
  return sanitizeHtmlLib(html, {
    allowedTags: sanitizeHtmlLib.defaults.allowedTags.concat([
      'img', 'figure', 'figcaption', 'video', 'audio', 'source',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'details', 'summary', 'mark', 'del', 'ins', 'sub', 'sup',
      'pre', 'code', 'blockquote', 'hr', 'br', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'input',
    ]),
    allowedAttributes: {
      ...sanitizeHtmlLib.defaults.allowedAttributes,
      '*': ['class', 'id', 'style', 'data-*'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      a: ['href', 'title', 'target', 'rel'],
      video: ['src', 'controls', 'width', 'height', 'autoplay', 'muted'],
      audio: ['src', 'controls', 'autoplay', 'muted'],
      source: ['src', 'type'],
      td: ['colspan', 'rowspan', 'style'],
      th: ['colspan', 'rowspan', 'style'],
      input: ['type', 'checked', 'disabled'],
      code: ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
    },
    // input nur als Task-List-Checkbox erlauben
    exclusiveFilter: (frame) => {
      if (frame.tag === 'input' && frame.attribs.type !== 'checkbox') return true;
      return false;
    },
  });
}

/**
 * JWT Token-Verwaltung
 * 
 * Dieses Modul kapselt die gesamte JWT (JSON Web Token) Logik:
 *  - Erstellung signierter Tokens mit Benutzerinformationen
 *  - Setzen sicherer HTTP-Only-Cookies fuer die Token-Uebertragung
 * 
 * JWT-Tokens werden als zustandsloser Authentifizierungsmechanismus verwendet.
 * Der Token enthaelt die Benutzer-ID, den Benutzernamen, die Rolle und den
 * Anzeigenamen. Er wird bei jeder API-Anfrage im Cookie mitgesendet und
 * von der Auth-Middleware verifiziert.
 */

// jsonwebtoken-Bibliothek fuer Token-Erstellung und -Verifizierung
const jwt = require('jsonwebtoken');

// Konfigurationswerte aus zentraler config.js
const { JWT_SECRET, JWT_EXPIRES, COOKIE_NAME, COOKIE_SECURE } = require('../config');

/**
 * Erstellt einen signierten JWT-Token fuer den angegebenen Benutzer.
 * 
 * Der Token enthaelt folgende Claims (Payload-Daten):
 *  - id: Die Datenbank-ID des Benutzers
 *  - username: Der eindeutige Benutzername
 *  - role: Die Rolle des Benutzers (admin, editor, viewer)
 *  - displayName: Der Anzeigename fuer die Benutzeroberflaeche
 * 
 * @param {Object} user - Das Benutzerobjekt aus der Datenbank
 * @param {number} user.id - Die Benutzer-ID
 * @param {string} user.username - Der Benutzername
 * @param {string} user.role - Die Benutzerrolle
 * @param {string} [user.display_name] - Der Anzeigename (DB-Format mit Unterstrich)
 * @param {string} [user.displayName] - Der Anzeigename (alternatives Format)
 * @returns {string} Der signierte JWT-Token als String
 */
function signToken(user) {
  return jwt.sign(
    // Payload: Die im Token gespeicherten Benutzerdaten
    { id: user.id, username: user.username, global_role: user.global_role, displayName: user.display_name || user.displayName },
    // Geheimer Schluessel zum Signieren (nur der Server kennt diesen)
    JWT_SECRET,
    // Optionen: Token-Ablaufzeit (z.B. '8h' fuer 8 Stunden)
    { expiresIn: JWT_EXPIRES }
  );
}

/**
 * Setzt den JWT-Token als sicheres HTTP-Cookie in der HTTP-Antwort.
 * 
 * Sicherheitsmerkmale des Cookies:
 *  - httpOnly: Cookie ist nicht per JavaScript (document.cookie) zugaenglich -> XSS-Schutz
 *  - secure: Cookie wird nur ueber HTTPS gesendet (in Produktion)
 *  - sameSite: Schutz vor CSRF-Angriffen ('strict' bei HTTPS, 'lax' bei HTTP)
 *  - maxAge: Cookie laeuft nach 8 Stunden ab (passend zur JWT-Gueltigkeit)
 *  - path: Cookie gilt fuer alle Pfade der Domain
 * 
 * @param {Object} res - Das Express-Response-Objekt
 * @param {string} token - Der signierte JWT-Token
 */
function setTokenCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,                              // Kein Zugriff ueber JavaScript (XSS-Schutz)
    secure: COOKIE_SECURE,                       // Nur ueber HTTPS senden (Produktion)
    sameSite: COOKIE_SECURE ? 'strict' : 'lax', // CSRF-Schutz: strict bei HTTPS, lax bei HTTP
    maxAge: 8 * 60 * 60 * 1000,                 // 8 Stunden in Millisekunden
    path: '/',                                   // Cookie gilt fuer alle Pfade
  });
}

// Funktionen exportieren fuer Verwendung in Auth-Routen und Middleware
module.exports = { signToken, setTokenCookie };

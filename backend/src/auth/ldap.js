/**
 * LDAP-Authentifizierung
 * 
 * Dieses Modul implementiert die Authentifizierung gegen einen externen
 * LDAP-Verzeichnisdienst (z.B. OpenLDAP, Active Directory).
 * 
 * Ablauf der LDAP-Authentifizierung:
 *  1. Service-Bind: Verbindung zum LDAP-Server mit Service-Konto
 *  2. Benutzersuche: Suche nach dem Benutzer anhand des Benutzernamens
 *  3. User-Bind: Authentifizierung mit den Zugangsdaten des Benutzers
 *  4. Rollenzuordnung: Bestimmung der Wiki-Rolle anhand der LDAP-Gruppenmitgliedschaften
 * 
 * Die Funktion gibt bei Erfolg ein Benutzerobjekt zurueck, das fuer die
 * Erstellung oder Aktualisierung des lokalen Benutzerkontos verwendet wird.
 */

// ldapjs-Bibliothek fuer LDAP-Protokoll-Kommunikation
const ldap = require('ldapjs');

// LDAP-Konfigurationswerte aus zentraler config.js
const {
  LDAP_ENABLED, LDAP_URL, LDAP_BIND_DN, LDAP_BIND_PW,
  LDAP_SEARCH_BASE, LDAP_SEARCH_FILTER, LDAP_ROLE_MAP,
} = require('../config');

/**
 * Authentifiziert einen Benutzer gegen den LDAP-Verzeichnisdienst.
 * 
 * Verwendet einen zweistufigen Bind-Prozess:
 *  1. Service-Bind mit technischem Konto (LDAP_BIND_DN) fuer die Benutzersuche
 *  2. User-Bind mit den eingegebenen Zugangsdaten zur Passwortpruefung
 * 
 * @param {string} username - Der eingegebene Benutzername
 * @param {string} password - Das eingegebene Passwort
 * @returns {Promise<Object>} Aufgeloestes Promise mit Benutzerobjekt:
 *   - username: Der LDAP-uid oder der eingegebene Benutzername
 *   - displayName: Anzeigename aus LDAP (cn oder displayName)
 *   - email: E-Mail-Adresse aus dem LDAP-Verzeichnis
 *   - role: Die zugeordnete Wiki-Rolle (admin, editor, viewer)
 * @throws {Error} Bei deaktiviertem LDAP, Verbindungsfehlern oder ungueltigen Zugangsdaten
 */
function ldapAuthenticate(username, password) {
  return new Promise((resolve, reject) => {
    // Pruefen, ob LDAP ueberhaupt aktiviert ist
    if (!LDAP_ENABLED) return reject(new Error('LDAP not enabled'));

    // LDAP-Client erstellen mit Server-URL und Timeout-Einstellungen
    const client = ldap.createClient({
      url: LDAP_URL,            // URL des LDAP-Servers (z.B. ldap://ldap:389)
      connectTimeout: 5000,     // Max. 5 Sekunden fuer Verbindungsaufbau
      timeout: 5000,            // Max. 5 Sekunden fuer Operationen
    });

    // Fehlerbehandlung fuer LDAP-Verbindungsprobleme
    client.on('error', (err) => {
      console.error('LDAP error:', err.message);
      reject(new Error('LDAP connection failed'));
    });

    // ============================================================
    // Schritt 1: Service-Bind
    // Verbindung zum LDAP-Server mit dem technischen Service-Konto.
    // Dieses Konto hat Leserechte, um nach Benutzern zu suchen.
    // ============================================================
    client.bind(LDAP_BIND_DN, LDAP_BIND_PW, (err) => {
      if (err) { client.destroy(); return reject(new Error('LDAP service bind failed')); }

      // ============================================================
      // Schritt 2: Benutzersuche
      // Suche nach dem Benutzer im Verzeichnis anhand des Benutzernamens.
      // Der Suchfilter wird mit dem bereinigten Benutzernamen gefuellt.
      // Sonderzeichen werden entfernt, um LDAP-Injection zu verhindern.
      // ============================================================

      // Benutzernamen bereinigen: Klammern, Backslashes und Wildcards entfernen (LDAP-Injection-Schutz)
      const filter = LDAP_SEARCH_FILTER.replace('{{username}}', username.replace(/[()\\*]/g, ''));

      // Suchoptionen: Unterhalb der Basis suchen, gewuenschte Attribute anfordern
      const searchOpts = { scope: 'sub', filter, attributes: ['uid', 'cn', 'mail', 'displayName', 'memberOf'] };

      client.search(LDAP_SEARCH_BASE, searchOpts, (err, res) => {
        if (err) { client.destroy(); return reject(new Error('LDAP search failed')); }

        // Variable fuer den gefundenen Benutzereintrag
        let userEntry = null;

        // ============================================================
        // Suchergebnis verarbeiten
        // Fuer jeden gefundenen Eintrag werden die relevanten Attribute
        // extrahiert (uid, cn, mail, displayName, memberOf-Gruppen).
        // ============================================================
        res.on('searchEntry', (entry) => {
          // Benutzerobjekt mit Standardwerten initialisieren
          userEntry = { dn: entry.objectName || entry.dn, uid: null, cn: null, mail: null, displayName: null, memberOf: [] };

          // Attribute aus dem LDAP-Eintrag auslesen
          if (entry.attributes) {
            for (const attr of entry.attributes) {
              const name = attr.type || attr._type;               // Attributname (z.B. 'uid', 'cn')
              const vals = attr.values || attr.vals || attr._vals || []; // Attributwerte als Array

              // Einzelne Attribute zuordnen
              if (name === 'uid') userEntry.uid = vals[0]?.toString?.() || vals[0];               // Benutzername im LDAP
              if (name === 'cn') userEntry.cn = vals[0]?.toString?.() || vals[0];                  // Common Name (voller Name)
              if (name === 'mail') userEntry.mail = vals[0]?.toString?.() || vals[0];              // E-Mail-Adresse
              if (name === 'displayName') userEntry.displayName = vals[0]?.toString?.() || vals[0]; // Anzeigename
              // memberOf enthaelt alle Gruppenmitgliedschaften als DN-Array
              if (name === 'memberOf') userEntry.memberOf = vals.map(v => v.toString?.() || v);
            }
          }
        });

        // Fehler waehrend der Suche behandeln
        res.on('error', () => { client.destroy(); reject(new Error('LDAP search error')); });

        // ============================================================
        // Schritt 3 & 4: User-Bind und Rollenzuordnung
        // Nachdem die Suche abgeschlossen ist, wird versucht, sich mit
        // dem gefundenen DN und dem eingegebenen Passwort zu binden.
        // Bei Erfolg werden die LDAP-Gruppen auf Wiki-Rollen abgebildet.
        // ============================================================
        res.on('end', () => {
          // Benutzer wurde im LDAP nicht gefunden
          if (!userEntry) { client.destroy(); return reject(new Error('User not found in LDAP')); }

          // ============================================================
          // Schritt 3: User-Bind (Passwortpruefung)
          // Versucht sich mit dem DN des gefundenen Benutzers und dem
          // eingegebenen Passwort am LDAP-Server anzumelden.
          // Nur bei Erfolg ist das Passwort korrekt.
          // ============================================================
          client.bind(userEntry.dn, password, (err) => {
            // LDAP-Verbindung immer schliessen, unabhaengig vom Ergebnis
            client.destroy();

            // Bind fehlgeschlagen = falsches Passwort
            if (err) return reject(new Error('Invalid LDAP credentials'));

            // ============================================================
            // Schritt 4: Rollenzuordnung
            // Die LDAP-Gruppenmitgliedschaften (memberOf) werden durchlaufen
            // und anhand der LDAP_ROLE_MAP auf Wiki-Rollen abgebildet.
            // Prioritaetsreihenfolge: admin > editor > viewer
            // Standard-Rolle ist 'viewer', falls keine passende Gruppe gefunden wird.
            // ============================================================
            let role = 'viewer'; // Standard-Rolle

            for (const mo of userEntry.memberOf) {
              // CN (Common Name) der Gruppe aus dem DN extrahieren
              // Beispiel: "cn=admins,ou=groups,dc=wiki,dc=local" -> "admins"
              const cnMatch = mo.match(/cn=([^,]+)/i);
              if (cnMatch) {
                const group = cnMatch[1].toLowerCase(); // Gruppenname in Kleinbuchstaben

                // Pruefen, ob die Gruppe in der Rollenzuordnung definiert ist
                if (LDAP_ROLE_MAP[group]) {
                  const mapped = LDAP_ROLE_MAP[group];

                  // Admin hat hoechste Prioritaet – ueberschreibt alle anderen Rollen
                  if (mapped === 'admin') role = 'admin';
                  // Editor nur setzen, wenn noch nicht Admin zugewiesen
                  else if (mapped === 'editor' && role !== 'admin') role = 'editor';
                }
              }
            }

            // Erfolgreich authentifiziert – Benutzerobjekt zurueckgeben
            resolve({
              username: userEntry.uid || username,                          // LDAP-uid oder eingegebener Benutzername
              displayName: userEntry.displayName || userEntry.cn || username, // Anzeigename (Fallback-Kette)
              email: userEntry.mail || '',                                   // E-Mail-Adresse (leer falls nicht vorhanden)
              role,                                                          // Zugeordnete Wiki-Rolle
            });
          });
        });
      });
    });
  });
}

// LDAP-Authentifizierungsfunktion exportieren
module.exports = { ldapAuthenticate };

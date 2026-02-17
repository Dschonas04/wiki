/**
 * Zentrale Konfiguration – Nexora Wissensmanagement-System
 * 
 * Diese Datei sammelt alle Umgebungsvariablen und Konstanten an einem Ort.
 * Alle anderen Module importieren ihre Konfigurationswerte von hier,
 * sodass Aenderungen zentral vorgenommen werden koennen.
 * 
 * Konfigurationsbereiche:
 *  - JWT (JSON Web Token) Authentifizierung
 *  - Cookie-Einstellungen
 *  - Passwort-Hashing (bcrypt)
 *  - LDAP-Verbindung und Rollenzuordnung
 *  - RBAC (Rollenbasierte Zugriffskontrolle) Berechtigungen
 *  - Datenbank-Verbindung (PostgreSQL)
 *  - Server-Port und Umgebungsmodus
 */

// ============================================================
// JWT-Konfiguration (JSON Web Token)
// JWT wird fuer die zustandslose Authentifizierung in Nexora verwendet.
// Jeder authentifizierte Benutzer erhaelt einen signierten Token.
// ============================================================

// JWT_SECRET ist der geheime Schluessel zum Signieren der Tokens.
// MUSS als Umgebungsvariable gesetzt sein – ohne diesen Wert kann der Nexora-Server nicht starten.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET Umgebungsvariable ist erforderlich');
  process.exit(1); // Sofortiger Abbruch – Sicherheitskritisch
}

// Gueltigkeitsdauer der JWT-Tokens (Standard: 8 Stunden)
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

// Name des HTTP-Cookies, in dem der Nexora JWT-Token gespeichert wird
const COOKIE_NAME = 'nexora_token';

// Ob der Cookie nur ueber HTTPS gesendet werden darf (fuer Produktion: true)
const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true'
  : false;

// Anzahl der bcrypt-Runden fuer Passwort-Hashing (hoeher = sicherer, aber langsamer)
const BCRYPT_ROUNDS = 12;

// ============================================================
// LDAP-Konfiguration (Lightweight Directory Access Protocol)
// Ermoeglicht die Authentifizierung gegen einen externen Verzeichnisdienst
// wie OpenLDAP oder Active Directory fuer Nexora.
// ============================================================

// LDAP aktivieren/deaktivieren ueber Umgebungsvariable
const LDAP_ENABLED = process.env.LDAP_ENABLED === 'true';

// URL des LDAP-Servers (Standard: ldap://ldap:389 fuer Docker-Netzwerk)
const LDAP_URL = process.env.LDAP_URL || 'ldap://ldap:389';

// Distinguished Name (DN) fuer die Service-Bind-Verbindung zum LDAP-Server
const LDAP_BIND_DN = process.env.LDAP_BIND_DN || 'cn=admin,dc=nexora,dc=local';

// Passwort fuer die Service-Bind-Verbindung
const LDAP_BIND_PW = process.env.LDAP_BIND_PW || '';

// Basis-DN fuer die Benutzersuche im LDAP-Verzeichnis
const LDAP_SEARCH_BASE = process.env.LDAP_SEARCH_BASE || 'ou=users,dc=nexora,dc=local';

// Suchfilter mit Platzhalter {{username}} – wird zur Laufzeit ersetzt
const LDAP_SEARCH_FILTER = process.env.LDAP_SEARCH_FILTER || '(uid={{username}})';

// Basis-DN fuer Gruppensuche (wird fuer Rollenzuordnung verwendet)
const LDAP_GROUP_BASE = process.env.LDAP_GROUP_BASE || 'ou=groups,dc=nexora,dc=local';

// ============================================================
// LDAP-Rollenzuordnung
// Ordnet LDAP-Gruppennamen den internen Nexora-Rollen zu.
// Benutzer, die keiner Gruppe angehoeren, erhalten die Standardrolle 'user'.
// ============================================================
const LDAP_ROLE_MAP = {
  admins:   'admin',    // LDAP-Gruppe "admins"   -> Nexora-Rolle "admin"   (Vollzugriff)
  auditors: 'auditor',  // LDAP-Gruppe "auditors" -> Nexora-Rolle "auditor" (Pruefer/Freigabe)
  users:    'user',     // LDAP-Gruppe "users"    -> Nexora-Rolle "user"    (Standardbenutzer)
};

// ============================================================
// RBAC – Rollenbasierte Zugriffskontrolle (Nexora)
//
// Definiert, welche Berechtigungen jede globale Rolle besitzt.
// Wird in der Auth-Middleware geprueft, um Zugriff zu gewaehren oder zu verweigern.
//
// Berechtigungs-Uebersicht:
//   pages.*        – Seitenverwaltung (lesen, erstellen, bearbeiten, loeschen)
//   spaces.*       – Bereichsverwaltung (lesen, erstellen, verwalten)
//   folders.*      – Ordnerverwaltung innerhalb von Bereichen
//   publishing.*   – Veroeffentlichungs-Workflow (Pruefen/Freigeben)
//   private.*      – Verwaltung des eigenen privaten Bereichs
//   users.*        – Benutzerverwaltung (lesen, verwalten)
//   health.*       – Systemstatus und Gesundheitspruefung
//   audit.*        – Audit-Log / Protokolleinsicht
// ============================================================
const PERMISSIONS = {
  // Administratoren: Vollzugriff auf alle Funktionen des Nexora-Systems
  admin: [
    'pages.read', 'pages.create', 'pages.edit', 'pages.delete',
    'spaces.read', 'spaces.create', 'spaces.manage',
    'folders.read', 'folders.create', 'folders.manage',
    'publishing.review',
    'private.manage',
    'users.read', 'users.manage',
    'health.read',
    'audit.read',
  ],

  // Auditoren: Koennen Veroeffentlichungsanfragen pruefen/freigeben,
  // Audit-Logs einsehen und alle Seiten/Bereiche/Ordner lesen
  auditor: [
    'pages.read',
    'spaces.read',
    'folders.read',
    'publishing.review',
    'private.manage',
    'audit.read',
  ],

  // Standardbenutzer: Grundlegender Zugriff – Seiten lesen (sofern berechtigt),
  // Seiten im eigenen privaten Bereich erstellen und verwalten
  user: [
    'pages.read', 'pages.create',
    'spaces.read',
    'folders.read',
    'private.manage',
  ],
};

// ============================================================
// Datenbank-Konfiguration (PostgreSQL)
// Verbindungseinstellungen fuer den PostgreSQL Connection-Pool von Nexora.
// ============================================================
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',           // Hostname des DB-Servers
  port: parseInt(process.env.DB_PORT || '5432'),       // Port des DB-Servers (Standard: 5432)
  database: process.env.DB_NAME || 'nexoradb',         // Name der Nexora-Datenbank
  user: process.env.DB_USER || 'nexorauser',           // Nexora-Datenbankbenutzer
  password: process.env.DB_PASS,                       // Passwort des Datenbankbenutzers
  max: 20,                                              // Maximale Anzahl gleichzeitiger Verbindungen im Pool
  idleTimeoutMillis: 30000,                             // Leerlauf-Timeout: Verbindung wird nach 30s geschlossen
  connectionTimeoutMillis: 5000,                        // Verbindungs-Timeout: max. 5s fuer neue Verbindung
};

// ============================================================
// Modul-Exporte
// Alle Konfigurationswerte werden hier gebuendelt exportiert,
// damit andere Nexora-Module sie zentral importieren koennen.
// ============================================================
module.exports = {
  // JWT & Authentifizierung
  JWT_SECRET,
  JWT_EXPIRES,
  COOKIE_NAME,
  COOKIE_SECURE,
  BCRYPT_ROUNDS,

  // LDAP-Konfiguration
  LDAP_ENABLED,
  LDAP_URL,
  LDAP_BIND_DN,
  LDAP_BIND_PW,
  LDAP_SEARCH_BASE,
  LDAP_SEARCH_FILTER,
  LDAP_GROUP_BASE,
  LDAP_ROLE_MAP,

  // Berechtigungen und Datenbank
  PERMISSIONS,
  DB_CONFIG,

  // Server-Einstellungen
  PORT: parseInt(process.env.PORT || '3000'),          // HTTP-Port (Standard: 3000)
  IS_PRODUCTION: process.env.NODE_ENV === 'production', // Produktionsmodus erkennen
};

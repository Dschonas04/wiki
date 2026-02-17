/**
 * Zentrale Konfiguration
 * Alle Umgebungsvariablen und Konstanten
 */

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';
const COOKIE_NAME = 'wiki_token';
const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true'
  : false;
const BCRYPT_ROUNDS = 12;

// LDAP
const LDAP_ENABLED = process.env.LDAP_ENABLED === 'true';
const LDAP_URL = process.env.LDAP_URL || 'ldap://ldap:389';
const LDAP_BIND_DN = process.env.LDAP_BIND_DN || 'cn=admin,dc=wiki,dc=local';
const LDAP_BIND_PW = process.env.LDAP_BIND_PW || '';
const LDAP_SEARCH_BASE = process.env.LDAP_SEARCH_BASE || 'ou=users,dc=wiki,dc=local';
const LDAP_SEARCH_FILTER = process.env.LDAP_SEARCH_FILTER || '(uid={{username}})';
const LDAP_GROUP_BASE = process.env.LDAP_GROUP_BASE || 'ou=groups,dc=wiki,dc=local';

const LDAP_ROLE_MAP = {
  admins: 'admin',
  editors: 'editor',
  viewers: 'viewer',
};

// RBAC
const PERMISSIONS = {
  admin:  ['pages.read', 'pages.create', 'pages.edit', 'pages.delete', 'users.read', 'users.manage', 'health.read', 'audit.read'],
  editor: ['pages.read', 'pages.create', 'pages.edit', 'pages.delete'],
  viewer: ['pages.read'],
};

// Database
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'wikidb',
  user: process.env.DB_USER || 'wikiuser',
  password: process.env.DB_PASS,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES,
  COOKIE_NAME,
  COOKIE_SECURE,
  BCRYPT_ROUNDS,
  LDAP_ENABLED,
  LDAP_URL,
  LDAP_BIND_DN,
  LDAP_BIND_PW,
  LDAP_SEARCH_BASE,
  LDAP_SEARCH_FILTER,
  LDAP_GROUP_BASE,
  LDAP_ROLE_MAP,
  PERMISSIONS,
  DB_CONFIG,
  PORT: parseInt(process.env.PORT || '3000'),
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
};

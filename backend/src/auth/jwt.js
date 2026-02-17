/**
 * JWT Token-Verwaltung
 */

const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES, COOKIE_NAME, COOKIE_SECURE } = require('../config');

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, displayName: user.display_name || user.displayName },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function setTokenCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SECURE ? 'strict' : 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

module.exports = { signToken, setTokenCookie };

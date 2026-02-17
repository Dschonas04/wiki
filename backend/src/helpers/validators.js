/**
 * Validierungsfunktionen
 */

function validatePassword(password) {
  const errors = [];
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters.');
  else {
    if (!/[a-zA-Z]/.test(password)) errors.push('Password must contain at least one letter.');
    if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number.');
    if (!/[^a-zA-Z0-9]/.test(password)) errors.push('Password must contain at least one special character.');
  }
  return errors;
}

function validatePageInput(title, content) {
  const errors = [];
  if (!title || !title.trim()) errors.push('Title is required.');
  else if (title.trim().length > 255) errors.push('Title must be 255 characters or less.');
  if (!content || !content.trim()) errors.push('Content is required.');
  else if (content.length > 100000) errors.push('Content must be 100 000 characters or less.');
  return errors;
}

function isValidColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

module.exports = { validatePassword, validatePageInput, isValidColor };

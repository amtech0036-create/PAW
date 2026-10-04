/**
 * Reusable input validation helpers (PRD sections 32/43).
 * Returns an error message string, or null when the value is valid.
 */

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function validateEmail(email) {
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return 'Please enter a valid email address.';
  }
  return null;
}

function validatePassword(password) {
  if (!password || typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  return null;
}

function validateName(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    return 'Please enter your name.';
  }
  return null;
}

/**
 * Runs a list of validators and returns the first error message, or null.
 */
function firstError(...checks) {
  for (const message of checks) {
    if (message) return message;
  }
  return null;
}

module.exports = { validateEmail, validatePassword, validateName, firstError, EMAIL_RE };

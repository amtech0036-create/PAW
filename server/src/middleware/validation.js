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
 * Transaction validation (PRD sections 41/43).
 * Amount must be a finite number > 0; never negative, NaN, or empty.
 */
function validateAmount(amount) {
  const n = typeof amount === 'string' && amount.trim() !== '' ? Number(amount) : amount;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    return 'Amount must be a number greater than 0.';
  }
  return null;
}

function validateType(type) {
  if (type !== 'income' && type !== 'expense') {
    return 'Type must be income or expense.';
  }
  return null;
}

function validateDate(date) {
  if (!date || typeof date !== 'string' || Number.isNaN(Date.parse(date))) {
    return 'Please enter a valid date.';
  }
  return null;
}

function validateObjectId(id, label = 'ID') {
  if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) {
    return `Please provide a valid ${label}.`;
  }
  return null;
}

function validateNote(note) {
  if (note !== undefined && note !== null && typeof note !== 'string') {
    return 'Note must be text.';
  }
  return null;
}

function validateSource(source) {
  if (source !== undefined && source !== null && typeof source !== 'string') {
    return 'Source must be text.';
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

module.exports = {
  validateEmail,
  validatePassword,
  validateName,
  validateAmount,
  validateType,
  validateDate,
  validateObjectId,
  validateNote,
  validateSource,
  firstError,
  EMAIL_RE,
};

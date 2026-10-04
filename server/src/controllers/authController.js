const bcrypt = require('bcrypt');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { seedDefaultCategories } = require('../models');
const { signToken, sendAuthCookie, clearAuthCookie, requireAuth } = require('../middleware/auth');
const { validateEmail, validatePassword, validateName, firstError } = require('../middleware/validation');

const BCRYPT_ROUNDS = 10;

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    currency: user.currency,
    timezone: user.timezone,
  };
}

/**
 * POST /api/auth/register (PRD section 33)
 * Creates the user, their settings document, and default categories
 * (PRD sections 15-16), then logs them in via HTTP-only cookie.
 */
async function register(req, res, next) {
  try {
    const { name, email, password } = req.body || {};

    const validationError = firstError(
      validateName(name),
      validateEmail(email),
      validatePassword(password)
    );
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
    });

    // Per-user documents (PRD sections 13/15-16). Built-in default Opening
    // Balance category is created in Phase 5; opening balance value lives in
    // Settings per PRD section 13.
    await Settings.create({ userId: user._id });
    await seedDefaultCategories(user._id);

    const token = signToken(user);
    sendAuthCookie(res, token);

    return res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    // Race on the unique email index.
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    return next(err);
  }
}

/**
 * POST /api/auth/login (PRD section 33)
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    const validationError = firstError(validateEmail(email), validatePassword(password));
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const user = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(String(password), user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken(user);
    sendAuthCookie(res, token);

    return res.status(200).json({ user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/logout (PRD section 33)
 */
function logout(req, res) {
  clearAuthCookie(res);
  return res.status(200).json({ message: 'Logged out' });
}

/**
 * GET /api/auth/me (PRD section 33)
 */
async function me(req, res) {
  const User = require('../models/User');
  const user = await User.findById(req.user.id).lean();
  if (!user) {
    return res.status(401).json({ error: 'Session owner no longer exists' });
  }
  return res.status(200).json({ user: publicUser(user) });
}

// Guard /me with authentication middleware.
const meHandler = [requireAuth, me];

module.exports = { register, login, logout, me, meHandler, publicUser };

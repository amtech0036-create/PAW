const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const COOKIE_NAME = 'token';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production (PRD section 44).');
}

/**
 * Signs a JWT for a user (PRD section 30).
 */
function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Sends the JWT as an HTTP-only cookie (PRD section 30: prefer HTTP-only
 * secure cookies over localStorage). SameSite=strict mitigates CSRF for the
 * MVP; `secure` is driven by COOKIE_SECURE / NODE_ENV.
 */
function sendAuthCookie(res, token) {
  const secure =
    process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matches JWT_EXPIRES_IN
    path: '/',
  });
}

function clearAuthCookie(res) {
  const secure =
    process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';

  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
  });
}

/**
 * Authentication middleware. Accepts the JWT from either the HTTP-only
 * cookie (browser) or an Authorization: Bearer header (API clients/tests).
 * Attaches req.user = { id, name, email } and rejects with 401 otherwise.
 */
function requireAuth(req, res, next) {
  let token = null;

  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  } else if (req.cookies && req.cookies[COOKIE_NAME]) {
    token = req.cookies[COOKIE_NAME];
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

module.exports = {
  requireAuth,
  signToken,
  sendAuthCookie,
  clearAuthCookie,
  COOKIE_NAME,
};

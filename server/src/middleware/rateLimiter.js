const rateLimit = require('express-rate-limit');

/**
 * Security Rate Limiters (PRD section 44).
 *
 * Prevents brute-force attacks against authentication endpoints and
 * protects general API routes from abuse.
 */

// Strict rate limiter for authentication routes (login / register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 1000 : 15, // Allow high limit during tests unless specifically testing rate limiting
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
  skip: (req) => {
    // Allows tests to disable when not testing rate limits
    return process.env.DISABLE_RATE_LIMIT === 'true';
  },
});

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 5000 : 300, // 300 requests per 15 min in production/dev
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please slow down and try again later.',
  },
  skip: (req) => {
    return process.env.DISABLE_RATE_LIMIT === 'true';
  },
});

module.exports = {
  authLimiter,
  apiLimiter,
};

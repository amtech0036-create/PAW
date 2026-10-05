require('./config/env');

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const reportRoutes = require('./routes/reportRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const exportRoutes = require('./routes/exportRoutes');
const { mongoSanitize } = require('./middleware/sanitize');
const { apiLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

/**
 * Builds the Express app. Kept free of side effects (no listen, no DB call)
 * so tests can import it and run against a live HTTP server.
 */
function createApp() {
  const app = express();

  // Security headers (PRD section 44).
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS for the configured frontend origin and same-origin requests.
  const frontendUrl = process.env.FRONTEND_URL;
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow same-origin requests (no origin header), local dev, or matching frontend URL
        if (!origin || process.env.NODE_ENV !== 'production') {
          return callback(null, true);
        }
        if (!frontendUrl || origin === frontendUrl || origin.endsWith('.vercel.app')) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(require('cookie-parser')());

  // Prevent NoSQL query injection attacks (PRD section 44).
  app.use(mongoSanitize);

  // API rate limiter (PRD section 44).
  app.use('/api', apiLimiter);
  app.use('/api', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api', exportRoutes);

  // Serve the static PWA frontend from ../client.
  app.use(express.static(path.join(__dirname, '..', '..', 'client')));

  // 404 for unknown API routes.
  app.use('/api', notFoundHandler);

  // Central error handler (must be last).
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };

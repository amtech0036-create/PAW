const { createApp } = require('../server/src/app');
const { connectDatabase } = require('../server/src/config/database');

const app = createApp();

/**
 * Serverless function entrypoint for Vercel.
 */
module.exports = async (req, res) => {
  try {
    await connectDatabase();
  } catch (err) {
    console.error('[serverless] Database connection error:', err.message);
  }

  // Normalize req.url to ensure Express router matches correctly
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }

  return app(req, res);
};


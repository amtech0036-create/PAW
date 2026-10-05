const { createApp } = require('../server/src/app');
const { connectDatabase } = require('../server/src/config/database');

const app = createApp();

/**
 * Serverless function entrypoint for Vercel.
 */
module.exports = async (req, res) => {
  await connectDatabase();
  return app(req, res);
};

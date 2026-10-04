require('./env');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/personal_finance';

/**
 * Connect to MongoDB.
 *
 * The app does not crash when the database is unreachable: Express keeps
 * serving the frontend and /api/health reports db: "disconnected". This keeps
 * Phase 1 verifiable on machines without a local MongoDB; phases that need the
 * database will surface the error explicitly instead of dying silently.
 */
async function connectDatabase() {
  const mongoose = require('mongoose');

  mongoose.set('strictQuery', true);

  // Never log the connection string (may contain credentials).
  mongoose.connection.on('connected', () => {
    console.log('[db] MongoDB connected');
  });
  mongoose.connection.on('disconnected', () => {
    console.log('[db] MongoDB disconnected');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error:', err.message);
  });

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 3000,
    });
  } catch (err) {
    console.error('[db] Could not connect to MongoDB:', err.message);
    console.error('[db] Server will keep running; set MONGODB_URI correctly and restart.');
  }
}

async function disconnectDatabase() {
  const mongoose = require('mongoose');
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase, MONGODB_URI };

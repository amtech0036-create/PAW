const express = require('express');

const router = express.Router();

/**
 * GET /api/health
 * Liveness + database status check (no authentication in Phase 1).
 */
router.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  const state = mongoose.connection.readyState; // 0 disconnected, 1 connected, 2 connecting

  res.status(200).json({
    status: 'ok',
    db: state === 1 ? 'connected' : state === 2 ? 'connecting' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;

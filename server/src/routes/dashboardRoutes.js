const express = require('express');

const controller = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// The dashboard is private user data (PRD section 43).
router.get('/', requireAuth, controller.getDashboard);

module.exports = router;

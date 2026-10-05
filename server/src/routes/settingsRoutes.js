const express = require('express');

const controller = require('../controllers/settingsController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Settings are private per-user data (PRD section 43).
router.use(requireAuth);

router.get('/', controller.getSettings);
router.put('/', controller.updateSettings);
router.put('/opening-balance', controller.updateOpeningBalance);

module.exports = router;

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { exportCsv, exportJson, importJson } = require('../controllers/exportController');

const router = express.Router();

router.get('/export/csv', requireAuth, exportCsv);
router.get('/export/json', requireAuth, exportJson);
router.post('/import/json', requireAuth, importJson);

module.exports = router;

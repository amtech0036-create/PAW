const express = require('express');

const controller = require('../controllers/reportController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Reports expose private financial data (PRD section 43).
router.use(requireAuth);

router.get('/monthly', controller.monthly);
router.get('/categories', controller.categories);
router.get('/income-expense', controller.incomeExpense);
router.get('/custom', controller.custom);

module.exports = router;

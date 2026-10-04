const express = require('express');

const controller = require('../controllers/transactionController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All transaction endpoints require authentication (PRD section 43).
router.use(requireAuth);

router.post('/', controller.createTransaction);
router.get('/', controller.getTransactions);
router.get('/:id', controller.getTransaction);
router.put('/:id', controller.updateTransaction);
router.delete('/:id', controller.deleteTransaction);

module.exports = router;

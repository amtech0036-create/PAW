const express = require('express');

const controller = require('../controllers/categoryController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Categories are private per-user data (PRD section 43).
router.use(requireAuth);

router.get('/', controller.getCategories);
router.post('/', controller.createCategory);
router.put('/:id', controller.updateCategory);
router.delete('/:id', controller.deleteCategory);

module.exports = router;

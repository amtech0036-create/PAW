const express = require('express');
const { authLimiter } = require('../middleware/rateLimiter');
const controller = require('../controllers/authController');

const router = express.Router();

router.post('/register', authLimiter, controller.register);
router.post('/login', authLimiter, controller.login);
router.post('/logout', controller.logout);
router.get('/me', controller.meHandler);

module.exports = router;


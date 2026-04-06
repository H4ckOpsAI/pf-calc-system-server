const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');

// Public Routes
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/refresh-token', authController.refreshToken);

// router.post('/register', authController.register); // DISABLED: Admin only creation

module.exports = router;

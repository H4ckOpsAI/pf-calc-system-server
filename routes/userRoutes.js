const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateJWT, authorizeRole, authorizePermission } = require('../middleware/authMiddleware');

// User Management Routes (Admin Only)
router.post('/', authenticateJWT, authorizeRole(['Admin']), authorizePermission('canManageUsers'), userController.createUser);
router.get('/', authenticateJWT, authorizeRole(['Admin']), authorizePermission('canManageUsers'), userController.getUsers);
router.put('/role', authenticateJWT, authorizeRole(['Admin']), authorizePermission('canManageUsers'), userController.updateUserRole);
router.put('/status', authenticateJWT, authorizeRole(['Admin']), authorizePermission('canManageUsers'), userController.toggleUserStatus);

// Permission Management (Admin Only)
router.get('/permissions', authenticateJWT, authorizeRole(['Admin']), userController.getPermissions);
router.put('/permissions', authenticateJWT, authorizeRole(['Admin']), userController.updatePermission);
router.get('/logs', authenticateJWT, authorizeRole(['Admin']), authorizePermission('canManageUsers'), userController.getLoginLogs);

// Common Profile routes (all authenticated users)
router.get('/profile', authenticateJWT, userController.getProfile);
router.put('/profile', authenticateJWT, userController.updateProfile);
router.put('/change-password', authenticateJWT, userController.changePassword);

// Password Reset (public - no auth required)
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password', userController.resetPassword);

module.exports = router;

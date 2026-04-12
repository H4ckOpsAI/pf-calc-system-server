const express = require('express');
const router = express.Router();
const pfActionsController = require('../controllers/pfActionsController');
const { authenticateJWT, authorizeRole, authorizePermission } = require('../middleware/authMiddleware');

// Staff specific routes
router.get('/my-actions', authenticateJWT, pfActionsController.getMyActions);
router.post('/override', authenticateJWT, pfActionsController.requestOverride);
router.post('/withdraw', authenticateJWT, pfActionsController.requestWithdrawal);

// Admin / Payroll routes (View pending requests and approve)
// Using canConfigureRules or canManageUsers - Let's allow PayrollOfficer and Admin to process via authorizeRole
router.get('/pending', authenticateJWT, authorizeRole(['Admin', 'PayrollOfficer']), pfActionsController.getPendingActions);
router.post('/override/approve', authenticateJWT, authorizeRole(['Admin', 'PayrollOfficer']), pfActionsController.approveOverride);
router.post('/override/reject', authenticateJWT, authorizeRole(['Admin', 'PayrollOfficer']), pfActionsController.rejectOverride);
router.post('/withdraw/approve', authenticateJWT, authorizeRole(['Admin', 'PayrollOfficer']), pfActionsController.approveWithdrawal);
router.post('/withdraw/reject', authenticateJWT, authorizeRole(['Admin', 'PayrollOfficer']), pfActionsController.rejectWithdrawal);

module.exports = router;

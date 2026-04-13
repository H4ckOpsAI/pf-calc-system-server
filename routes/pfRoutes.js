const express = require('express');
const router = express.Router();
const pfController = require('../controllers/pfController');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');

// Get My PF (Accessible to Staff, PayrollOfficer. Admin generally doesn't have PF but logic handles it)
router.get('/my', authenticateJWT, pfController.getMyPF);

// Download Excel Template (Accessible to PayrollOfficer)
router.get('/template', authenticateJWT, authorizeRole(['PayrollOfficer', 'Admin']), pfController.downloadTemplate);

// Get All PF for Manage PF
router.get('/all', authenticateJWT, authorizeRole(['PayrollOfficer', 'Admin']), pfController.getAllPF);

// Get explicitly requested PF bounds safely (Read-Only)
router.get('/:employeeId', authenticateJWT, authorizeRole(['PayrollOfficer', 'Admin']), pfController.getPFByEmployeeId);

module.exports = router;

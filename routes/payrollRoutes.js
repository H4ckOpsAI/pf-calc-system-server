const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payrollController');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// All routes here are protected and restricted to Payroll Officer (and Admin)
// Upload Payroll Excel
router.post('/upload',
    authenticateJWT,
    authorizeRole(['PayrollOfficer', 'Admin']),
    upload.single('file'),
    payrollController.uploadPayroll
);

// Get Temp Payroll Data (Preview)
router.get('/temp',
    authenticateJWT,
    authorizeRole(['PayrollOfficer', 'Admin']),
    payrollController.getTempPayroll
);

// Get calculated PF List
router.get('/list',
    authenticateJWT,
    authorizeRole(['PayrollOfficer', 'Admin']),
    payrollController.getPFList
);

// Process Payroll (Calculation)
router.post('/process',
    authenticateJWT,
    authorizeRole(['PayrollOfficer', 'Admin']),
    payrollController.processPayroll
);

module.exports = router;

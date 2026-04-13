const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');

// All report routes restricted to Admin + PayrollOfficer
router.use(authenticateJWT, authorizeRole(['Admin', 'PayrollOfficer']));

router.get('/summary', reportController.getSummary);
router.get('/employees', reportController.getEmployeeReport);
router.get('/departments', reportController.getDepartmentReport);
router.get('/compliance', reportController.getComplianceReport);

// CSV Exports
router.get('/export/summary', reportController.exportSummaryCSV);
router.get('/export/employees', reportController.exportEmployeesCSV);
router.get('/export/departments', reportController.exportDepartmentsCSV);
router.get('/export/compliance', reportController.exportComplianceCSV);

module.exports = router;

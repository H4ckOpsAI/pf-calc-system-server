const express = require('express');
const router = express.Router();
const pfTaxController = require('../controllers/pfTaxController');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');

router.post('/increment', authenticateJWT, pfTaxController.applyIncrement);
router.post('/tax', authenticateJWT, pfTaxController.updatePFTax);
router.get('/my-details', authenticateJWT, pfTaxController.getUserPFTaxDetails);
router.get('/all-details', authenticateJWT, authorizeRole(['Admin', 'PayrollOfficer']), pfTaxController.getAllPFTaxDetails);

module.exports = router;

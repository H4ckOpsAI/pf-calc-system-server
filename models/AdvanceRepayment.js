const mongoose = require('mongoose');

const advanceRepaymentSchema = new mongoose.Schema({
    withdrawalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Withdrawal', required: true },
    employeeId: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    monthlyInstallment: { type: Number, required: true },
    monthsRemaining: { type: Number, default: 36, required: true },
    remainingBalance: { type: Number, required: true }, 
    isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('AdvanceRepayment', advanceRepaymentSchema);

const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
    employeeId: { type: String, required: true },
    financialYear: { type: String, required: true },
    type: { type: String, enum: ['part-final', 'advance'], required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'processed'], default: 'pending' },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedAt: { type: Date, default: Date.now },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    processedAt: { type: Date },
    cooldownUntil: { type: Date }
});

module.exports = mongoose.model('Withdrawal', withdrawalSchema);

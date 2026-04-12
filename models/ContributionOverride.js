const mongoose = require('mongoose');

const overrideSchema = new mongoose.Schema({
    employeeId: { type: String, required: true },
    financialYear: { type: String, required: true },
    type: { type: String, enum: ['increase', 'decrease'], required: true },
    amount: { type: Number, required: true }, // The flat requested contribution override
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedAt: { type: Date, default: Date.now },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date }
});

module.exports = mongoose.model('ContributionOverride', overrideSchema);

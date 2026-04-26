const mongoose = require('mongoose');

const pfCalculationSchema = new mongoose.Schema({
    employeeId: { type: String, required: true },
    staffName: { type: String, required: true },
    designation: { type: String, required: true },
    department: { type: String, required: true }, // Store name snapshot
    staffCategory: { type: String, required: true },
    pfScheme: { type: String, required: true },
    basicPay: { type: Number, required: true },

    // Calculation Results
    employeePF: { type: Number, required: true },
    employerPF: { type: Number, default: 0 }, // 0 for GPF
    totalPF: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    overrideApplied: { type: Boolean, default: false },
    advanceEMI: { type: Number, default: 0 },
    partFinalWithdrawal: { type: Number, default: 0 },

    // Audit Fields
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    processedAt: { type: Date, default: Date.now },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    financialYear: { type: String, required: true },
    cumulativeBalance: { type: Number, required: true }
});

// Enforce single calculation per employee per month
pfCalculationSchema.index({ employeeId: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('PFCalculation', pfCalculationSchema);

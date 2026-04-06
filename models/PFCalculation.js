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

    // Audit Fields
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    processedAt: { type: Date, default: Date.now },
    month: { type: Number }, // Optional: separate month/year tracking
    year: { type: Number }
});

module.exports = mongoose.model('PFCalculation', pfCalculationSchema);

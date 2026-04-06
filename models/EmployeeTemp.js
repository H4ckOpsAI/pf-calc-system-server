const mongoose = require('mongoose');

const employeeTempSchema = new mongoose.Schema({
    employeeId: { type: String, required: true },
    staffName: { type: String, required: true },
    designation: { type: String, required: true },
    department: { type: String, required: true },
    staffCategory: {
        type: String,
        enum: ['Teaching', 'NonTeaching'],
        required: true
    },
    pfScheme: {
        type: String,
        enum: ['CPF', 'GPF'],
        required: true
    },
    basicPay: { type: Number, required: true },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('EmployeeTemp', employeeTempSchema);

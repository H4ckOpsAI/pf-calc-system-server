const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['Admin', 'PayrollOfficer', 'Staff'],
        default: 'Staff'
    },
    employeeId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        sparse: true // Allow nulls for older admins if any
    },
    staffCategory: {
        type: String,
        enum: ['Teaching', 'NonTeaching']
    },
    pfScheme: {
        type: String,
        enum: ['CPF', 'GPF']
    },
    department: { type: String },
    designation: { type: String },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);

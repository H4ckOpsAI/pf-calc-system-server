const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
    role: {
        type: String,
        required: true,
        unique: true,
        enum: ['Admin', 'PayrollOfficer', 'Staff']
    },
    canViewPayroll: { type: Boolean, default: false },
    canCalculatePayroll: { type: Boolean, default: false },
    canConfigureRules: { type: Boolean, default: false },
    canManageUsers: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Permission', permissionSchema);

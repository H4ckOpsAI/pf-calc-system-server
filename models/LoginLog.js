const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    loginTime: {
        type: Date,
        default: Date.now
    },
    ipAddress: {
        type: String
    },
    status: {
        type: String,
        enum: ['success', 'failed'],
        required: true
    }
});

module.exports = mongoose.model('LoginLog', loginLogSchema);

const mongoose = require('mongoose');

const incrementSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    increment_amount: { type: Number, required: true },
    year: { type: Number, required: true },
    increment_count: { type: Number, required: true, max: 3 }
}, { timestamps: true });

module.exports = mongoose.model('Increment', incrementSchema);

const mongoose = require('mongoose');

const pfTaxDetailSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    pf_amount: { type: Number, required: true, default: 0 },
    tax_percentage: { type: Number, default: 0 },
    tax_amount: { type: Number, default: 0 },
    net_pf: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('PFTaxDetail', pfTaxDetailSchema);

const Increment = require('../models/Increment');
const PFTaxDetail = require('../models/PFTaxDetail');
const User = require('../models/User');
const PFCalculation = require('../models/PFCalculation');
const ContributionOverride = require('../models/ContributionOverride');

exports.applyIncrement = async (req, res) => {
    try {
        const { increment_amount } = req.body;
        const user_id = req.user._id; 
        const year = new Date().getFullYear();

        // Check increment count for the year
        const currentYearIncrements = await Increment.find({ user_id, year });
        if (currentYearIncrements.length >= 3) {
            return res.status(400).json({ message: "your limit is over" });
        }

        // Add Increment
        const newIncrement = await Increment.create({
            user_id,
            increment_amount,
            year,
            increment_count: currentYearIncrements.length + 1
        });

        // Update PFTaxDetail automatically
        let pfTaxDoc = await PFTaxDetail.findOne({ user_id });
        if (!pfTaxDoc) {
             pfTaxDoc = new PFTaxDetail({ user_id, pf_amount: 0 });
        }
        
        pfTaxDoc.pf_amount += Number(increment_amount);
        
        let tax_percentage = 0;
        if (pfTaxDoc.pf_amount > 2000000) {
            tax_percentage = 7;
        } else if (pfTaxDoc.pf_amount > 1000000) {
            tax_percentage = 5;
        } else if (pfTaxDoc.pf_amount >= 700000) {
            tax_percentage = 3;
        }
        
        pfTaxDoc.tax_percentage = tax_percentage;
        pfTaxDoc.tax_amount = (pfTaxDoc.pf_amount * tax_percentage) / 100;
        pfTaxDoc.net_pf = pfTaxDoc.pf_amount - pfTaxDoc.tax_amount;
        await pfTaxDoc.save();

        res.status(200).json({ message: 'Increment applied and tax calculated successfully', data: newIncrement });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.updatePFTax = async (req, res) => {
    try {
        const { pf_amount } = req.body;
        const user_id = req.user._id;

        let tax_percentage = 0;
        if (pf_amount > 2000000) {
            tax_percentage = 7;
        } else if (pf_amount > 1000000) {
            tax_percentage = 5;
        } else if (pf_amount >= 700000) {
            tax_percentage = 3;
        }

        const tax_amount = (pf_amount * tax_percentage) / 100;
        const net_pf = pf_amount - tax_amount;

        const pfTaxDetail = await PFTaxDetail.findOneAndUpdate(
            { user_id },
            { pf_amount, tax_percentage, tax_amount, net_pf },
            { new: true, upsert: true }
        );

        res.status(200).json({ message: 'PF Tax updated successfully', data: pfTaxDetail });
    } catch (error) {
         console.error(error);
         res.status(500).json({ message: 'Server Error' });
    }
}

exports.getUserPFTaxDetails = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const pfRecords = await PFCalculation.find({ employeeId: user.employeeId });
        const trueTotal = pfRecords.reduce((sum, r) => sum + (r.totalPF || 0), 0);

        let pfTaxDetail = await PFTaxDetail.findOne({ user_id: req.user._id });
        if (!pfTaxDetail) {
             pfTaxDetail = new PFTaxDetail({ user_id: req.user._id, pf_amount: 0 });
        }

        pfTaxDetail.pf_amount = trueTotal;
        let tax_percentage = 0;
        if (trueTotal > 2000000) tax_percentage = 7;
        else if (trueTotal > 1000000) tax_percentage = 5;
        else if (trueTotal >= 700000) tax_percentage = 3;

        pfTaxDetail.tax_percentage = tax_percentage;
        pfTaxDetail.tax_amount = (trueTotal * tax_percentage) / 100;
        pfTaxDetail.net_pf = trueTotal - pfTaxDetail.tax_amount;
        await pfTaxDetail.save();

        const userOverrides = await ContributionOverride.find({ employeeId: user.employeeId, type: 'increase', status: { $ne: 'rejected' } });
        res.status(200).json({ 
            pfTaxDetail: pfTaxDetail,
            incrementsUsed: userOverrides.length
        });
    } catch (error) {
         console.error(error);
         res.status(500).json({ message: 'Server Error' });
    }
}

exports.getAllPFTaxDetails = async (req, res) => {
    try {
        const pfTaxDetails = await PFTaxDetail.find().populate('user_id', 'name email employeeId');
        const allIncreases = await ContributionOverride.find({ type: 'increase', status: { $ne: 'rejected' } });
        
        // Form a combined response
        const data = pfTaxDetails.map(detail => {
            const userIncreases = allIncreases.filter(inc => inc.employeeId === detail.user_id.employeeId);
            return {
                ...detail.toObject(),
                increments_used: userIncreases.length
            };
        });

        res.status(200).json(data);
    } catch (error) {
         console.error(error);
         res.status(500).json({ message: 'Server Error' });
    }
}

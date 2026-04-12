const ContributionOverride = require('../models/ContributionOverride');
const Withdrawal = require('../models/Withdrawal');
const AdvanceRepayment = require('../models/AdvanceRepayment');
const PFCalculation = require('../models/PFCalculation');
const User = require('../models/User');
const { logActivity } = require('../utils/logger');

// Determine current financial year based on today's date
const getCurrentFinancialYear = () => {
    const today = new Date();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    if (month >= 4) return `${year}-${year + 1}`;
    return `${year - 1}-${year}`;
};

// --- STAFF ACTIONS ---

exports.requestOverride = async (req, res) => {
    try {
        const { type, amount } = req.body;
        const employeeId = req.user.employeeId;
        const financialYear = getCurrentFinancialYear();

        // Find latest record to determine basePF and current contribution
        const latestRecord = await PFCalculation.findOne({ employeeId }).sort({ year: -1, month: -1 });
        if (!latestRecord) return res.status(400).json({ message: 'No existing PF mapping found to establish a base.' });

        const user = await User.findById(req.user._id);
        const rate = user.pfScheme === 'CPF' ? 0.10 : 0.06;
        const basePF = Math.round(latestRecord.basicPay * rate);
        const currentContribution = latestRecord.employeePF;

        const numericAmount = Number(amount);
        let finalPF;
        
        if (type === 'increase') {
            finalPF = currentContribution + numericAmount;
        } else {
            finalPF = currentContribution - numericAmount;
        }

        // Mathematical Validations
        if (finalPF > 40000) {
            return res.status(400).json({ message: `Final PF (₹${finalPF}) cannot exceed 40,000 per month.` });
        }
        if (finalPF < basePF) {
            return res.status(400).json({ message: `Final PF (₹${finalPF}) cannot be less than the Base PF (₹${basePF}).` });
        }

        // Validate frequency rules (2 increases, 1 decrease per FY)
        const existingOverrides = await ContributionOverride.find({ employeeId, financialYear });
        
        let increaseCount = 0;
        let decreaseCount = 0;
        existingOverrides.forEach(ov => {
            if (ov.type === 'increase' && ov.status !== 'rejected') increaseCount++;
            if (ov.type === 'decrease' && ov.status !== 'rejected') decreaseCount++;
        });

        if (type === 'increase' && increaseCount >= 2) {
            return res.status(400).json({ message: 'Maximum 2 increases allowed per financial year.' });
        }
        if (type === 'decrease' && decreaseCount >= 1) {
            return res.status(400).json({ message: 'Maximum 1 decrease allowed per financial year.' });
        }
        if (type === 'decrease' && increaseCount === 0) {
            return res.status(400).json({ message: 'You cannot request a decrease unless you have previously increased your PF mapping.' });
        }

        const override = await ContributionOverride.create({
            employeeId,
            financialYear,
            type,
            amount: finalPF, // Store absolute target
            requestedBy: req.user._id
        });

        await logActivity({
            userId: req.user._id,
            role: req.user.role,
            action: 'REQUEST_OVERRIDE',
            details: `Requested contribution override: ${type} by ${numericAmount} (Target: ₹${finalPF})`
        });

        res.status(201).json({ message: 'Contribution Override requested.', override });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error requesting override.' });
    }
};

exports.requestWithdrawal = async (req, res) => {
    try {
        const { type, amount } = req.body;
        const employeeId = req.user.employeeId;
        const financialYear = getCurrentFinancialYear();

        // Find latest cumulative balance
        const latestRecord = await PFCalculation.findOne({ employeeId }).sort({ year: -1, month: -1 });
        let currentBalance = latestRecord ? latestRecord.cumulativeBalance : 0;

        // Subtract any approved but unprocessed withdrawals from this perceived balance
        const unprocessed = await Withdrawal.find({ employeeId, status: 'approved' });
        unprocessed.forEach(w => {
            currentBalance -= w.amount;
        });

        if (type === 'part-final') {
            const maxAllowed = currentBalance * 0.80;
            if (amount > maxAllowed) {
                return res.status(400).json({ message: `Amount exceeds 80% limit. Maximum allowed: ₹${maxAllowed.toFixed(2)}` });
            }
        }

        if (amount > currentBalance) {
             return res.status(400).json({ message: `Amount exceeds current available balance of ₹${currentBalance}.` });
        }

        const withdrawal = await Withdrawal.create({
            employeeId,
            financialYear,
            type,
            amount,
            requestedBy: req.user._id
        });

        await logActivity({
            userId: req.user._id,
            role: req.user.role,
            action: 'REQUEST_WITHDRAWAL',
            details: `Requested withdrawal: ${type} of amount ${amount}`
        });

        res.status(201).json({ message: 'Withdrawal requested successfully.', withdrawal });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error requesting withdrawal.' });
    }
};

exports.getMyActions = async (req, res) => {
    try {
        const employeeId = req.user.employeeId;
        const overrides = await ContributionOverride.find({ employeeId }).sort({ requestedAt: -1 });
        const withdrawals = await Withdrawal.find({ employeeId }).sort({ requestedAt: -1 });
        const repayments = await AdvanceRepayment.find({ employeeId }).sort({ _id: -1 });

        res.json({ overrides, withdrawals, repayments });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error fetching actions.' });
    }
};

// --- ADMIN / PAYROLL ACTIONS ---

exports.getPendingActions = async (req, res) => {
    try {
        const pendingOverrides = await ContributionOverride.find({ status: 'pending' }).populate('requestedBy', 'name email');
        const pendingWithdrawals = await Withdrawal.find({ status: 'pending' }).populate('requestedBy', 'name email');

        res.json({ pendingOverrides, pendingWithdrawals });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error fetching pending actions.' });
    }
};

exports.approveOverride = async (req, res) => {
    try {
        const { id } = req.body;
        const override = await ContributionOverride.findById(id);
        if (!override || override.status !== 'pending') return res.status(404).json({ message: 'Pending Override not found.' });

        override.status = 'approved';
        override.approvedBy = req.user._id;
        override.approvedAt = new Date();
        await override.save();

        await logActivity({ userId: req.user._id, role: req.user.role, action: 'APPROVE_OVERRIDE', targetUserId: override.requestedBy, details: `Approved override ${id}` });
        res.json({ message: 'Override approved.', override });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error approving override.' });
    }
};

exports.rejectOverride = async (req, res) => {
    try {
        const { id } = req.body;
        const override = await ContributionOverride.findById(id);
        if (!override || override.status !== 'pending') return res.status(404).json({ message: 'Pending Override not found.' });

        override.status = 'rejected';
        override.approvedBy = req.user._id; // Traced operator
        override.approvedAt = new Date();
        await override.save();

        await logActivity({ userId: req.user._id, role: req.user.role, action: 'REJECT_OVERRIDE', targetUserId: override.requestedBy, details: `Rejected override ${id}` });
        res.json({ message: 'Override rejected.', override });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error rejecting override.' });
    }
};

exports.approveWithdrawal = async (req, res) => {
    try {
        const { id } = req.body; 
        const withdrawal = await Withdrawal.findById(id);
        if (!withdrawal || withdrawal.status !== 'pending') return res.status(404).json({ message: 'Pending Withdrawal not found.' });

        // RE-VALIDATOR
        if (withdrawal.type === 'part-final') {
            const latestRecord = await PFCalculation.findOne({ employeeId: withdrawal.employeeId }).sort({ year: -1, month: -1 });
            let currentBalance = latestRecord ? latestRecord.cumulativeBalance : 0;
            const unprocessed = await Withdrawal.find({ employeeId: withdrawal.employeeId, status: 'approved' });
            unprocessed.forEach(w => currentBalance -= w.amount);
            
            const maxAllowed = currentBalance * 0.80;
            if (withdrawal.amount > maxAllowed) {
                return res.status(400).json({ message: `Amount now exceeds 80% limit. Approval aborted.` });
            }
        }

        withdrawal.status = 'approved';
        withdrawal.approvedBy = req.user._id;
        withdrawal.approvedAt = new Date();
        await withdrawal.save();

        if (withdrawal.type === 'advance') {
            const monthlyInstallment = Math.ceil(withdrawal.amount / 36);
            await AdvanceRepayment.create({
                withdrawalId: withdrawal._id,
                employeeId: withdrawal.employeeId,
                totalAmount: withdrawal.amount,
                monthlyInstallment: monthlyInstallment,
                monthsRemaining: 36,
                remainingBalance: withdrawal.amount,
                isActive: true
            });
        }

        await logActivity({ userId: req.user._id, role: req.user.role, action: 'APPROVE_WITHDRAWAL', targetUserId: withdrawal.requestedBy, details: `Approved withdrawal ${id}` });
        res.json({ message: 'Withdrawal approved.', withdrawal });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error approving withdrawal.' });
    }
};

exports.rejectWithdrawal = async (req, res) => {
    try {
        const { id } = req.body; 
        const withdrawal = await Withdrawal.findById(id);
        if (!withdrawal || withdrawal.status !== 'pending') return res.status(404).json({ message: 'Pending Withdrawal not found.' });

        withdrawal.status = 'rejected';
        withdrawal.approvedBy = req.user._id;
        withdrawal.approvedAt = new Date();
        await withdrawal.save();

        await logActivity({ userId: req.user._id, role: req.user.role, action: 'REJECT_WITHDRAWAL', targetUserId: withdrawal.requestedBy, details: `Rejected withdrawal ${id}` });
        res.json({ message: 'Withdrawal rejected.', withdrawal });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error rejecting withdrawal.' });
    }
};

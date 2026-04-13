const xlsx = require('xlsx');
const PFCalculation = require('../models/PFCalculation');
const User = require('../models/User');
const ContributionOverride = require('../models/ContributionOverride');
const Withdrawal = require('../models/Withdrawal');

exports.getMyPF = async (req, res) => {
    try {
        // ... (existing code)
        // Extract employeeId from the authenticated user (attached by middleware)
        const employeeId = req.user.employeeId;

        if (!employeeId) {
            return res.status(400).json({ message: 'User does not have an Employee ID assigned.' });
        }

        // Fetch PF records for this employee
        const pfRecords = await PFCalculation.find({ employeeId }).sort({ year: -1, month: -1 });

        // Calculate totals dynamically using cumulative mathematical bounds
        const latestRecord = pfRecords.length > 0 ? pfRecords[0] : null;
        const totalContribution = latestRecord ? latestRecord.cumulativeBalance : 0;

        res.json({
            employeeId,
            name: req.user.name,
            designation: req.user.designation,
            pfScheme: req.user.pfScheme,
            totalContribution,
            records: pfRecords
        });
    } catch (error) {
        console.error('Get My PF Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getAllPF = async (req, res) => {
    try {
        const staffUsers = await User.find({ role: 'Staff', isActive: true });
        
        const pfSummaries = await Promise.all(staffUsers.map(async (user) => {
            const latestRecord = await PFCalculation.findOne({ employeeId: user.employeeId }).sort({ year: -1, month: -1 });
            return {
                _id: user._id,
                employeeId: user.employeeId,
                name: user.name,
                department: user.department,
                pfScheme: user.pfScheme,
                currentBalance: latestRecord ? latestRecord.cumulativeBalance : 0,
                lastContribution: latestRecord ? latestRecord.totalPF : 0
            };
        }));
        
        res.json(pfSummaries);
    } catch (error) {
        console.error('Get All PF Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getPFByEmployeeId = async (req, res) => {
    try {
        const { employeeId } = req.params;

        const pfRecords = await PFCalculation.find({ employeeId }).sort({ year: -1, month: -1 });
        const overrides = await ContributionOverride.find({ employeeId }).sort({ requestedAt: -1 });
        const withdrawals = await Withdrawal.find({ employeeId }).sort({ requestedAt: -1 });

        res.json({
            employeeId,
            pfRecords,
            overrides,
            withdrawals
        });
    } catch (error) {
        console.error('Get PF By EmployeeId Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.downloadTemplate = async (req, res) => {
    try {
        // Create a new workbook
        const wb = xlsx.utils.book_new();

        // Define headers
        const headers = [
            'employeeId',
            'staffName',
            'designation',
            'department',
            'staffCategory',
            'pfScheme',
            'basicPay',
            'month',
            'year'
        ];

        // Create sample data
        // Create sample data
        const sampleData = [
            ['EMP001', 'Mohan', 'Vice Chancellor', 'Administration', 'Teaching', 'CPF', 400000, 4, 2024],
            ['EMP002', 'Sudha', 'Dean Students', 'ECE', 'Teaching', 'CPF', 300000, 4, 2024]
        ];

        // Create worksheet
        const wsData = [headers, ...sampleData];
        const ws = xlsx.utils.aoa_to_sheet(wsData);

        // Add worksheet to workbook
        xlsx.utils.book_append_sheet(wb, ws, 'Payroll_Template');

        // Generate buffer
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // Set headers for file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=payroll_template.xlsx');

        // Send buffer
        res.send(buffer);
    } catch (error) {
        console.error('Download Template Error:', error);
        res.status(500).json({ message: 'Failed to generate template' });
    }
};

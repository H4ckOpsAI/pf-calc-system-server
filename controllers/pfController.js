const xlsx = require('xlsx');
const PFCalculation = require('../models/PFCalculation');
const User = require('../models/User');

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

        // Calculate totals (optional, or just send records)
        const totalContribution = pfRecords.reduce((acc, curr) => acc + curr.totalPF, 0);

        res.json({
            employeeId,
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
            'basicPay'
        ];

        // Create sample data
        // Create sample data
        const sampleData = [
            ['EMP001', 'Mohan', 'Vice Chancellor', 'Administration', 'Teaching', 'CPF', 400000],
            ['EMP002', 'Sudha', 'Dean Students', 'ECE', 'Teaching', 'CPF', 300000]
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

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

exports.compareCandidates = async (req, res) => {
    try {
        const { cand1, cand2 } = req.body;

        const processCandidate = (cand) => {
            let employeePF = 0;
            let employerPF = 0;
            const salary = Number(cand.salary) || 0;

            if (cand.pfScheme === 'GPF') {
                employeePF = Math.round(salary * 0.06);
            } else if (cand.pfScheme === 'CPF') {
                employeePF = Math.round(salary * 0.10);
                employerPF = Math.round(salary * 0.10);
            }

            // Apply global boundary logic
            if (employeePF > 40000) employeePF = 40000;
            if (employerPF > 40000) employerPF = 40000;
            
            const totalPF = employeePF + employerPF;

            const getArray = (str) => (str || '').split(',').map(s => s.trim()).filter(Boolean);
            const skills = getArray(cand.skills);
            
            return {
                ...cand,
                employeePF,
                employerPF,
                totalPF,
                skills,
                experience: Number(cand.experience) || 0
            };
        };

        const processedCand1 = processCandidate(cand1);
        const processedCand2 = processCandidate(cand2);

        // Analysis
        const c1UniqueSkills = processedCand1.skills.filter(s => !processedCand2.skills.includes(s));
        const c2UniqueSkills = processedCand2.skills.filter(s => !processedCand1.skills.includes(s));
        
        const pfDiff = processedCand2.totalPF - processedCand1.totalPF;
        const expDiff = processedCand2.experience - processedCand1.experience;
        const salaryDiff = processedCand2.salary - processedCand1.salary;

        res.json({
            cand1: processedCand1,
            cand2: processedCand2,
            analysis: {
                c1UniqueSkills,
                c2UniqueSkills,
                pfDiff,
                expDiff,
                salaryDiff
            }
        });

    } catch (error) {
        console.error('Compare Candidates Error:', error);
        res.status(500).json({ message: 'Server Error during comparison' });
    }
};

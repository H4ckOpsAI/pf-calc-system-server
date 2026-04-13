const PFCalculation = require('../models/PFCalculation');
const Withdrawal = require('../models/Withdrawal');
const ContributionOverride = require('../models/ContributionOverride');
const User = require('../models/User');

// ─── 1. SUMMARY REPORT ─────────────────────────────────────────
exports.getSummary = async (req, res) => {
    try {
        const pfAgg = await PFCalculation.aggregate([
            {
                $group: {
                    _id: null,
                    totalContribution: { $sum: '$totalPF' },
                    totalEmployeeShare: { $sum: '$employeePF' },
                    totalEmployerShare: { $sum: '$employerPF' },
                    uniqueEmployees: { $addToSet: '$employeeId' }
                }
            }
        ]);

        const pf = pfAgg[0] || { totalContribution: 0, totalEmployeeShare: 0, totalEmployerShare: 0, uniqueEmployees: [] };

        const wdAgg = await Withdrawal.aggregate([
            { $match: { status: 'processed' } },
            {
                $group: {
                    _id: '$type',
                    totalAmount: { $sum: '$amount' }
                }
            }
        ]);

        let totalAdvance = 0, totalPartFinal = 0;
        wdAgg.forEach(w => {
            if (w._id === 'advance') totalAdvance = w.totalAmount;
            if (w._id === 'part-final') totalPartFinal = w.totalAmount;
        });

        res.json({
            totalEmployees: pf.uniqueEmployees.length,
            totalContribution: pf.totalContribution,
            totalEmployeeShare: pf.totalEmployeeShare,
            totalEmployerShare: pf.totalEmployerShare,
            totalWithdrawals: totalAdvance + totalPartFinal,
            totalAdvance,
            totalPartFinal
        });
    } catch (error) {
        console.error('Summary Report Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// ─── 2. EMPLOYEE REPORT ─────────────────────────────────────────
exports.getEmployeeReport = async (req, res) => {
    try {
        const staffUsers = await User.find({ role: 'Staff', isActive: true }).select('employeeId name department pfScheme').lean();

        const report = await Promise.all(staffUsers.map(async (user) => {
            const pfRecords = await PFCalculation.find({ employeeId: user.employeeId }).sort({ year: -1, month: -1 }).lean();
            const processedWithdrawals = await Withdrawal.find({ employeeId: user.employeeId, status: 'processed' }).lean();

            const totalContribution = pfRecords.reduce((sum, r) => sum + r.totalPF, 0);
            const totalWithdrawal = processedWithdrawals.reduce((sum, w) => sum + w.amount, 0);
            const latestRecord = pfRecords[0] || null;

            // netBalance: always use cumulativeBalance from the latest record (single source of truth)
            return {
                employeeId: user.employeeId,
                name: user.name,
                department: user.department || 'N/A',
                pfScheme: user.pfScheme || 'N/A',
                totalContribution,
                totalWithdrawal,
                netBalance: latestRecord ? latestRecord.cumulativeBalance : 0,
                lastContribution: latestRecord ? latestRecord.totalPF : 0
            };
        }));

        res.json(report);
    } catch (error) {
        console.error('Employee Report Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// ─── 3. DEPARTMENT REPORT ───────────────────────────────────────
exports.getDepartmentReport = async (req, res) => {
    try {
        const deptAgg = await PFCalculation.aggregate([
            {
                $group: {
                    _id: '$department',
                    totalPF: { $sum: '$totalPF' },
                    uniqueEmployees: { $addToSet: '$employeeId' },
                    recordCount: { $sum: 1 }
                }
            },
            { $sort: { totalPF: -1 } }
        ]);

        // totalEmployees uses $addToSet (unique employeeIds, not raw row count)
        const report = deptAgg.map(d => ({
            department: d._id || 'Unknown',
            totalEmployees: d.uniqueEmployees.length,
            totalPF: d.totalPF,
            avgContribution: d.uniqueEmployees.length > 0 ? Math.round(d.totalPF / d.uniqueEmployees.length) : 0
        }));

        res.json(report);
    } catch (error) {
        console.error('Department Report Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// ─── 4. COMPLIANCE REPORT ───────────────────────────────────────
exports.getComplianceReport = async (req, res) => {
    try {
        const staffUsers = await User.find({ role: 'Staff', isActive: true }).select('employeeId name').lean();

        const report = await Promise.all(staffUsers.map(async (user) => {
            const issues = [];

            // Fetch all data
            const pfRecords = await PFCalculation.find({ employeeId: user.employeeId }).lean();
            const overrides = await ContributionOverride.find({ employeeId: user.employeeId, status: { $ne: 'rejected' } }).lean();
            const withdrawals = await Withdrawal.find({ employeeId: user.employeeId, status: 'processed' }).lean();

            // Rule 1: Monthly limit check (employeePF > 40000)
            const monthlyViolation = pfRecords.find(r => r.employeePF > 40000);
            if (monthlyViolation) {
                issues.push(`Monthly limit exceeded: ₹${monthlyViolation.employeePF} in ${monthlyViolation.month}/${monthlyViolation.year}`);
            }

            // Rule 2: Yearly limit (sum of employeePF per FY > 500000)
            const fyTotals = {};
            pfRecords.forEach(r => {
                if (!fyTotals[r.financialYear]) fyTotals[r.financialYear] = 0;
                fyTotals[r.financialYear] += r.employeePF;
            });
            Object.entries(fyTotals).forEach(([fy, total]) => {
                if (total > 500000) {
                    issues.push(`Yearly limit exceeded in ${fy}: ₹${total.toLocaleString()}`);
                }
            });

            // Rule 3: Override misuse per FY
            const ovByFY = {};
            overrides.forEach(ov => {
                if (!ovByFY[ov.financialYear]) ovByFY[ov.financialYear] = { increases: 0, decreases: 0, total: 0 };
                if (ov.type === 'increase') ovByFY[ov.financialYear].increases++;
                if (ov.type === 'decrease') ovByFY[ov.financialYear].decreases++;
                ovByFY[ov.financialYear].total++;
            });
            Object.entries(ovByFY).forEach(([fy, counts]) => {
                if (counts.increases > 2) {
                    issues.push(`Excessive increases in ${fy}: ${counts.increases} (max 2)`);
                }
                if (counts.decreases > 0 && counts.increases === 0) {
                    issues.push(`Invalid override in ${fy}: decrease without prior increase`);
                }
                if (counts.total > 3) {
                    issues.push(`Excessive total overrides in ${fy}: ${counts.total} (max 3)`);
                }
            });

            // Rule 4: Withdrawal > 80% of balance
            // Note: Compliance check uses latest balance due to lack of historical snapshot at withdrawal time.
            if (pfRecords.length > 0) {
                const latestBalance = pfRecords.sort((a, b) => (b.year - a.year) || (b.month - a.month))[0].cumulativeBalance;
                withdrawals.forEach(w => {
                    if (w.type === 'part-final' && w.amount > latestBalance * 0.80) {
                        issues.push(`Withdrawal ₹${w.amount.toLocaleString()} exceeds 80% of balance ₹${latestBalance.toLocaleString()}`);
                    }
                });
            }

            return {
                employeeId: user.employeeId,
                name: user.name,
                status: issues.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
                issues
            };
        }));

        res.json(report);
    } catch (error) {
        console.error('Compliance Report Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// ─── 5. CSV EXPORTS ─────────────────────────────────────────────

const escapeCSV = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

exports.exportSummaryCSV = async (req, res) => {
    try {
        const pfAgg = await PFCalculation.aggregate([
            { $group: { _id: null, totalContribution: { $sum: '$totalPF' }, totalEmployeeShare: { $sum: '$employeePF' }, totalEmployerShare: { $sum: '$employerPF' }, uniqueEmployees: { $addToSet: '$employeeId' } } }
        ]);
        const pf = pfAgg[0] || { totalContribution: 0, totalEmployeeShare: 0, totalEmployerShare: 0, uniqueEmployees: [] };

        const wdAgg = await Withdrawal.aggregate([
            { $match: { status: 'processed' } },
            { $group: { _id: '$type', totalAmount: { $sum: '$amount' } } }
        ]);
        let totalAdvance = 0, totalPartFinal = 0;
        wdAgg.forEach(w => {
            if (w._id === 'advance') totalAdvance = w.totalAmount;
            if (w._id === 'part-final') totalPartFinal = w.totalAmount;
        });

        const rows = [
            ['Metric', 'Value'],
            ['Total Employees', pf.uniqueEmployees.length],
            ['Total Contribution', pf.totalContribution],
            ['Employee Share', pf.totalEmployeeShare],
            ['Employer Share', pf.totalEmployerShare],
            ['Total Withdrawals', totalAdvance + totalPartFinal],
            ['Advance Withdrawals', totalAdvance],
            ['Part-Final Withdrawals', totalPartFinal],
        ];

        const csv = rows.map(r => r.map(escapeCSV).join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=pf_summary_report.csv');
        res.send(csv);
    } catch (error) {
        console.error('Export Summary CSV Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.exportEmployeesCSV = async (req, res) => {
    try {
        const staffUsers = await User.find({ role: 'Staff', isActive: true }).select('employeeId name department pfScheme').lean();

        const header = ['Employee ID', 'Name', 'Department', 'PF Scheme', 'Total Contribution', 'Total Withdrawal', 'Net Balance', 'Last Contribution'];
        const dataRows = await Promise.all(staffUsers.map(async (user) => {
            const pfRecords = await PFCalculation.find({ employeeId: user.employeeId }).sort({ year: -1, month: -1 }).lean();
            const processedWithdrawals = await Withdrawal.find({ employeeId: user.employeeId, status: 'processed' }).lean();

            const totalContribution = pfRecords.reduce((sum, r) => sum + r.totalPF, 0);
            const totalWithdrawal = processedWithdrawals.reduce((sum, w) => sum + w.amount, 0);
            const latestRecord = pfRecords[0] || null;

            return [
                user.employeeId,
                user.name,
                user.department || 'N/A',
                user.pfScheme || 'N/A',
                totalContribution,
                totalWithdrawal,
                latestRecord ? latestRecord.cumulativeBalance : 0,
                latestRecord ? latestRecord.totalPF : 0
            ];
        }));

        const csv = [header, ...dataRows].map(r => r.map(escapeCSV).join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=pf_employee_report.csv');
        res.send(csv);
    } catch (error) {
        console.error('Export Employees CSV Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.exportDepartmentsCSV = async (req, res) => {
    try {
        const deptAgg = await PFCalculation.aggregate([
            { $group: { _id: '$department', totalPF: { $sum: '$totalPF' }, uniqueEmployees: { $addToSet: '$employeeId' } } },
            { $sort: { totalPF: -1 } }
        ]);

        const header = ['Department', 'Total Employees', 'Total PF', 'Avg Contribution'];
        const dataRows = deptAgg.map(d => [
            d._id || 'Unknown',
            d.uniqueEmployees.length,
            d.totalPF,
            d.uniqueEmployees.length > 0 ? Math.round(d.totalPF / d.uniqueEmployees.length) : 0
        ]);

        const csv = [header, ...dataRows].map(r => r.map(escapeCSV).join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=pf_department_report.csv');
        res.send(csv);
    } catch (error) {
        console.error('Export Departments CSV Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.exportComplianceCSV = async (req, res) => {
    try {
        const staffUsers = await User.find({ role: 'Staff', isActive: true }).select('employeeId name').lean();

        const header = ['Employee ID', 'Name', 'Status', 'Issues'];
        const dataRows = await Promise.all(staffUsers.map(async (user) => {
            const issues = [];
            const pfRecords = await PFCalculation.find({ employeeId: user.employeeId }).lean();
            const overrides = await ContributionOverride.find({ employeeId: user.employeeId, status: { $ne: 'rejected' } }).lean();
            const withdrawals = await Withdrawal.find({ employeeId: user.employeeId, status: 'processed' }).lean();

            const monthlyViolation = pfRecords.find(r => r.employeePF > 40000);
            if (monthlyViolation) issues.push(`Monthly limit exceeded: ${monthlyViolation.employeePF} in ${monthlyViolation.month}/${monthlyViolation.year}`);

            const fyTotals = {};
            pfRecords.forEach(r => { fyTotals[r.financialYear] = (fyTotals[r.financialYear] || 0) + r.employeePF; });
            Object.entries(fyTotals).forEach(([fy, total]) => { if (total > 500000) issues.push(`Yearly limit exceeded in ${fy}: ${total}`); });

            const ovByFY = {};
            overrides.forEach(ov => {
                if (!ovByFY[ov.financialYear]) ovByFY[ov.financialYear] = { increases: 0, decreases: 0, total: 0 };
                if (ov.type === 'increase') ovByFY[ov.financialYear].increases++;
                if (ov.type === 'decrease') ovByFY[ov.financialYear].decreases++;
                ovByFY[ov.financialYear].total++;
            });
            Object.entries(ovByFY).forEach(([fy, counts]) => {
                if (counts.increases > 2) issues.push(`Excessive increases in ${fy}: ${counts.increases}`);
                if (counts.decreases > 0 && counts.increases === 0) issues.push(`Invalid override in ${fy}`);
                if (counts.total > 3) issues.push(`Excessive total overrides in ${fy}: ${counts.total}`);
            });

            if (pfRecords.length > 0) {
                const latestBalance = pfRecords.sort((a, b) => (b.year - a.year) || (b.month - a.month))[0].cumulativeBalance;
                withdrawals.forEach(w => {
                    if (w.type === 'part-final' && w.amount > latestBalance * 0.80) issues.push(`Withdrawal ${w.amount} exceeds 80% of balance ${latestBalance}`);
                });
            }

            return [
                user.employeeId,
                user.name,
                issues.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
                issues.join('; ') || 'None'
            ];
        }));

        const csv = [header, ...dataRows].map(r => r.map(escapeCSV).join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=pf_compliance_report.csv');
        res.send(csv);
    } catch (error) {
        console.error('Export Compliance CSV Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

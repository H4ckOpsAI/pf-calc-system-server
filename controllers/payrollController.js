const ContributionOverride = require('../models/ContributionOverride');
const Withdrawal = require('../models/Withdrawal');
const AdvanceRepayment = require('../models/AdvanceRepayment');
const xlsx = require('xlsx');
const EmployeeTemp = require('../models/EmployeeTemp');
const PFCalculation = require('../models/PFCalculation');
const User = require('../models/User');
const { logActivity } = require('../utils/logger');

// Helper: Get Contribution Rate
const getContributionRate = (scheme) => {
    if (scheme === 'CPF') return 0.10;
    if (scheme === 'GPF') return 0.06;
    return 0; // Default or Error
};

// Upload Payroll - Parse Excel and Store in Temp
exports.uploadPayroll = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        if (!data || data.length === 0) {
            return res.status(400).json({ message: 'Excel file is empty' });
        }

        const validRecords = [];
        const errors = [];
        const employeeIdsInFile = new Set(); // Check for duplicate IDs in the same file

        // 1. Validation Loop
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowNumber = i + 2; // Excel row number (1-index + header)

            // Map Excel columns (CamelCase as per template)
            const {
                employeeId,
                staffName,
                designation,
                department,
                staffCategory: staffCategoryRaw, // Rename to avoid conflict with validated variable
                pfScheme: pfSchemeRaw,           // Rename to avoid conflict with validated variable
                basicPay,
                month,
                year
            } = row;

            // Basic Validation for non-numeric/non-enum fields
            if (!employeeId || !staffName || !designation || !department || !staffCategoryRaw || !pfSchemeRaw || !month || !year) {
                errors.push(`Row ${rowNumber}: Missing required fields.`);
                continue;
            }

            // Validate Basic Pay
            if (basicPay <= 0 || isNaN(basicPay)) {
                errors.push(`Row ${rowNumber}: Invalid Basic Pay.`);
                continue;
            }

            // check duplicate in file
            if (employeeIdsInFile.has(employeeId)) {
                errors.push(`Row ${rowNumber}: Duplicate Employee ID ${employeeId} in file.`);
                continue;
            }
            employeeIdsInFile.add(employeeId);


            // Validate Staff Category
            const staffCategory = staffCategoryRaw.trim();
            if (!['Teaching', 'NonTeaching'].includes(staffCategory)) {
                errors.push(`Row ${rowNumber}: Invalid Staff Category '${staffCategory}'. Must be Teaching or NonTeaching.`);
                continue;
            }

            // Validate PF Scheme
            const pfScheme = pfSchemeRaw.trim();
            if (!['CPF', 'GPF'].includes(pfScheme)) {
                errors.push(`Row ${rowNumber}: Invalid PF Scheme '${pfScheme}'. Must be CPF or GPF.`);
                continue;
            }

            // Validate Basic Pay
            if (isNaN(basicPay) || Number(basicPay) <= 0) {
                errors.push(`Row ${rowNumber}: Invalid Basic Pay '${basicPay}'. Must be a positive number.`);
                continue;
            }

            // Validate Month and Year
            const parsedMonth = parseInt(month, 10);
            const parsedYear = parseInt(year, 10);
            if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
                errors.push(`Row ${rowNumber}: Invalid Month '${month}'.`);
                continue;
            }
            if (isNaN(parsedYear) || parsedYear < 2000) {
                errors.push(`Row ${rowNumber}: Invalid Year '${year}'.`);
                continue;
            }

            // Calculate Financial Year
            let financialYear;
            if (parsedMonth >= 4) {
                financialYear = `${parsedYear}-${parsedYear + 1}`;
            } else {
                financialYear = `${parsedYear - 1}-${parsedYear}`;
            }

            // Validate Employee Exists and is Eligible
            const user = await User.findOne({ employeeId });
            if (!user) {
                errors.push(`Row ${rowNumber}: Employee ID '${employeeId}' not found in system.`);
                continue;
            }
            if (user.role !== 'Staff') {
                errors.push(`Row ${rowNumber}: Employee ID '${employeeId}' is a ${user.role} and is not eligible for PF calculation.`);
                continue;
            }
            if (!user.isActive) {
                errors.push(`Row ${rowNumber}: Employee ID '${employeeId}' is currently inactive.`);
                continue;
            }

            // Add to Valid Records
            validRecords.push({
                employeeId,
                staffName,
                designation,
                department,
                staffCategory,
                pfScheme,
                basicPay: Number(basicPay),
                month: parsedMonth,
                year: parsedYear,
                financialYear,
                uploadedBy: req.user._id,
                uploadedAt: new Date()
            });
        }

        // 2. If Errors, Reject Entire Upload (Strict Mode) or Partial?
        // Let's reject if any error exists to ensure clean data for processing.
        if (errors.length > 0) {
            return res.status(400).json({
                message: 'Validation Failed',
                errors
            });
        }

        // 3. Clear Previous Temp Data (Assuming single upload per session/month logic for now)
        // Or we warn the user. For now, let's clear existing temp for simplicity of this module.
        await EmployeeTemp.deleteMany({});

        // 4. Save to Database
        await EmployeeTemp.insertMany(validRecords);

        res.status(201).json({
            message: 'Payroll uploaded successfully',
            count: validRecords.length,
            records: validRecords
        });

    } catch (error) {
        console.error('Upload Payroll Error:', error);
        res.status(500).json({ message: 'Server Error during upload' });
    }
};

// Get Temp Payroll Data (Preview)
exports.getTempPayroll = async (req, res) => {
    try {
        const records = await EmployeeTemp.find().sort({ uploadedAt: -1 });
        res.json(records);
    } catch (error) {
        console.error('Get Temp Payroll Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Process Payroll - Calculate PF and Save
exports.processPayroll = async (req, res) => {
    try {
        // 1. Fetch Temp Records
        const tempRecords = await EmployeeTemp.find();

        if (tempRecords.length === 0) {
            return res.status(400).json({ message: 'No pending payroll records to process.' });
        }

        const calculatedRecords = [];
        const runningBalances = {}; // Track balances locally if processing multiple records

        // 2. Calculation Loop
        for (const record of tempRecords) {
            const { employeeId, staffName, designation, department, staffCategory, pfScheme, basicPay, month, year, financialYear } = record;

            // Activity 3.x: Duplicate Prevention
            const existingRecord = await PFCalculation.findOne({ employeeId, month, year });
            if (existingRecord) {
                return res.status(400).json({ message: `Duplicate processing blocked: PF for ${staffName} (${employeeId}) for ${month}/${year} already exists.` });
            }

            // Activity 3.x: Fetch previous balance
            if (runningBalances[employeeId] === undefined) {
                const previousRecord = await PFCalculation.findOne({ employeeId }).sort({ year: -1, month: -1 });
                runningBalances[employeeId] = previousRecord ? previousRecord.cumulativeBalance : 0;
            }

            // Define Payroll Date mapping
            const payrollDate = new Date(year, month - 1);

            // Fetch active override applying to future payroll ONLY
            const override = await ContributionOverride.findOne({ 
                employeeId, 
                status: 'approved',
                approvedAt: { $lte: payrollDate }
            }).sort({ approvedAt: -1 });

            let overrideApplied = false;
            const rate = getContributionRate(pfScheme);
            let basePF = Math.round(basicPay * rate);
            let employeePF;

            if (override) {
                employeePF = override.amount; // persistent value
                overrideApplied = true;
            } else {
                employeePF = basePF;
            }

            console.log({
                month,
                basePF,
                override: override?.amount,
                finalPF: employeePF
            });

            // Task 1: Strict Monthly Limit on EmployeePF
            if (employeePF > 40000) {
                employeePF = 40000;
            }

            // Task 1: Strict Yearly Limit (5,00,000)
            const previousYearly = await PFCalculation.aggregate([
                { $match: { employeeId, financialYear } },
                { $group: { _id: null, total: { $sum: '$employeePF' } } }
            ]);
            let currentYearlySum = previousYearly.length > 0 ? previousYearly[0].total : 0;

            if (currentYearlySum + employeePF > 500000) {
                employeePF = 500000 - currentYearlySum;
                if (employeePF < 0) employeePF = 0;
            }

            // Employer Contribution Logic (CPF only)
            let employerPF = 0;
            if (pfScheme === 'CPF') {
                employerPF = Math.round(basicPay * 0.10); // Employer always matches 10%
            }

            let advanceDeduction = 0;
            let appliedAdvance = null;

            const advanceWithdrawal = await Withdrawal.findOne({
                employeeId,
                type: 'advance',
                status: 'approved',
                processedAt: { $exists: false }
            }).sort({ approvedAt: 1 });
            
            if (advanceWithdrawal) {
                advanceDeduction = advanceWithdrawal.amount;
                appliedAdvance = advanceWithdrawal;
            }

            const totalPF = employeePF + employerPF;

            const withdrawal = await Withdrawal.findOne({
                employeeId,
                type: 'part-final',
                status: 'approved',
                processedAt: { $exists: false }
            }).sort({ approvedAt: 1 });

            let partFinalWithdrawal = 0;
            let appliedWithdrawal = null;

            if (withdrawal) {
                partFinalWithdrawal = withdrawal.amount;
                appliedWithdrawal = withdrawal;
            }

            // Activity 3.x: Process Active Advance EMI
            const activeAdvance = await AdvanceRepayment.findOne({ employeeId, isActive: true });
            let advanceEMI = 0;

            if (activeAdvance) {
                advanceEMI = activeAdvance.monthlyInstallment;
                
                if (activeAdvance.remainingBalance <= advanceEMI) {
                    advanceEMI = activeAdvance.remainingBalance;
                    activeAdvance.isActive = false;
                    activeAdvance.monthsRemaining = 0;
                    activeAdvance.remainingBalance = 0;
                } else {
                    activeAdvance.monthsRemaining -= 1;
                    activeAdvance.remainingBalance -= advanceEMI;
                    if (activeAdvance.monthsRemaining <= 0) activeAdvance.isActive = false;
                }
                await activeAdvance.save();
            }

            const cumulativeBalance = runningBalances[employeeId] + totalPF - advanceDeduction + advanceEMI - partFinalWithdrawal;
            runningBalances[employeeId] = cumulativeBalance;

            if (appliedWithdrawal) {
                appliedWithdrawal.processedAt = new Date();
                appliedWithdrawal.status = 'processed';
                await appliedWithdrawal.save();
            }

            if (appliedAdvance) {
                appliedAdvance.processedAt = new Date();
                appliedAdvance.status = 'processed';
                await appliedAdvance.save();
            }

            console.log({
                withdrawalFound: !!withdrawal,
                partFinalWithdrawal,
                advanceDeduction,
                cumulativeBalance
            });

            calculatedRecords.push({
                employeeId,
                staffName,
                designation,
                department,
                staffCategory,
                pfScheme,
                basicPay,
                employeePF,
                employerPF,
                totalPF,
                overrideApplied,
                advanceEMI,
                partFinalWithdrawal,
                cumulativeBalance,
                financialYear,
                processedBy: req.user._id,
                processedAt: new Date(),
                month,
                year
            });
        }

        // 3. Save to PFCalculation Collection
        await PFCalculation.insertMany(calculatedRecords);

        // 4. Clear Temp Records
        await EmployeeTemp.deleteMany({});

        await logActivity({
            userId: req.user._id,
            role: req.user.role,
            action: 'PROCESS_PAYROLL',
            details: `Processed payroll mapping ${calculatedRecords.length} records successfully.`
        });

        res.json({
            message: 'Payroll processed successfully',
            count: calculatedRecords.length,
            records: calculatedRecords
        });

    } catch (error) {
        console.error('Process Payroll Error:', error);
        res.status(500).json({ message: 'Server Error during processing' });
    }
};

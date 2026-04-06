const xlsx = require('xlsx');
const EmployeeTemp = require('../models/EmployeeTemp');
const PFCalculation = require('../models/PFCalculation');
const User = require('../models/User');

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
                basicPay
            } = row;

            // Basic Validation for non-numeric/non-enum fields
            if (!employeeId || !staffName || !designation || !department || !staffCategoryRaw || !pfSchemeRaw) {
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

            // Validate Employee Exists in System
            const user = await User.findOne({ employeeId });
            if (!user) {
                errors.push(`Row ${rowNumber}: Employee ID '${employeeId}' not found in system.`);
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

        // 2. Calculation Loop
        for (const record of tempRecords) {
            const { employeeId, staffName, designation, department, staffCategory, pfScheme, basicPay } = record;

            // Activity 2.3 & 3.1: Dynamic Rule Selection & Calculation
            const rate = getContributionRate(pfScheme);

            // Standard Rounding (Math.round)
            const employeePF = Math.round(basicPay * rate);

            // Employer Contribution Logic (CPF only)
            let employerPF = 0;
            if (pfScheme === 'CPF') {
                employerPF = Math.round(basicPay * 0.10); // Employer always matches 10% for CPF
            } else {
                employerPF = 0; // GPF has 0 employer contribution
            }

            const totalPF = employeePF + employerPF;

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
                processedBy: req.user._id,
                processedAt: new Date(),
                month: new Date().getMonth() + 1, // Store current processing month (Simple version)
                year: new Date().getFullYear()
            });
        }

        // 3. Save to PFCalculation Collection
        await PFCalculation.insertMany(calculatedRecords);

        // 4. Clear Temp Records
        await EmployeeTemp.deleteMany({});

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

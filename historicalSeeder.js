const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');

// Models
const User = require('./models/User');
const PFCalculation = require('./models/PFCalculation');
const ContributionOverride = require('./models/ContributionOverride');
const Withdrawal = require('./models/Withdrawal');
const AdvanceRepayment = require('./models/AdvanceRepayment');
const PFTaxDetail = require('./models/PFTaxDetail');
const Increment = require('./models/Increment');

const runSeeder = async () => {
    try {
        console.log("=== STARTING HISTORICAL SEEDER (2020-2026) ===");
        
        await mongoose.connect('mongodb://127.0.0.1:27017/pf_calc_sys_rbac');
        console.log('MongoDB Connected for Seeder (pf_calc_sys_rbac)');

        // 1. Wipe Staff users and all PF data
        console.log("Wiping Staff users and PF data...");
        const adminUsers = await User.find({ role: { $in: ['Admin', 'PayrollOfficer'] } });
        const adminIds = adminUsers.map(a => a._id);
        
        await User.deleteMany({ role: { $nin: ['Admin', 'PayrollOfficer'] } });
        await PFCalculation.deleteMany({});
        await ContributionOverride.deleteMany({});
        await Withdrawal.deleteMany({});
        await AdvanceRepayment.deleteMany({});
        await PFTaxDetail.deleteMany({});
        await Increment.deleteMany({});
        console.log("Database wiped.");

        // 2. Parse Excel File
        console.log("Parsing Excel File...");
        const workbook = xlsx.readFile('d:\\se project\\reports\\seeding_data_js.xlsx');
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
        
        console.log(`Found ${data.length} rows in Excel.`);
        if(data.length === 0) throw new Error("Excel is empty!");

        // 3. Create Users
        console.log("Creating User Accounts...");
        const usersMap = {};
        for (const row of data) {
            // Support both "Name" and "StaffName" columns
            const name = row['Name'] || row['Staff Name'] || row['StaffName'] || row['name'] || row['staffName'];
            const employeeId = row['Employee ID'] || row['EmployeeID'] || row['employeeId'] || row['Emp ID'];
            const designation = row['Designation'] || row['designation'] || 'Staff';
            const department = row['Department'] || row['department'] || 'General';
            const staffCategory = row['Staff Category'] || row['staffCategory'] || 'Teaching';
            const pfScheme = row['PF Scheme'] || row['pfScheme'] || 'CPF';
            const basicPay = Number(row['Basic Pay'] || row['basicPay'] || 50000);

            if (!name || !employeeId) {
                console.log("Skipping invalid row missing Name or EmployeeID", row);
                continue;
            }

            // Create clean email/password
            const cleanName = name.trim().toLowerCase().replace(/\s+/g, '');
            const email = `${cleanName}@ptuniv.edu.in`;
            const rawPassword = `${cleanName}123`;
            const hashedPassword = await bcrypt.hash(rawPassword, 10);

            let user = await User.findOne({ employeeId });
            if (!user) {
                user = new User({
                    name: name.trim(),
                    email,
                    password: hashedPassword,
                    role: 'Staff',
                    employeeId,
                    designation,
                    department,
                    staffCategory,
                    pfScheme,
                    isActive: true
                });
                await user.save();
                usersMap[employeeId] = { user, basicPay, pfScheme };
                console.log(`Created User: ${name} (${email}) | Pass: ${rawPassword}`);
            }
        }

        // 4. Time Travel Simulation (April 2020 to March 2026)
        console.log("Starting Time Travel Simulation (2020-2026)...");
        const START_YEAR = 2020;
        const END_YEAR = 2026;
        const END_MONTH = 3; // Stop after March 2026
        
        let cumulativeBalances = {};
        let activeAdvances = {};
        let activeOverrides = {}; // employeeId -> amount

        for (let y = START_YEAR; y <= END_YEAR; y++) {
            let startM = (y === START_YEAR) ? 4 : 1;
            let endM = (y === END_YEAR) ? END_MONTH : 12;

            for (let m = startM; m <= endM; m++) {
                const financialYear = m >= 4 ? `${y}-${y+1}` : `${y-1}-${y}`;
                const historicalDate = new Date(y, m - 1, 28); // End of month

                // Random Actions per month (simulate historical events)
                for (const empId of Object.keys(usersMap)) {
                    const empData = usersMap[empId];
                    const uid = empData.user._id;

                    // 1% chance per month to apply an Override
                    if (Math.random() < 0.01) {
                        const overrideAmt = Math.floor(Math.random() * 5000) + 1000;
                        await ContributionOverride.create({
                            employeeId: empId,
                            type: 'increase',
                            amount: overrideAmt,
                            status: 'approved',
                            requestedAt: historicalDate,
                            approvedAt: historicalDate,
                            requestedBy: uid,
                            financialYear: financialYear
                        });
                        activeOverrides[empId] = overrideAmt;
                        await Increment.create({
                            user_id: uid,
                            increment_amount: overrideAmt,
                            year: y,
                            increment_count: 1 // Simplified for seeder
                        });
                        console.log(`[${m}/${y}] ${empId} increased contribution by ${overrideAmt}`);
                    }

                    // 0.5% chance to take a Part-Final Withdrawal
                    if (Math.random() < 0.005 && (cumulativeBalances[empId] || 0) > 100000) {
                        const wAmt = Math.floor((cumulativeBalances[empId] || 0) * 0.5); // 50%
                        await Withdrawal.create({
                            employeeId: empId,
                            type: 'part-final',
                            amount: wAmt,
                            status: 'processed',
                            requestedAt: historicalDate,
                            approvedAt: historicalDate,
                            processedAt: historicalDate,
                            cooldownUntil: new Date(y+1, m-1, 28), // 1 yr cooldown
                            requestedBy: uid,
                            financialYear: financialYear
                        });
                        cumulativeBalances[empId] -= wAmt;
                        console.log(`[${m}/${y}] ${empId} took part-final withdrawal of ${wAmt}`);
                    }
                }

                // PROCESS PAYROLL FOR THIS MONTH
                let batchRecords = [];
                for (const empId of Object.keys(usersMap)) {
                    const empData = usersMap[empId];
                    let { basicPay, pfScheme } = empData;
                    
                    let employeePF = (pfScheme === 'CPF') ? Math.round(basicPay * 0.10) : Math.round(basicPay * 0.06);
                    if (activeOverrides[empId]) employeePF += activeOverrides[empId];
                    if (employeePF > 40000) employeePF = 40000;

                    let employerPF = (pfScheme === 'CPF') ? Math.round(basicPay * 0.10) : 0;
                    let totalPF = employeePF + employerPF;

                    cumulativeBalances[empId] = (cumulativeBalances[empId] || 0) + totalPF;

                    // Tiered Tax Logic based on cumulative balance (Charu's spec)
                    let tax = 0;
                    if (cumulativeBalances[empId] > 2000000) tax = Math.round(totalPF * 0.07);
                    else if (cumulativeBalances[empId] > 1000000) tax = Math.round(totalPF * 0.05);
                    else if (cumulativeBalances[empId] >= 700000) tax = Math.round(totalPF * 0.03);

                    cumulativeBalances[empId] -= tax;

                    batchRecords.push({
                        employeeId: empId,
                        staffName: empData.user.name,
                        designation: empData.user.designation,
                        department: empData.user.department,
                        staffCategory: empData.user.staffCategory,
                        pfScheme: pfScheme,
                        basicPay,
                        employeePF,
                        employerPF,
                        totalPF,
                        tax,
                        overrideApplied: !!activeOverrides[empId],
                        advanceEMI: 0,
                        partFinalWithdrawal: 0,
                        cumulativeBalance: cumulativeBalances[empId],
                        financialYear,
                        processedBy: adminIds[0] || empData.user._id, // fallback
                        processedAt: historicalDate,
                        month: m,
                        year: y
                    });
                }
                
                if (batchRecords.length > 0) {
                    await PFCalculation.insertMany(batchRecords);
                }
            }
        }

        // 5. Sync PFTaxDetails for Dashboards
        console.log("Syncing Final PFTaxDetails...");
        for (const empId of Object.keys(usersMap)) {
            const uid = usersMap[empId].user._id;
            const trueTotal = cumulativeBalances[empId] || 0;
            
            let tax_percentage = 0;
            if (trueTotal > 2000000) tax_percentage = 7;
            else if (trueTotal > 1000000) tax_percentage = 5;
            else if (trueTotal >= 700000) tax_percentage = 3;

            const tax_amount = (trueTotal * tax_percentage) / 100;
            const net_pf = trueTotal - tax_amount;

            await PFTaxDetail.create({
                user_id: uid,
                pf_amount: trueTotal,
                tax_percentage,
                tax_amount,
                net_pf
            });
        }

        console.log("=== SEEDER COMPLETED SUCCESSFULLY ===");
        process.exit(0);

    } catch (error) {
        console.error("Seeder failed:", error);
        process.exit(1);
    }
};

runSeeder();

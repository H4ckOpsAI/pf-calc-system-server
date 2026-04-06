const Permission = require('../models/Permission');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const seedPermissions = async () => {
    try {
        // 1. Seed Permissions (Upsert to ensure they exist without duplicates)
        const roles = ['Admin', 'PayrollOfficer', 'Staff'];
        const defaultPermissions = {
            'Admin': { canViewPayroll: true, canCalculatePayroll: true, canConfigureRules: true, canManageUsers: true },
            'PayrollOfficer': { canViewPayroll: true, canCalculatePayroll: true, canConfigureRules: true, canManageUsers: false },
            'Staff': { canViewPayroll: false, canCalculatePayroll: false, canConfigureRules: false, canManageUsers: false }
        };

        for (const role of roles) {
            await Permission.findOneAndUpdate(
                { role },
                { role, ...defaultPermissions[role] },
                { upsert: true, new: true }
            );
        }
        console.log('Permissions Verified/Seeded');

        // 2. Seed Admin User (Check if exists)
        const adminExists = await User.findOne({ email: 'admin@example.com' });
        if (!adminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('admin123', salt);

            await User.create({
                employeeId: 'ADMIN001',
                name: 'System Admin',
                email: 'admin@example.com',
                password: hashedPassword,
                role: 'Admin',
                staffCategory: 'Teaching',
                pfScheme: 'CPF'
            });
            console.log('Admin User Created');
        } else {
            console.log('Admin User already exists');
        }

        // 3. Seed Sample Payroll Officer (Check if exists)
        const poExists = await User.findOne({ email: 'payroll@example.com' });
        if (!poExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('admin123', salt);

            await User.create({
                employeeId: 'PO001',
                name: 'Payroll Officer',
                email: 'payroll@example.com',
                password: hashedPassword,
                role: 'PayrollOfficer',
                staffCategory: 'NonTeaching',
                pfScheme: 'CPF'
            });
            console.log('Payroll Officer Created');
        } else {
            console.log('Payroll Officer already exists');
        }



    } catch (error) {
        console.error('Error seeding data:', error);
    }
};

module.exports = seedPermissions;

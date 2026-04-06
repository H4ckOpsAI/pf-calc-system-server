require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Permission = require('./models/Permission');
const bcrypt = require('bcryptjs');

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('Connected to DB');
        await seedDB();
    })
    .catch(err => console.error(err));

async function seedDB() {
    try {
        // Seed Permissions
        const roles = ['Admin', 'PayrollOfficer', 'Staff'];
        for (const role of roles) {
            const exists = await Permission.findOne({ role });
            if (!exists) {
                const perms = {
                    role,
                    canViewPayroll: role === 'PayrollOfficer',
                    canCalculatePayroll: role === 'PayrollOfficer',
                    canConfigureRules: role === 'Admin',
                    canManageUsers: role === 'Admin'
                };
                await Permission.create(perms);
                console.log(`Created permissions for ${role}`);
            }
        }

        // Seed Admin User
        const adminEmail = 'admin@example.com';
        const adminExists = await User.findOne({ email: adminEmail });
        if (!adminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('admin123', salt);
            await User.create({
                name: 'Administrator',
                email: adminEmail,
                password: hashedPassword,
                role: 'Admin'
            });
            console.log('Admin user created');
        } else {
            console.log('Admin user already exists');
        }

        console.log('Seeding Complete');
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

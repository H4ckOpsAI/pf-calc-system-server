const User = require('../models/User');
const Permission = require('../models/Permission');
const LoginLog = require('../models/LoginLog');
const ActivityLog = require('../models/ActivityLog');
const { logActivity } = require('../utils/logger');
const bcrypt = require('bcryptjs');

exports.createUser = async (req, res) => {
    try {
        const { name, email, password, role, employeeId, designation, department, staffCategory, pfScheme } = req.body;
        const userExists = await User.findOne({
            $or: [{ email }, { employeeId }]
        });
        if (userExists) return res.status(400).json({ message: 'User already exists (Email or Employee ID)' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            employeeId,
            name,
            email,
            password: hashedPassword,
            role: role || 'Staff',
            designation,
            department,
            staffCategory,
            pfScheme
        });

        res.status(201).json({ message: 'User created successfully', user });
        
        await logActivity({
            userId: req.user._id, // Assume created by the current admin/user. Wait, what if it's public register?
            role: req.user ? req.user.role : 'System',
            action: 'USER_CREATION',
            targetUserId: user._id,
            details: `Created new user: ${user.email} (${user.role})`
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.updateUserRole = async (req, res) => {
    try {
        const { userId, role } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.role = role;
        await user.save();
        res.json({ message: 'User role updated', user });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.toggleUserStatus = async (req, res) => {
    try {
        const { userId, isActive } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.isActive = isActive;
        await user.save();
        res.json({ message: 'User status updated', user });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

// Permissions
exports.getPermissions = async (req, res) => {
    try {
        const permissions = await Permission.find();
        res.json(permissions);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.updatePermission = async (req, res) => {
    try {
        const { role, permissions } = req.body; // permissions object { canViewPayroll: true, ... }

        let permDoc = await Permission.findOne({ role });
        if (!permDoc) {
            permDoc = new Permission({ role });
        }

        Object.keys(permissions).forEach(key => {
            permDoc[key] = permissions[key];
        });

        await permDoc.save();
        res.json({ message: 'Permissions updated', permission: permDoc });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getLoginLogs = async (req, res) => {
    try {
        const logs = await ActivityLog.find({}).populate('userId', 'name email employeeId').sort({ timestamp: -1 });
        res.json(logs);
    } catch (error) {
        console.error('Get Activity Logs Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { name, phone } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (name) user.name = name;
        if (phone !== undefined) user.phone = phone; // Allow clearing phone
        await user.save();

        await logActivity({
            userId: req.user._id,
            role: req.user.role,
            action: 'UPDATE_PROFILE',
            details: 'Updated profile settings.'
        });

        res.json({ message: 'Profile updated successfully', user: { name: user.name, phone: user.phone, email: user.email } });
    } catch (error) {
        console.error('Profile Update Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

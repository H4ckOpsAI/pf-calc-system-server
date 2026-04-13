const User = require('../models/User');
const Permission = require('../models/Permission');
const LoginLog = require('../models/LoginLog');
const ActivityLog = require('../models/ActivityLog');
const { logActivity } = require('../utils/logger');
const transporter = require('../utils/mailer');
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
        const logs = await ActivityLog.find({})
            .populate('userId', 'name email employeeId')
            .populate('targetUserId', 'name email employeeId')
            .sort({ timestamp: -1 });
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
            action: 'PROFILE_UPDATE',
            details: `Updated profile settings for ${req.user.email}`
        });

        res.json({ message: 'Profile updated successfully', user: { name: user.name, phone: user.phone, email: user.email } });
    } catch (error) {
        console.error('Profile Update Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({
            name: user.name,
            email: user.email,
            employeeId: user.employeeId,
            role: user.role,
            department: user.department,
            designation: user.designation,
            pfScheme: user.pfScheme,
            phone: user.phone
        });
    } catch (error) {
        console.error('Get Profile Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Both current and new password are required.' });
        }

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Incorrect current password' });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        await logActivity({
            userId: req.user._id,
            role: req.user.role,
            action: 'CHANGE_PASSWORD',
            details: 'User changed their password successfully.'
        });

        res.json({ message: 'Password changed successfully.' });
    } catch (error) {
        console.error('Change Password Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required.' });

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'No account found with this email.' });

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetOtp = otp;
        user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await user.save();

        console.log(`[OTP] For ${email}: ${otp}`);

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: `OTP for ${email}`,
            text: `OTP for ${email}: ${otp}\n\nThis OTP is valid for 10 minutes.`
        });

        await logActivity({
            userId: user._id,
            role: user.role,
            action: 'FORGOT_PASSWORD_REQUEST',
            details: `OTP requested for email: ${email}`
        });

        res.json({ message: 'OTP sent to registered email.' });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: 'Email, OTP, and new password are required.' });
        }

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'No account found with this email.' });

        if (user.resetOtp !== otp) {
            await logActivity({ userId: user._id, role: user.role, action: 'PASSWORD_RESET_FAILED', details: `Invalid OTP attempt for email: ${email}` });
            return res.status(400).json({ message: 'Invalid OTP.' });
        }
        if (!user.otpExpiry || Date.now() > user.otpExpiry.getTime()) {
            await logActivity({ userId: user._id, role: user.role, action: 'PASSWORD_RESET_FAILED', details: `Expired OTP attempt for email: ${email}` });
            return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        // Clear OTP (single-use)
        user.resetOtp = undefined;
        user.otpExpiry = undefined;
        await user.save();

        await logActivity({ userId: user._id, role: user.role, action: 'PASSWORD_RESET_SUCCESS', details: `Password reset successfully for email: ${email}` });

        res.json({ message: 'Password reset successfully. You can now log in.' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

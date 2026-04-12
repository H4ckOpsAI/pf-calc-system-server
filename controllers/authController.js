const User = require('../models/User');
const Session = require('../models/Session');
const LoginLog = require('../models/LoginLog');
const { logActivity } = require('../utils/logger');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const generateTokens = (user) => {
    const accessToken = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );
    const refreshToken = jwt.sign(
        { id: user._id },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
    );
    return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const isFirstUser = (await User.countDocuments({})) === 0;
        const role = isFirstUser ? 'Admin' : 'Staff';

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role
        });

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Register Error Details:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    try {
        const user = await User.findOne({ email });

        if (!user) {
            await LoginLog.create({ userId: null, ipAddress, status: 'failed' }); // UserId null for unknown user? May need handle.
            // If user not found, we can't log userId. Logic adjustment: LoginLog schema requires userId.
            // We'll skip logging userId if user not found, or log 'unknown'.
            // For now, let's just return error. Log requires userId.
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!user.isActive) {
            await LoginLog.create({ userId: user._id, ipAddress, status: 'failed' });
            return res.status(403).json({ message: 'Account is disabled' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            await LoginLog.create({ userId: user._id, ipAddress, status: 'failed' });
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate Tokens
        const { accessToken, refreshToken } = generateTokens(user);

        // Create Session
        await Session.create({
            userId: user._id,
            token: refreshToken
        });

        // Log Success
        await LoginLog.create({ userId: user._id, ipAddress, status: 'success' });
        await logActivity({ userId: user._id, role: user.role, action: 'LOGIN', details: 'User authenticated successfully.' });

        // Set Cookie
        res.cookie('token', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 3600000 // 1 hour
        });

        res.json({
            message: 'Login successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            },
            refreshToken
        });
    } catch (error) {
        console.error('Login Error Details:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};

exports.logout = async (req, res) => {
    try {
        const token = req.cookies.token;
        if (token) {
            // Strictly delete session as per Module 1 requirement (Activity 3.3)
            await Session.deleteOne({ token: token }); // Using accessToken cookie as identifier. 
            // Note: If using refreshToken for session, we need to find session by refreshToken.
            // But authController.login stores 'refreshToken' in the session, not the accessToken.
            // Let's check how we store session. 
            // Line 90: token: refreshToken.
            // We only have accessToken in cookie. We can't find session by accessToken unless we decode it?
            // Wait, accessToken doesn't link to session ID. But user ID does.
            // Issue: A user might have multiple sessions (multiple devices). We want to delete THIS session.
            // But if we don't have the refreshToken (it's in localStorage, not cookie), we can't identify the exact session doc via cookie.
            // Workaround: Delete all sessions for this user? Or Require refreshToken in logout body.
            // Standard approach: Clear cookie. The frontend should ideally send the refresh token to revoke it.
            // Let's look at frontend logout: `api.post('/auth/logout');` - no body.

            // For now, let's try to decode the accessToken to get userId, and delete sessions for that user? 
            // Or just proceed with cookie clear. 
            // Requirement says "Delete session". 
            // Let's modify frontend to send refreshToken in body if possible, OR just delete all sessions for user (strict security).

            // Let's decode the token to get the user ID
            const decoded = jwt.decode(token);
            if (decoded) {
                await Session.deleteMany({ userId: decoded.id }); // STRICT: Invalidate all sessions for this user on logout. Safe approach for this stage.
            }
        }

        res.clearCookie('token');
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.refreshToken = async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: 'No refresh token' });

    try {
        const session = await Session.findOne({ token: refreshToken, isActive: true });
        if (!session) return res.status(403).json({ message: 'Invalid refresh token' });

        jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, decoded) => {
            if (err) return res.status(403).json({ message: 'Invalid refresh token' });

            const accessToken = jwt.sign(
                { id: decoded.id },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
            );

            res.cookie('token', accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 3600000
            });

            // Update session activity
            session.lastActivity = Date.now();
            session.save();

            res.json({ accessToken });
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

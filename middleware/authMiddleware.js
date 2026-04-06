const jwt = require('jsonwebtoken');
const Permission = require('../models/Permission');

const User = require('../models/User');

exports.authenticateJWT = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Forbidden: Invalid token' });
        }

        try {
            // Live Revocation Check: Fetch latest user status and role from DB
            const user = await User.findById(decoded.id);

            if (!user) {
                return res.status(401).json({ message: 'Unauthorized: User not found' });
            }

            if (!user.isActive) {
                return res.status(403).json({ message: 'Forbidden: Account is disabled' });
            }

            req.user = user; // Attach the latest user object (with updated role)
            next();
        } catch (error) {
            console.error('Auth Middleware Error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    });
};

exports.authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden: Insufficient role' });
        }
        next();
    };
};

exports.authorizePermission = (permissionName) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(403).json({ message: 'Forbidden: User not authenticated' });
            }

            // Admin always has access (optional, but good practice)
            if (req.user.role === 'Admin') {
                return next();
            }

            const permission = await Permission.findOne({ role: req.user.role });
            if (!permission || !permission[permissionName]) {
                return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
            }

            next();
        } catch (error) {
            console.error('Permission Check Error:', error);
            res.status(500).json({ message: 'Internal Server Error' });
        }
    };
};

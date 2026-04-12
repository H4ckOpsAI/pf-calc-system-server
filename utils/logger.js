const ActivityLog = require('../models/ActivityLog');

exports.logActivity = async ({ userId, role, action, targetUserId = null, details = '' }) => {
    try {
        await ActivityLog.create({
            userId,
            role,
            action,
            targetUserId,
            details
        });
    } catch (error) {
        console.error('System Logging Error:', error);
    }
};

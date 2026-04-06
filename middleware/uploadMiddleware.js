const multer = require('multer');
const path = require('path');

// Set up storage engine (Memory storage for processing without saving to disk first, or disk storage if preferred)
// Using memory storage to process Excel directly from buffer
const storage = multer.memoryStorage();

// File filter to accept only Excel files
const fileFilter = (req, file, cb) => {
    const filetypes = /xlsx|xls/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype) ||
        file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel';

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb(new Error('Error: Only Excel files are allowed!'));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

module.exports = upload;

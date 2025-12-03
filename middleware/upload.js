'use strict';
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadDir = './uploads/avatars';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Delete old avatar if it exists
        if (req.auth && req.auth.utorid) {
            const oldPattern = new RegExp(`^${req.auth.utorid}-.*`);
            fs.readdir(uploadDir, (err, files) => {
                if (!err) {
                    files.forEach(file => {
                        if (oldPattern.test(file)) {
                            fs.unlink(path.join(uploadDir, file), () => {});
                        }
                    });
                }
            });
        }
        
        // Use utorid + timestamp + extension for unique filename
        const ext = path.extname(file.originalname);
        const filename = `${req.auth.utorid}-${Date.now()}${ext}`;
        cb(null, filename);
    }
});

// File filter - only images
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'));
    }
};

// Create multer instance
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: fileFilter
});

module.exports = upload;
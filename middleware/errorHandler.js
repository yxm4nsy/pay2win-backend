'use strict';

const errorHandler = (err, req, res, next) => {
    // Handle JWT errors
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ error: 'Invalid or missing token' });
    }
    
    // Handle multer errors
    if (err.name === 'MulterError') {
        return res.status(400).json({ error: err.message });
    }
    
    // Handle other errors
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
};

module.exports = errorHandler;
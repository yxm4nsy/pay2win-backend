'use strict';

// require all dependencies
const jwt = require("jsonwebtoken");
const { expressjwt: expressJwt } = require("express-jwt");

// middleware to verify JWT token
const authenticateJWT = expressJwt({
    secret: process.env.JWT_SECRET,
    algorithms: ['HS256'],
    requestProperty: 'auth'
});

// middleware to check user role
const requireRole = (minRole) => {
    return (req, res, next) => {
        const userRole = req.auth.role;
        
        const roleHierarchy = {
            "regular": 1,
            "cashier": 2,
            "manager": 3,
            "superuser": 4
        };
        
        const requiredLevel = roleHierarchy[minRole];
        const userLevel = roleHierarchy[userRole];
        
        if (userLevel >= requiredLevel) {
            next();
        } else {
            res.status(403).json({ error: 'Insufficient permissions' });
        }
    };
};

module.exports = {authenticateJWT, requireRole};
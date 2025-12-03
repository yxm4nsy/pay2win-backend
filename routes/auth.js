'use strict';

// get the enviorment variables
require('dotenv').config();

// require all dependencies
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {v4: uuidv4} = require("uuid")
const prisma = require("../prisma/db");

// rate limiting tracker
const resetAttempts = new Map();

// create router and endpoints
const router = express.Router();

router.post("/tokens", async (req, res) => {
    const {utorid, password} = req.body;
    if (!utorid || !password) {
        return res.status(400).json({error: "Utorid and password are required"});
    }
    const user = await prisma.user.findUnique({where: {utorid: utorid}});

    if(!user) {
        return res.status(401).json({error: "Invalid credentials"});
    }

    if (!user.password) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    if(!await bcrypt.compare(password, user.password)) {
        return res.status(401).json({error: "Invalid credentials" }) ;
    }

    const token = jwt.sign({ id: user.id, utorid: user.utorid, role: user.role }, process.env.JWT_SECRET, {expiresIn: "24h"});
    const expiresAt = new Date(Date.now() + 24*60*60*1000);
    await prisma.user.update({where: {id: user.id}, data: {lastLogin: new Date()}});

    return res.status(200).json({token: token, expiresAt: expiresAt.toISOString()})
    
});

router.post("/resets", async (req, res) => {
    const {utorid} = req.body;
    
    if (!utorid) {
        return res.status(400).json({error:"utorid required"});
    }
    
    const user = await prisma.user.findUnique({where: { utorid }});
    
    if (!user) {
        return res.status(404).json({error: "User not found"});
    }
    
    const ip = req.ip;
    if (resetAttempts.has(ip)) {
        const lastAttempt = resetAttempts.get(ip);
        const timeSinceLastAttempt = Date.now() - lastAttempt;
        
        if (timeSinceLastAttempt < 60000) {
            return res.status(429).json({error: "Too many requests"});
        }
    }
    
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    
    await prisma.user.update({
        where: { id: user.id },
        data: {
            resetToken: resetToken,
            resetTokenExpiry: expiresAt
        }
    });
    
    resetAttempts.set(ip, Date.now());
    
    return res.status(202).json({expiresAt: expiresAt.toISOString(), resetToken: resetToken});
});

router.post('/resets/:resetToken', async (req, res) => {
    const {resetToken} = req.params;
    const {utorid, password} = req.body;
    
    if (!utorid || !password) {
        return res.status(400).json({error: "utorid and password are required"});
    }
    
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,20}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({error: "Invalid password format"});
    }
    
    const user = await prisma.user.findFirst({
        where: { resetToken }
    });

    if (!user) {
        return res.status(404).json({error: "Invalid reset token"});
    }

    if (user.resetTokenExpiry < new Date()) {
        return res.status(410).json({error: "Reset token expired"});
    }

    if (user.utorid !== utorid) {
        return res.status(401).json({error: "Invalid credentials"});
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await prisma.user.update({
        where: { id: user.id },
        data: {
            password: hashedPassword,
            resetToken: null,
            resetTokenExpiry: null
        }
    });
    
    return res.status(200).json({message: "Password reset successful"});
});

// Router export
module.exports = router
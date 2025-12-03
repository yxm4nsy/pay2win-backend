'use strict';

// get the enviorment variables
require('dotenv').config();

// require all dependencies
const express = require("express");
const bcrypt = require("bcrypt");
const {v4: uuidv4} = require("uuid");
const prisma = require("../prisma/db");
const {authenticateJWT, requireRole} = require('../middleware/auth');
const upload = require('../middleware/upload');

// create router and endpoints
const router = express.Router();

router.post("/", authenticateJWT, requireRole("cashier"), async (req, res) => {
    const {utorid, name, email} = req.body;
    
    if (!utorid || !name || !email) {
        return res.status(400).json({ error: "utorid, name, and email are required" });
    }

    const utoridRegex = /^[a-zA-Z0-9]{7,8}$/;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@(mail\.)?utoronto\.ca$/;

    if (!utoridRegex.test(utorid)) {
        return res.status(400).json({ error: "Invalid utorid format" });
    }

    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
    }

    if (name.length < 1 || name.length > 50) {
        return res.status(400).json({ error: "Name must be 1-50 characters" });
    }

    const existingEmail = await prisma.user.findFirst({
        where: {email: email}
    });
    
    if (existingEmail) {
        return res.status(409).json({ error: "User with this email already exists" }); 
    }
    
    const existingUtorid = await prisma.user.findUnique({
        where: {utorid: utorid}
    });
    if (existingUtorid) {
        return res.status(409).json({ error: "User with this UTORid already exists" }); 
    }
    
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    const user = await prisma.user.create({
        data: {
            utorid: utorid,
            name: name,
            email: email,
            role: "regular",
            verified: false,
            points: 0,
            resetToken: resetToken,
            resetTokenExpiry: expiresAt
        }
    });
    
    return res.status(201).json({
        id: user.id,
        utorid: user.utorid,
        name: user.name,
        email: user.email,
        verified: user.verified,
        expiresAt: expiresAt.toISOString(),
        resetToken: resetToken
    });
});

router.get("/", authenticateJWT, requireRole("manager"), async (req, res) => {
    const { name, role, verified, activated, page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({ error: "Invalid page number" });
    }

    if (isNaN(limitNum) || limitNum < 1) {
        return res.status(400).json({ error: "Invalid limit" });
    }

    const where = {};

    if (name) {
        where.OR = [
            { utorid: { contains: name } },
            { name: { contains: name } }
        ];
    }

    if (role) {
        where.role = role;
    }

    if (verified !== undefined) {
        where.verified = verified === 'true';
    }

    if (activated !== undefined) {
        if (activated === 'true') {
            where.lastLogin = { not: null };
        } else {
            where.lastLogin = null;
        }
    }

    const [count, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
            where,
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
            select: {
                id: true,
                utorid: true,
                name: true,
                email: true,
                birthday: true,
                role: true,
                points: true,
                createdAt: true,
                lastLogin: true,
                verified: true,
                avatarUrl: true
            }
        })
    ]);

    const results = users.map(user => ({
        id: user.id,
        utorid: user.utorid,
        name: user.name,
        email: user.email,
        birthday: user.birthday ? user.birthday.toISOString().split('T')[0] : null,
        role: user.role,
        points: user.points,
        createdAt: user.createdAt.toISOString(),
        lastLogin: user.lastLogin ? user.lastLogin.toISOString() : null,
        verified: user.verified,
        avatarUrl: user.avatarUrl
    }));

    return res.status(200).json({
        count,
        results
    });
});

router.get("/me", authenticateJWT, requireRole("regular"), async (req, res) => {
    const userId = req.auth.id;

    const user = await prisma.user.findUnique({
        where: { id: userId }
    });

    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    const now = new Date();
    const availablePromotions = await prisma.promotion.findMany({
        where: {
            type: "onetime",
            startTime: { lte: now },
            endTime: { gte: now },
            NOT: {
                usedBy: {
                    some: {
                        id: userId
                    }
                }
            }
        },
        select: {
            id: true,
            name: true,
            minSpending: true,
            rate: true,
            points: true
        }
    });

    return res.status(200).json({
        id: user.id,
        utorid: user.utorid,
        name: user.name,
        email: user.email,
        birthday: user.birthday ? user.birthday.toISOString().split('T')[0] : null,
        role: user.role,
        points: user.points,
        createdAt: user.createdAt.toISOString(),
        lastLogin: user.lastLogin ? user.lastLogin.toISOString() : null,
        verified: user.verified,
        avatarUrl: user.avatarUrl,
        promotions: availablePromotions
    });
});

router.patch("/me", authenticateJWT, requireRole("regular"), upload.single('avatar'), async (req, res) => {
    const userId = req.auth.id;
    const { name, email, birthday } = req.body;

    const updateData = {};

    if (name !== undefined && name !== null && name !== '') {
        if (typeof name !== 'string' || name.length < 1 || name.length > 50) {
            return res.status(400).json({ error: "Name must be 1-50 characters" });
        }
        updateData.name = name;
    }

    if (email !== undefined && email !== null && email !== '') {
        if (typeof email !== 'string') {
            return res.status(400).json({ error: "Invalid email format" });
        }

        const emailRegex = /^[a-zA-Z0-9._%+-]+@(mail\.)?utoronto\.ca$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: "Invalid email format" });
        }

        const existing = await prisma.user.findFirst({
            where: {
                email: email,
                NOT: { id: userId }
            }
        });

        if (existing) {
            return res.status(400).json({ error: "Email already in use" });
        }

        updateData.email = email;
    }

    if (birthday !== undefined && birthday !== null && birthday !== '') {
        if (typeof birthday !== 'string') {
            return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(birthday)) {
            return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
        }

        const parts = birthday.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);

        if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
            return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
        }

        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
            return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
        }

        updateData.birthday = date;
    }

    if (req.file) {
        updateData.avatarUrl = `/uploads/avatars/${req.file.filename}`;
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
    }

    const user = await prisma.user.update({
        where: { id: userId },
        data: updateData
    });

    return res.status(200).json({
        id: user.id,
        utorid: user.utorid,
        name: user.name,
        email: user.email,
        birthday: user.birthday ? user.birthday.toISOString().split('T')[0] : null,
        role: user.role,
        points: user.points,
        createdAt: user.createdAt.toISOString(),
        lastLogin: user.lastLogin ? user.lastLogin.toISOString() : null,
        verified: user.verified,
        avatarUrl: user.avatarUrl
    });
});

router.patch("/me/password", authenticateJWT, requireRole("regular"), async (req, res) => {
    const userId = req.auth.id;
    const { old, new: newPassword } = req.body;

    if (!old || !newPassword) {
        return res.status(400).json({ error: "old and new passwords are required" });
    }

    const user = await prisma.user.findUnique({
        where: { id: userId }
    });

    if (!user || !user.password) {
        return res.status(404).json({ error: "User not found" });
    }

    const validPassword = await bcrypt.compare(old, user.password);
    if (!validPassword) {
        return res.status(403).json({ error: "Incorrect current password" });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,20}$/;
    if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({ error: "Invalid password format" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
    });

    return res.status(200).json({ message: "Password updated successfully" });
});

router.get("/lookup/:utorid", authenticateJWT, requireRole("regular"), async (req, res) => {
  try {
    const { utorid } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { utorid },
      select: {
        id: true,
        utorid: true,
        name: true,
        verified: true,
      },
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error looking up user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get("/:userId", authenticateJWT, requireRole("cashier"), async (req, res) => {
    const { userId } = req.params;
    const currentUserRole = req.auth.role;
    
    const targetUserId = parseInt(userId, 10);
    if (isNaN(targetUserId)) {
        return res.status(400).json({ error: "Invalid user ID" });
    }

    const user = await prisma.user.findUnique({
        where: { id: targetUserId }
    });

    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    if (currentUserRole === "cashier") {
        const now = new Date();
        const availablePromotions = await prisma.promotion.findMany({
            where: {
                type: "onetime",
                startTime: { lte: now },
                endTime: { gte: now },
                NOT: {
                    usedBy: {
                        some: {
                            id: targetUserId
                        }
                    }
                }
            },
            select: {
                id: true,
                name: true,
                minSpending: true,
                rate: true,
                points: true
            }
        });

        return res.status(200).json({
            id: user.id,
            utorid: user.utorid,
            name: user.name,
            points: user.points,
            verified: user.verified,
            promotions: availablePromotions
        });
    }

    const now = new Date();
    const availablePromotions = await prisma.promotion.findMany({
        where: {
            type: "onetime",
            startTime: { lte: now },
            endTime: { gte: now },
            NOT: {
                usedBy: {
                    some: {
                        id: targetUserId
                    }
                }
            }
        },
        select: {
            id: true,
            name: true,
            minSpending: true,
            rate: true,
            points: true
        }
    });

    return res.status(200).json({
        id: user.id,
        utorid: user.utorid,
        name: user.name,
        email: user.email,
        birthday: user.birthday ? user.birthday.toISOString().split('T')[0] : null,
        role: user.role,
        points: user.points,
        createdAt: user.createdAt.toISOString(),
        lastLogin: user.lastLogin ? user.lastLogin.toISOString() : null,
        verified: user.verified,
        avatarUrl: user.avatarUrl,
        promotions: availablePromotions
    });
});

router.patch("/:userId", authenticateJWT, requireRole("manager"), async (req, res) => {
    const { userId } = req.params;
    const { email, verified, suspicious, role } = req.body;
    
    const targetUserId = parseInt(userId, 10);
    if (isNaN(targetUserId)) {
        return res.status(400).json({ error: "Invalid user ID" });
    }
    
    const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId }
    });
    
    if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
    }
    
    const updateData = {};
    const currentUserRole = req.auth.role;

    if (email !== undefined && email !== null) {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@(mail\.)?utoronto\.ca$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: "Invalid email format" });
        }

        const existingUser = await prisma.user.findFirst({
            where: {
                email: email,
                NOT: { id: targetUserId }
            }
        });
        
        if (existingUser) {
            return res.status(400).json({ error: "Email already in use" });
        }
        
        updateData.email = email;
    }

    if (verified !== undefined && verified !== null) {
        if (verified !== true) {
            return res.status(400).json({ error: "Verified must be true" });
        }
        updateData.verified = true;
    }

    if (suspicious !== undefined && suspicious !== null) {
        if (typeof suspicious !== 'boolean') {
            return res.status(400).json({ error: "Suspicious must be a boolean" });
        }
        updateData.suspicious = suspicious;
    }

    if (role !== undefined && role !== null) {
        const validRoles = ["regular", "cashier", "manager", "superuser"];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: "Invalid role" });
        }
        
        if (currentUserRole === "manager") {
            if (role !== "cashier" && role !== "regular") {
                return res.status(403).json({ error: "Insufficient permissions" });
        }
        }
        
        if (role === "cashier") {
            let willBeSuspicious;
            if (suspicious !== undefined && suspicious !== null) {
                willBeSuspicious = suspicious;
            } else {
                willBeSuspicious = targetUser.suspicious;
            }
            
            if (willBeSuspicious) {
                return res.status(400).json({ error: "Cannot promote suspicious user to cashier" });
            }
            
            updateData.suspicious = false;
        }
        
        updateData.role = role;
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
    }

    await prisma.user.update({
        where: { id: targetUserId },
        data: updateData
    });

    const response = {
        id: targetUser.id,
        utorid: targetUser.utorid,
        name: targetUser.name
    };

    if (email !== undefined && email !== null) {
        response.email = updateData.email;
    }
    if (verified !== undefined && verified !== null) {
        response.verified = updateData.verified;
    }
    if (suspicious !== undefined && suspicious !== null) {
        response.suspicious = updateData.suspicious;
    }
    if (role !== undefined && role !== null) {
        response.role = updateData.role;
    }

    return res.status(200).json(response);
});

router.post("/me/transactions", authenticateJWT, requireRole("regular"), async (req, res) => {
    const { type, amount, remark = "" } = req.body;

    if (!type || type !== "redemption") {
        return res.status(400).json({ error: "type must be 'redemption'" });
    }

    if (amount === undefined || amount === null) {
        return res.status(400).json({ error: "amount is required" });
    }

    if (!Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({ error: "amount must be a positive integer" });
    }

    const userId = req.auth.id;

    const user = await prisma.user.findUnique({
        where: { id: userId }
    });

    if (!user.verified) {
        return res.status(403).json({ error: "User must be verified" });
    }

    if (user.points < amount) {
        return res.status(400).json({ error: "Insufficient points" });
    }

    const transaction = await prisma.transaction.create({
        data: {
            type: "redemption",
            amount: -amount,
            remark: remark,
            ownerUserId: userId,
            creatorUserId: userId
        }
    });

    return res.status(201).json({
        id: transaction.id,
        utorid: user.utorid,
        type: transaction.type,
        processedBy: null,
        amount: amount,
        remark: transaction.remark,
        createdBy: user.utorid
    });
});

router.post("/:userId/transactions", authenticateJWT, requireRole("regular"), async (req, res) => {
    const { userId } = req.params;
    const { type, amount, remark = "" } = req.body;

    if (!type || type !== "transfer") {
        return res.status(400).json({ error: "type must be 'transfer'" });
    }

    if (amount === undefined || amount === null) {
        return res.status(400).json({ error: "amount is required" });
    }

    if (!Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({ error: "amount must be a positive integer" });
    }

    const recipientId = parseInt(userId, 10);
    if (isNaN(recipientId)) {
        return res.status(400).json({ error: "Invalid user ID" });
    }

    const senderId = req.auth.id;

    if (senderId === recipientId) {
        return res.status(400).json({ error: "Cannot transfer to yourself" });
    }

    const sender = await prisma.user.findUnique({
        where: { id: senderId }
    });

    if (!sender.verified) {
        return res.status(403).json({ error: "Sender must be verified" });
    }

    if (sender.points < amount) {
        return res.status(400).json({ error: "Insufficient points" });
    }

    const recipient = await prisma.user.findUnique({
        where: { id: recipientId }
    });

    if (!recipient) {
        return res.status(404).json({ error: "Recipient not found" });
    }

    const senderTransaction = await prisma.transaction.create({
        data: {
            type: "transfer",
            amount: -amount,
            remark: remark,
            ownerUserId: senderId,
            creatorUserId: senderId,
            relatedUserId: recipientId
        }
    });

    const recipientTransaction = await prisma.transaction.create({
        data: {
            type: "transfer",
            amount: amount,
            remark: remark,
            ownerUserId: recipientId,
            creatorUserId: senderId,
            relatedUserId: senderId
        }
    });

    await prisma.user.update({
        where: { id: senderId },
        data: { points: { decrement: amount } }
    });

    await prisma.user.update({
        where: { id: recipientId },
        data: { points: { increment: amount } }
    });

    return res.status(201).json({
        id: senderTransaction.id,
        sender: sender.utorid,
        recipient: recipient.utorid,
        type: "transfer",
        sent: amount,
        remark: remark,
        createdBy: sender.utorid
    });
});

router.get("/me/transactions", authenticateJWT, requireRole("regular"), async (req, res) => {
    const { type, relatedId, promotionId, amount, operator, page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({ error: "Invalid page number" });
    }

    if (isNaN(limitNum) || limitNum < 1) {
        return res.status(400).json({ error: "Invalid limit" });
    }

    const userId = req.auth.id;
    const where = { ownerUserId: userId };

    if (type) {
        where.type = type;
    }

    if (relatedId) {
        const relId = parseInt(relatedId, 10);
        if (!isNaN(relId)) {
            if (!type) {
                return res.status(400).json({ error: "type is required when using relatedId" });
            }
            if (type === "adjustment" || type === "event") {
                where.relatedTransactionId = relId;
            } else if (type === "transfer") {
                where.relatedUserId = relId;
            } else if (type === "redemption") {
                where.processorUserId = relId;
            }
        }
    }

    if (promotionId) {
        const promoId = parseInt(promotionId, 10);
        if (!isNaN(promoId)) {
            where.promotions = {
                some: { id: promoId }
            };
        }
    }

    if (amount !== undefined) {
        if (!operator) {
            return res.status(400).json({ error: "operator is required when using amount" });
        }
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum)) {
            return res.status(400).json({ error: "Invalid amount" });
        }
        if (operator === "gte") {
            where.amount = { gte: amountNum };
        } else if (operator === "lte") {
            where.amount = { lte: amountNum };
        } else {
            return res.status(400).json({ error: "Invalid operator" });
        }
    }

    const [count, transactions] = await Promise.all([
        prisma.transaction.count({ where }),
        prisma.transaction.findMany({
            where,
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
            include: {
                creatorUser: { select: { utorid: true } },
                promotions: { select: { id: true } }
            },
            orderBy: { id: 'asc' }
        })
    ]);

    const results = transactions.map(t => {
        const result = {
            id: t.id,
            type: t.type,
            amount: t.amount,
            promotionIds: t.promotions.map(p => p.id),
            remark: t.remark,
            createdBy: t.creatorUser.utorid
        };

        if (t.type === "purchase") {
            result.spent = t.spent;
        } else if (t.type === "redemption") {
            result.redeemed = t.redeemed;
        } else if (t.type === "adjustment") {
            result.relatedId = t.relatedTransactionId;
        } else if (t.type === "transfer") {
            result.relatedId = t.relatedUserId;
        } else if (t.type === "event") {
            result.relatedId = t.eventId;
        }

        return result;
    });

    return res.status(200).json({ count, results });
});

router.get("/:userId/suspicious", authenticateJWT, requireRole("manager"), async (req, res) => {
    const { userId } = req.params;
    
    const targetUserId = parseInt(userId, 10);
    if (isNaN(targetUserId)) {
        return res.status(400).json({ error: "Invalid user ID" });
    }
    
    const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
            id: true,
            utorid: true,
            name: true,
            suspicious: true
        }
    });
    
    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }
    
    return res.status(200).json({
        id: user.id,
        utorid: user.utorid,
        name: user.name,
        suspicious: user.suspicious
    });
});

module.exports = router;
'use strict';

// require all dependencies
const express = require("express");
const prisma = require("../prisma/db");
const {authenticateJWT, requireRole} = require('../middleware/auth');

// create router and endpoints
const router = express.Router();

router.post("/", authenticateJWT, async (req, res) => {
    const { 
        utorid, 
        type, 
        spent, 
        amount, 
        relatedId, 
        promotionIds, 
        remark = "" 
    } = req.body;
    
    const safePromotionIds = promotionIds || [];

    if (!utorid || !type) {
        return res.status(400).json({ error: "utorid and type are required" });
    }

    const userRole = req.auth.role;

    if (type === "purchase") {
        if (!['cashier', 'manager', 'superuser'].includes(userRole)) {
            return res.status(403).json({ error: "Forbidden" });
        }

        if (spent === undefined || spent === null) {
            return res.status(400).json({ error: "spent is required for purchase transactions" });
        }

        if (typeof spent !== 'number' || spent <= 0) {
            return res.status(400).json({ error: "spent must be a positive number" });
        }

        const user = await prisma.user.findUnique({
            where: { utorid: utorid }
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const cashier = await prisma.user.findUnique({
            where: { id: req.auth.id }
        });

        let earnedPoints = Math.round(spent / 0.25);
        
        const now = new Date();
        const automaticPromotions = await prisma.promotion.findMany({
            where: {
                type: "automatic",
                startTime: { lte: now },
                endTime: { gte: now },
                OR: [
                    { minSpending: null },
                    { minSpending: { lte: spent } }
                ]
            }
        });

        const appliedPromotionIds = [];
        for (const promo of automaticPromotions) {
            appliedPromotionIds.push(promo.id);
            if (promo.rate) {
                earnedPoints += Math.round(spent / promo.rate);
            }
            if (promo.points) {
                earnedPoints += promo.points;
            }
        }

        if (safePromotionIds.length > 0) {
            for (const promoId of safePromotionIds) {
                const promotion = await prisma.promotion.findUnique({
                    where: { id: promoId },
                    include: {
                        usedBy: {
                            where: { id: user.id }
                        }
                    }
                });

                if (!promotion) {
                    return res.status(400).json({ error: `Promotion ${promoId} not found` });
                }

                if (promotion.type !== "onetime") {
                    return res.status(400).json({ error: `Promotion ${promoId} is not a one-time promotion` });
                }

                if (promotion.startTime > now || promotion.endTime < now) {
                    return res.status(400).json({ error: `Promotion ${promoId} is not active` });
                }

                if (promotion.usedBy.length > 0) {
                    return res.status(400).json({ error: `Promotion ${promoId} has already been used` });
                }

                if (promotion.minSpending && spent < promotion.minSpending) {
                    return res.status(400).json({ error: `Minimum spending not met for promotion ${promoId}` });
                }

                appliedPromotionIds.push(promoId);

                if (promotion.rate) {
                    earnedPoints += Math.round(spent / promotion.rate);
                }
                if (promotion.points) {
                    earnedPoints += promotion.points;
                }
            }
        }

        const isSuspicious = cashier.suspicious === true;

        const transaction = await prisma.transaction.create({
            data: {
                type: "purchase",
                amount: earnedPoints,
                spent: spent,
                remark: remark,
                suspicious: isSuspicious,
                ownerUserId: user.id,
                creatorUserId: req.auth.id,
                promotions: {
                    connect: appliedPromotionIds.map(id => ({ id }))
                }
            }
        });

        if (!isSuspicious) {
            await prisma.user.update({
                where: { id: user.id },
                data: { points: { increment: earnedPoints } }
            });

            if (safePromotionIds.length > 0) {
                for (const promoId of safePromotionIds) {
                    await prisma.promotion.update({
                        where: { id: promoId },
                        data: {
                            usedBy: {
                                connect: { id: user.id }
                            }
                        }
                    });
                }
            }
        }

        return res.status(201).json({
            id: transaction.id,
            utorid: user.utorid,
            type: transaction.type,
            spent: transaction.spent,
            earned: isSuspicious ? 0 : transaction.amount,
            suspicious: isSuspicious,
            remark: transaction.remark,
            promotionIds: appliedPromotionIds,
            createdBy: cashier.utorid
        });
    } 

    else if (type === "adjustment") {
        if (!['manager', 'superuser'].includes(userRole)) {
            return res.status(403).json({ error: "Forbidden" });
        }

        if (amount === undefined || amount === null) {
            return res.status(400).json({ error: "amount is required for adjustment transactions" });
        }

        if (typeof amount !== 'number') {
            return res.status(400).json({ error: "amount must be a number" });
        }

        const user = await prisma.user.findUnique({
            where: { utorid: utorid }
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (relatedId === undefined || relatedId === null) {
            return res.status(400).json({ error: "relatedId is required for adjustment transactions" });
        }

        const relatedTransaction = await prisma.transaction.findUnique({
            where: { id: relatedId }
        });

        if (!relatedTransaction) {
            return res.status(404).json({ error: "Related transaction not found" });
        }

        const transaction = await prisma.transaction.create({
            data: {
                type: "adjustment",
                amount: amount,
                remark: remark,
                suspicious: false,
                ownerUserId: user.id,
                creatorUserId: req.auth.id,
                relatedTransactionId: relatedId,
                promotions: {
                    connect: safePromotionIds.map(id => ({ id }))
                }
            }
        });

        await prisma.user.update({
            where: { id: user.id },
            data: { points: { increment: amount } }
        });

        const manager = await prisma.user.findUnique({
            where: { id: req.auth.id }
        });

        return res.status(201).json({
            id: transaction.id,
            utorid: user.utorid,
            amount: transaction.amount,
            type: transaction.type,
            relatedId: relatedId,
            remark: transaction.remark,
            promotionIds: safePromotionIds,
            createdBy: manager.utorid
        });
    } 
    
    else {
        return res.status(400).json({ error: "Invalid transaction type" });
    }
});

router.get("/", authenticateJWT, requireRole("manager"), async (req, res) => {
    const { name, createdBy, suspicious, promotionId, type, relatedId, amount, operator, page = 1, limit = 10 } = req.query;

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
        const users = await prisma.user.findMany({
            where: {
                OR: [
                    { utorid: { contains: name } },
                    { name: { contains: name } }
                ]
            },
            select: { id: true }
        });
        where.ownerUserId = { in: users.map(u => u.id) };
    }

    if (createdBy) {
        const creator = await prisma.user.findFirst({
            where: {
                OR: [
                    { utorid: { contains: createdBy } },
                    { name: { contains: createdBy } }
                ]
            }
        });
        if (creator) {
            where.creatorUserId = creator.id;
        }
    }

    if (suspicious !== undefined) {
        where.suspicious = suspicious === 'true';
    }

    if (promotionId) {
        const promoId = parseInt(promotionId, 10);
        if (!isNaN(promoId)) {
            where.promotions = {
                some: { id: promoId }
            };
        }
    }

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
                ownerUser: { select: { utorid: true } },
                creatorUser: { select: { utorid: true } },
                promotions: { select: { id: true } }
            },
            orderBy: { id: 'asc' }
        })
    ]);

    const results = transactions.map(t => {
        const result = {
            id: t.id,
            utorid: t.ownerUser.utorid,
            amount: t.amount,
            type: t.type,
            promotionIds: t.promotions.map(p => p.id),
            suspicious: t.suspicious,
            remark: t.remark,
            createdBy: t.creatorUser.utorid
        };

        if (t.type === "purchase") {
            result.spent = t.spent;
        } else if (t.type === "redemption") {
            result.relatedId = t.processorUserId;
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

router.get("/:transactionId", authenticateJWT, requireRole("manager"), async (req, res) => {
    const { transactionId } = req.params;

    const txId = parseInt(transactionId, 10);
    if (isNaN(txId)) {
        return res.status(400).json({ error: "Invalid transaction ID" });
    }

    const transaction = await prisma.transaction.findUnique({
        where: { id: txId },
        include: {
            ownerUser: { select: { utorid: true } },
            creatorUser: { select: { utorid: true } },
            promotions: { select: { id: true } }
        }
    });

    if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
    }

    const result = {
        id: transaction.id,
        utorid: transaction.ownerUser.utorid,
        type: transaction.type,
        amount: transaction.amount,
        promotionIds: transaction.promotions.map(p => p.id),
        suspicious: transaction.suspicious,
        remark: transaction.remark,
        createdBy: transaction.creatorUser.utorid
    };

    if (transaction.type === "purchase") {
        result.spent = transaction.spent;
    } else if (transaction.type === "redemption") {
        result.redeemed = transaction.redeemed;
    } else if (transaction.type === "adjustment") {
        result.relatedId = transaction.relatedTransactionId;
    } else if (transaction.type === "transfer") {
        result.relatedId = transaction.relatedUserId;
    } else if (transaction.type === "event") {
        result.relatedId = transaction.eventId;
    }

    return res.status(200).json(result);
});

router.patch("/:transactionId/suspicious", authenticateJWT, requireRole("manager"), async (req, res) => {
    const { transactionId } = req.params;
    const { suspicious } = req.body;

    if (suspicious === undefined || suspicious === null) {
        return res.status(400).json({ error: "suspicious field is required" });
    }

    if (typeof suspicious !== 'boolean') {
        return res.status(400).json({ error: "suspicious must be a boolean" });
    }

    const txId = parseInt(transactionId, 10);
    if (isNaN(txId)) {
        return res.status(400).json({ error: "Invalid transaction ID" });
    }

    const transaction = await prisma.transaction.findUnique({
        where: { id: txId },
        include: {
            ownerUser: true,
            creatorUser: { select: { utorid: true } },
            promotions: { select: { id: true } }
        }
    });

    if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
    }

    const wasSuspicious = transaction.suspicious;

    await prisma.transaction.update({
        where: { id: txId },
        data: { suspicious: suspicious }
    });

    if (wasSuspicious && !suspicious) {
        await prisma.user.update({
            where: { id: transaction.ownerUserId },
            data: { points: { increment: transaction.amount } }
        });

        const onetimePromotions = await prisma.promotion.findMany({
            where: {
                id: { in: transaction.promotions.map(p => p.id) },
                type: "onetime"
            }
        });

        for (const promo of onetimePromotions) {
            await prisma.promotion.update({
                where: { id: promo.id },
                data: {
                    usedBy: {
                        connect: { id: transaction.ownerUserId }
                    }
                }
            });
        }
    } 
    else if (!wasSuspicious && suspicious) {
        await prisma.user.update({
            where: { id: transaction.ownerUserId },
            data: { points: { decrement: transaction.amount } }
        });
    }

    const result = {
        id: transaction.id,
        utorid: transaction.ownerUser.utorid,
        type: transaction.type,
        amount: transaction.amount,
        promotionIds: transaction.promotions.map(p => p.id),
        suspicious: suspicious,
        remark: transaction.remark,
        createdBy: transaction.creatorUser.utorid
    };

    if (transaction.type === "purchase") {
        result.spent = transaction.spent;
    }

    return res.status(200).json(result);
});

router.patch("/:transactionId/processed", authenticateJWT, requireRole("cashier"), async (req, res) => {
    const { transactionId } = req.params;
    const { processed } = req.body;

    if (processed !== true) {
        return res.status(400).json({ error: "processed must be true" });
    }

    const txId = parseInt(transactionId, 10);
    if (isNaN(txId)) {
        return res.status(400).json({ error: "Invalid transaction ID" });
    }

    const transaction = await prisma.transaction.findUnique({
        where: { id: txId },
        include: {
            ownerUser: true,
            creatorUser: { select: { utorid: true } }
        }
    });

    if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.type !== "redemption") {
        return res.status(400).json({ error: "Transaction is not a redemption" });
    }

    if (transaction.processorUserId !== null) {
        return res.status(400).json({ error: "Redemption already processed" });
    }

    await prisma.transaction.update({
        where: { id: txId },
        data: {
            processorUserId: req.auth.id,
            redeemed: Math.abs(transaction.amount)
        }
    });

    await prisma.user.update({
        where: { id: transaction.ownerUserId },
        data: { points: { decrement: Math.abs(transaction.amount) } }
    });

    const processor = await prisma.user.findUnique({
        where: { id: req.auth.id }
    });

    return res.status(200).json({
        id: transaction.id,
        utorid: transaction.ownerUser.utorid,
        type: transaction.type,
        processedBy: processor.utorid,
        redeemed: Math.abs(transaction.amount),
        remark: transaction.remark,
        createdBy: transaction.creatorUser.utorid
    });
});

module.exports = router;
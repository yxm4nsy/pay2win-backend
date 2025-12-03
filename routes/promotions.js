'use strict'

// require all dependencies
const express = require("express");
const prisma = require("../prisma/db");
const {authenticateJWT, requireRole} = require('../middleware/auth');

// create router and endpoints
const router = express.Router();

router.post("/", authenticateJWT, requireRole("manager"), async (req, res) => {
    const {name, description, type, startTime, endTime, minSpending, rate, points} = req.body;


    if (!name || !description || !type || !startTime || !endTime) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    if (typeof name !== 'string') {
        return res.status(400).json({ error: "Name must be a string" });
    }
    
    if (typeof description !== 'string') {
        return res.status(400).json({ error: "Description must be a string" });
    }
    
    if (type !== "automatic" && type !== "one-time") {
        return res.status(400).json({ error: "Invalid promotion type" });
    }

    const start = new Date(startTime);
    if (isNaN(start.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
    }
    
    if (start < new Date()) {
        return res.status(400).json({ error: "startTime cannot be in the past" });
    }

    const end = new Date(endTime);
    if (isNaN(end.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
    }
    
    if (start >= end) {
        return res.status(400).json({ error: "endTime must be after startTime" });
    }

    if (minSpending !== undefined && minSpending !== null) {
        if (typeof minSpending !== 'number' || minSpending <= 0) {
            return res.status(400).json({ error: "minSpending must be positive" });
        }
    }

    if (rate !== undefined && rate !== null) {
        if (typeof rate !== 'number' || rate <= 0) {
            return res.status(400).json({ error: "rate must be positive" });
        }
    }

    if (points !== undefined && points !== null) {
        if (!Number.isInteger(points) || points < 0) {
            return res.status(400).json({ error: "points must be a positive integer" });
        }
    }

    const dbType = type === "one-time" ? "onetime" : type;

    const promotion = await prisma.promotion.create({
        data: {
            name,
            description,
            type: dbType,
            startTime: start,
            endTime: end,
            minSpending: minSpending !== undefined && minSpending !== null ? minSpending : null,
            rate: rate !== undefined && rate !== null ? rate : null,
            points: points !== undefined && points !== null ? points : null
        }
    });
    
    return res.status(201).json({
        id: promotion.id,
        name: promotion.name,
        description: promotion.description,
        type: promotion.type === "onetime" ? "one-time" : promotion.type,
        startTime: promotion.startTime.toISOString(),
        endTime: promotion.endTime.toISOString(),
        minSpending: promotion.minSpending,
        rate: promotion.rate,
        points: promotion.points
    });

});

router.get("/", authenticateJWT, requireRole("regular"), async (req, res) => {
    const { name, type, page = 1, limit = 10 } = req.query;
    const currentUserRole = req.auth.role;
    const userId = req.auth.id;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({ error: "Invalid page number" });
    }

    if (isNaN(limitNum) || limitNum < 1) {
        return res.status(400).json({ error: "Invalid limit" });
    }

    const where = {};
    const now = new Date();

    if (name) {
        where.name = { contains: name };
    }

    if (type) {
        where.type = type === "one-time" ? "onetime" : type;
    }

    const isManagerOrHigher = currentUserRole === "manager" || currentUserRole === "superuser";

    if (!isManagerOrHigher) {
        where.startTime = { lte: now };
        where.endTime = { gte: now };

        where.NOT = {
            usedBy: {
                some: {
                    id: userId
                }
            }
        };
    } else {
        const { started, ended } = req.query;

        if (started !== undefined && ended !== undefined) {
            return res.status(400).json({ error: "Cannot specify both started and ended" });
        }

        if (started !== undefined) {
            if (started === 'true') {
                where.startTime = { lte: now };
            } else {
                where.startTime = { gt: now };
            }
        }

        if (ended !== undefined) {
            if (ended === 'true') {
                where.endTime = { lt: now };
            } else {
                where.endTime = { gte: now };
            }
        }
    }

    const [count, promotions] = await Promise.all([
        prisma.promotion.count({ where }),
        prisma.promotion.findMany({
            where,
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
            orderBy: { id: 'asc' }
        })
    ]);

    const results = promotions.map(promo => {
        const result = {
            id: promo.id,
            name: promo.name,
            type: promo.type === "onetime" ? "one-time" : promo.type,
            endTime: promo.endTime.toISOString(),
            minSpending: promo.minSpending,
            rate: promo.rate,
            points: promo.points
        };

        if (isManagerOrHigher) {
            result.startTime = promo.startTime.toISOString();
            const { type, endTime, ...rest } = result;
            return {
                id: result.id,
                name: result.name,
                type,
                startTime: result.startTime,
                endTime,
                ...rest
            };
        }

        return result;
    });

    return res.status(200).json({
        count,
        results
    });
});

router.get("/:promotionId", authenticateJWT, requireRole("regular"), async (req, res) => {
    const { promotionId } = req.params;
    const currentUserRole = req.auth.role;

    const promoId = parseInt(promotionId, 10);
    if (isNaN(promoId)) {
        return res.status(400).json({ error: "Invalid promotion ID" });
    }

    const promotion = await prisma.promotion.findUnique({
        where: { id: promoId }
    });

    if (!promotion) {
        return res.status(404).json({ error: "Promotion not found" });
    }

    const isManagerOrHigher = currentUserRole === "manager" || currentUserRole === "superuser";

    if (!isManagerOrHigher) {
        const now = new Date();
        const isActive = promotion.startTime <= now && promotion.endTime >= now;
        
        if (!isActive) {
            return res.status(404).json({ error: "Promotion not found" });
        }
    }

    const response = {
        id: promotion.id,
        name: promotion.name,
        description: promotion.description,
        type: promotion.type === "onetime" ? "one-time" : promotion.type,
        endTime: promotion.endTime.toISOString(),
        minSpending: promotion.minSpending,
        rate: promotion.rate,
        points: promotion.points
    };

    if (isManagerOrHigher) {
        response.startTime = promotion.startTime.toISOString();
        const { type, endTime, ...rest } = response;
        return res.status(200).json({
            id: response.id,
            name: response.name,
            description: response.description,
            type,
            startTime: response.startTime,
            endTime,
            ...rest
        });
    }

    return res.status(200).json(response);
});

router.patch("/:promotionId", authenticateJWT, requireRole("manager"), async (req, res) => {
    const { promotionId } = req.params;
    const { name, description, type, startTime, endTime, minSpending, rate, points } = req.body;

    const promoId = parseInt(promotionId, 10);
    if (isNaN(promoId)) {
        return res.status(400).json({ error: "Invalid promotion ID" });
    }

    const promotion = await prisma.promotion.findUnique({
        where: { id: promoId }
    });

    if (!promotion) {
        return res.status(404).json({ error: "Promotion not found" });
    }

    const updateData = {};
    const now = new Date();

    if (name !== undefined && name !== null) {
        if (typeof name !== 'string') {
            return res.status(400).json({ error: "Name must be a string" });
        }
        updateData.name = name;
    }

    if (description !== undefined && description !== null) {
        if (typeof description !== 'string') {
            return res.status(400).json({ error: "Description must be a string" });
        }
        updateData.description = description;
    }

    if (type !== undefined && type !== null) {
        if (type !== "automatic" && type !== "one-time") {
            return res.status(400).json({ error: "Invalid promotion type" });
        }
        updateData.type = type === "one-time" ? "onetime" : type;
    }

    if (startTime !== undefined && startTime !== null) {
        const start = new Date(startTime);
        if (isNaN(start.getTime())) {
            return res.status(400).json({ error: "Invalid date format" });
        }
        if (start < now) {
            return res.status(400).json({ error: "startTime cannot be in the past" });
        }
        updateData.startTime = start;
    }

    if (endTime !== undefined && endTime !== null) {
        const end = new Date(endTime);
        if (isNaN(end.getTime())) {
            return res.status(400).json({ error: "Invalid date format" });
        }

        const finalStartTime = updateData.startTime || promotion.startTime;
        
        if (end <= finalStartTime) {
            return res.status(400).json({ error: "endTime must be after startTime" });
        }

        updateData.endTime = end;
    }

    if (minSpending !== undefined && minSpending !== null) {
        if (typeof minSpending !== 'number' || minSpending <= 0) {
            return res.status(400).json({ error: "minSpending must be positive" });
        }
        updateData.minSpending = minSpending;
    }

    if (rate !== undefined && rate !== null) {
        if (typeof rate !== 'number' || rate <= 0) {
            return res.status(400).json({ error: "rate must be positive" });
        }
        updateData.rate = rate;
    }

    if (points !== undefined && points !== null) {
        if (!Number.isInteger(points) || points < 0) {
            return res.status(400).json({ error: "points must be a positive integer" });
        }
        updateData.points = points;
    }

    const originalStartTime = promotion.startTime;
    const originalEndTime = promotion.endTime;

    if (originalStartTime <= now) {
        const restrictedFields = ['name', 'description', 'type', 'startTime', 'minSpending', 'rate', 'points'];
        for (const field of restrictedFields) {
            if (field in updateData) {
                return res.status(400).json({ error: "Cannot update this field after start time" });
            }
        }
    }

    if (originalEndTime <= now && 'endTime' in updateData) {
        return res.status(400).json({ error: "Cannot update endTime after it has passed" });
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
    }

    await prisma.promotion.update({
        where: { id: promoId },
        data: updateData
    });

    const response = {
        id: promotion.id,
        name: updateData.name || promotion.name,
        type: updateData.type ? (updateData.type === "onetime" ? "one-time" : updateData.type) : (promotion.type === "onetime" ? "one-time" : promotion.type)
    };

    if ('description' in updateData) response.description = updateData.description;
    if ('startTime' in updateData) response.startTime = updateData.startTime.toISOString();
    if ('endTime' in updateData) response.endTime = updateData.endTime.toISOString();
    if ('minSpending' in updateData) response.minSpending = updateData.minSpending;
    if ('rate' in updateData) response.rate = updateData.rate;
    if ('points' in updateData) response.points = updateData.points;

    return res.status(200).json(response);
});

router.delete("/:promotionId", authenticateJWT, requireRole("manager"), async (req, res) => {
    const { promotionId } = req.params;

    const promoId = parseInt(promotionId, 10);
    if (isNaN(promoId)) {
        return res.status(400).json({ error: "Invalid promotion ID" });
    }

    const promotion = await prisma.promotion.findUnique({
        where: { id: promoId }
    });

    if (!promotion) {
        return res.status(404).json({ error: "Promotion not found" });
    }

    const now = new Date();

    if (promotion.startTime <= now) {
        return res.status(403).json({ error: "Cannot delete promotion that has already started" });
    }

    await prisma.promotion.delete({
        where: { id: promoId }
    });

    return res.status(204).send();
});

module.exports = router;
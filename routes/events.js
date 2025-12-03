'use strict'

// require all dependencies
const express = require("express");
const prisma = require("../prisma/db");
const {authenticateJWT, requireRole} = require("../middleware/auth");

// create router and endpoints
const router = express.Router();

router.post("/", authenticateJWT, requireRole("manager"), async (req, res) => {
    const { name, description, location, startTime, endTime, capacity, points } = req.body;

    if (!name || !description || !location || !startTime || !endTime || points === undefined) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    if (typeof name !== 'string') {
        return res.status(400).json({ error: "Name must be a string" });
    }

    if (typeof description !== 'string') {
        return res.status(400).json({ error: "Description must be a string" });
    }

    if (typeof location !== 'string') {
        return res.status(400).json({ error: "Location must be a string" });
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

    if (end <= start) {
        return res.status(400).json({ error: "endTime must be after startTime" });
    }

    if (capacity !== undefined && capacity !== null) {
        if (typeof capacity !== 'number' || capacity <= 0) {
            return res.status(400).json({ error: "Capacity must be a positive number" });
        }
    }

    if (!Number.isInteger(points) || points <= 0) {
        return res.status(400).json({ error: "Points must be a positive integer" });
    }

    const userId = req.auth.id;

    const event = await prisma.event.create({
        data: {
            name,
            description,
            location,
            startTime: start,
            endTime: end,
            capacity: capacity !== undefined && capacity !== null ? capacity : null,
            pointsTotal: points,
            pointsAwarded: 0,
            published: false,
            organizers: {
                create: {
                    userId: userId
                }
            }
        }
    });

    const pointsRemain = event.pointsTotal - event.pointsAwarded;

    return res.status(201).json({
        id: event.id,
        name: event.name,
        description: event.description,
        location: event.location,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        capacity: event.capacity,
        pointsRemain: pointsRemain,
        pointsAwarded: event.pointsAwarded,
        published: event.published,
        organizers: [],
        guests: []
    });
});

router.get("/", authenticateJWT, requireRole("regular"), async (req, res) => {
    const { name, location, started, ended, showFull, page = 1, limit = 10 } = req.query;
    const currentUserRole = req.auth.role;

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

    if (location) {
        where.location = { contains: location };
    }

    const isManagerOrHigher = currentUserRole === "manager" || currentUserRole === "superuser";

    if (!isManagerOrHigher) {
        where.published = true;

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
    } else {
        const { published } = req.query;

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

        if (published !== undefined) {
            where.published = published === 'true';
        }
    }

    let events = await prisma.event.findMany({
        where,
        include: {
            guests: true
        },
        orderBy: { id: 'asc' }
    });

    const count = events.length;

    if (!isManagerOrHigher && showFull !== 'true') {
        events = events.filter(event => {
            return event.capacity === null || event.guests.length < event.capacity;
        });
    }

    const paginatedEvents = events.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    const results = paginatedEvents.map(event => {
        const result = {
            id: event.id,
            name: event.name,
            location: event.location,
            startTime: event.startTime.toISOString(),
            endTime: event.endTime.toISOString(),
            capacity: event.capacity,
            numGuests: event.guests.length
        };

        if (isManagerOrHigher) {
            result.pointsRemain = event.pointsTotal - event.pointsAwarded;
            result.pointsAwarded = event.pointsAwarded;
            result.published = event.published;
        }

        return result;
    });

    return res.status(200).json({
        count: isManagerOrHigher ? count : events.length,
        results
    });
});

router.get("/:eventId", authenticateJWT, requireRole("regular"), async (req, res) => {
    const { eventId } = req.params;
    const currentUserRole = req.auth.role;
    const currentUserId = req.auth.id;

    const evtId = parseInt(eventId, 10);
    if (isNaN(evtId)) {
        return res.status(400).json({ error: "Invalid event ID" });
    }

    const event = await prisma.event.findUnique({
        where: { id: evtId },
        include: {
            organizers: {
                include: {
                    user: true
                }
            },
            guests: true
        }
    });

    if (!event) {
        return res.status(404).json({ error: "Event not found" });
    }

    const isManagerOrHigher = currentUserRole === "manager" || currentUserRole === "superuser";
    const isOrganizer = event.organizers.some(org => org.userId === currentUserId);

    if (!isManagerOrHigher && !isOrganizer && !event.published) {
        return res.status(404).json({ error: "Event not found" });
    }

    const response = {
        id: event.id,
        name: event.name,
        description: event.description,
        location: event.location,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        capacity: event.capacity,
        organizers: event.organizers.map(org => ({
            id: org.user.id,
            utorid: org.user.utorid,
            name: org.user.name
        }))
    };

    if (isManagerOrHigher || isOrganizer) {
        response.pointsRemain = event.pointsTotal - event.pointsAwarded;
        response.pointsAwarded = event.pointsAwarded;
        response.published = event.published;
        response.guests = event.guests.map(g => g.userId);
    } else {
        response.numGuests = event.guests.length;
    }

    return res.status(200).json(response);
});

router.patch("/:eventId", authenticateJWT, async (req, res) => {
    const { eventId } = req.params;
    const { name, description, location, startTime, endTime, capacity, points, published } = req.body;
    const currentUserRole = req.auth.role;
    const currentUserId = req.auth.id;

    const evtId = parseInt(eventId, 10);
    if (isNaN(evtId)) {
        return res.status(400).json({ error: "Invalid event ID" });
    }

    const event = await prisma.event.findUnique({
        where: { id: evtId },
        include: {
            organizers: true,
            guests: true
        }
    });

    if (!event) {
        return res.status(404).json({ error: "Event not found" });
    }

    const isManagerOrHigher = currentUserRole === "manager" || currentUserRole === "superuser";
    const isOrganizer = event.organizers.some(org => org.userId === currentUserId);

    if (!isManagerOrHigher && !isOrganizer) {
        return res.status(403).json({ error: 'Insufficient permissions' });
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

    if (location !== undefined && location !== null) {
        if (typeof location !== 'string') {
            return res.status(400).json({ error: "Location must be a string" });
        }
        updateData.location = location;
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

        const finalStartTime = updateData.startTime || event.startTime;
        
        if (end <= finalStartTime) {
            return res.status(400).json({ error: "endTime must be after startTime" });
        }

        updateData.endTime = end;
    }

    if (capacity !== undefined && capacity !== null) {
        if (typeof capacity !== 'number' || capacity <= 0) {
            return res.status(400).json({ error: "Capacity must be a positive number" });
        }
        if (event.capacity !== null && capacity < event.guests.length) {
            return res.status(400).json({ error: "Cannot reduce capacity below current number of guests" });
        }
        updateData.capacity = capacity;
    }

    if (points !== undefined && points !== null) {
        if (!isManagerOrHigher) {
            return res.status(403).json({ error: "Only managers can update points" });
        }
        if (!Number.isInteger(points) || points <= 0) {
            return res.status(400).json({ error: "Points must be a positive integer" });
        }
        if (event.pointsAwarded !== null && points < event.pointsAwarded) {
            return res.status(400).json({ error: "Cannot reduce points below already awarded amount" });
        }
        updateData.pointsTotal = points;
    }

    if (published !== undefined && published !== null) {
        if (!isManagerOrHigher) {
            return res.status(403).json({ error: "Only managers can publish events" });
        }
        if (published !== true) {
            return res.status(400).json({ error: "Published can only be set to true" });
        }
        updateData.published = true;
    }

    const originalStartTime = event.startTime;
    const originalEndTime = event.endTime;

    if (originalStartTime <= now) {
        const restrictedFields = ['name', 'description', 'location', 'startTime', 'capacity'];
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

    await prisma.event.update({
        where: { id: evtId },
        data: updateData
    });

    const response = {
        id: event.id,
        name: updateData.name || event.name,
        location: updateData.location || event.location
    };

    if ('description' in updateData) response.description = updateData.description;
    if ('startTime' in updateData) response.startTime = updateData.startTime.toISOString();
    if ('endTime' in updateData) response.endTime = updateData.endTime.toISOString();
    if ('capacity' in updateData) response.capacity = updateData.capacity;
    if ('pointsTotal' in updateData) {
        response.points = updateData.pointsTotal;
        response.pointsRemain = updateData.pointsTotal - event.pointsAwarded;
    }
    if ('published' in updateData) response.published = updateData.published;

    return res.status(200).json(response);
});

router.delete("/:eventId", authenticateJWT, requireRole("manager"), async (req, res) => {
    const { eventId } = req.params;

    const evtId = parseInt(eventId, 10);
    if (isNaN(evtId)) {
        return res.status(400).json({ error: "Invalid event ID" });
    }

    const event = await prisma.event.findUnique({
        where: { id: evtId }
    });

    if (!event) {
        return res.status(404).json({ error: "Event not found" });
    }

    if (event.published) {
        return res.status(400).json({ error: "Cannot delete published event" });
    }

    await prisma.event.delete({
        where: { id: evtId }
    });

    return res.status(204).send();
});

router.post("/:eventId/organizers", authenticateJWT, requireRole("manager"), async (req, res) => {
    const { eventId } = req.params;
    const { utorid } = req.body;

    const evtId = parseInt(eventId, 10);
    if (isNaN(evtId)) {
        return res.status(400).json({ error: "Invalid event ID" });
    }

    if (!utorid) {
        return res.status(400).json({ error: "utorid is required" });
    }

    const event = await prisma.event.findUnique({
        where: { id: evtId },
        include: {
            organizers: {
                include: { user: true }
            },
            guests: true
        }
    });

    if (!event) {
        return res.status(404).json({ error: "Event not found" });
    }

    if (event.endTime < new Date()) {
        return res.status(410).json({ error: "Event has ended" });
    }

    const user = await prisma.user.findUnique({
        where: { utorid }
    });

    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    if (event.guests.some(g => g.userId === user.id)) {
        return res.status(400).json({ error: "User is already a guest" });
    }

    await prisma.eventOrganizer.create({
        data: {
            eventId: evtId,
            userId: user.id
        }
    });

    const updatedEvent = await prisma.event.findUnique({
        where: { id: evtId },
        include: {
            organizers: {
                include: { user: true }
            }
        }
    });

    return res.status(201).json({
        id: updatedEvent.id,
        name: updatedEvent.name,
        location: updatedEvent.location,
        organizers: updatedEvent.organizers.map(org => ({
            id: org.user.id,
            utorid: org.user.utorid,
            name: org.user.name
        }))
    });
});

router.delete("/:eventId/organizers/:userId", authenticateJWT, requireRole("manager"), async (req, res) => {
    const { eventId, userId } = req.params;

    const evtId = parseInt(eventId, 10);
    const usrId = parseInt(userId, 10);

    if (isNaN(evtId) || isNaN(usrId)) {
        return res.status(400).json({ error: "Invalid ID" });
    }

    await prisma.eventOrganizer.deleteMany({
        where: {
            eventId: evtId,
            userId: usrId
        }
    });

    return res.status(204).send();
});

router.post("/:eventId/guests", authenticateJWT, async (req, res) => {
    const { eventId } = req.params;
    const { utorid } = req.body;
    const currentUserRole = req.auth.role;
    const currentUserId = req.auth.id;

    const evtId = parseInt(eventId, 10);
    if (isNaN(evtId)) {
        return res.status(400).json({ error: "Invalid event ID" });
    }

    if (!utorid) {
        return res.status(400).json({ error: "utorid is required" });
    }

    const event = await prisma.event.findUnique({
        where: { id: evtId },
        include: {
            organizers: true,
            guests: true
        }
    });

    if (!event) {
        return res.status(404).json({ error: "Event not found" });
    }

    const isManagerOrHigher = currentUserRole === "manager" || currentUserRole === "superuser";
    const isOrganizer = event.organizers.some(org => org.userId === currentUserId);

    if (!isManagerOrHigher && !isOrganizer) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (!isManagerOrHigher && !event.published) {
        return res.status(404).json({ error: "Event not found" });
    }

    if (event.endTime < new Date()) {
        return res.status(410).json({ error: "Event has ended" });
    }

    if (event.capacity && event.guests.length >= event.capacity) {
        return res.status(410).json({ error: "Event is full" });
    }

    const user = await prisma.user.findUnique({
        where: { utorid }
    });

    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    if (event.organizers.some(org => org.userId === user.id)) {
        return res.status(400).json({ error: "User is already an organizer" });
    }

    await prisma.eventGuest.create({
        data: {
            eventId: evtId,
            userId: user.id
        }
    });

    return res.status(201).json({
        id: event.id,
        name: event.name,
        location: event.location,
        guestAdded: { id: user.id, utorid: user.utorid, name: user.name },
        numGuests: event.guests.length + 1
    });
});

router.delete("/:eventId/guests/me", authenticateJWT, requireRole("regular"), async (req, res) => {
    const { eventId } = req.params;
    const currentUserId = req.auth.id;

    const evtId = parseInt(eventId, 10);
    if (isNaN(evtId)) {
        return res.status(400).json({ error: "Invalid event ID" });
    }

    const event = await prisma.event.findUnique({
        where: { id: evtId }
    });

    if (!event) {
        return res.status(404).json({ error: "Event not found" });
    }

    if (event.endTime < new Date()) {
        return res.status(410).json({ error: "Event has ended" });
    }

    const guest = await prisma.eventGuest.findFirst({
        where: {
            eventId: evtId,
            userId: currentUserId
        }
    });

    if (!guest) {
        return res.status(404).json({ error: "Not RSVPed to this event" });
    }

    await prisma.eventGuest.delete({
        where: { id: guest.id }
    });

    return res.status(204).send();
});

router.delete("/:eventId/guests/:userId", authenticateJWT, requireRole("manager"), async (req, res) => {
    const { eventId, userId } = req.params;

    const evtId = parseInt(eventId, 10);
    const usrId = parseInt(userId, 10);

    if (isNaN(evtId) || isNaN(usrId)) {
        return res.status(400).json({ error: "Invalid ID" });
    }

    await prisma.eventGuest.deleteMany({
        where: {
            eventId: evtId,
            userId: usrId
        }
    });

    return res.status(204).send();
});

router.post("/:eventId/guests/me", authenticateJWT, requireRole("regular"), async (req, res) => {
    const { eventId } = req.params;
    const currentUserId = req.auth.id;

    const evtId = parseInt(eventId, 10);
    if (isNaN(evtId)) {
        return res.status(400).json({ error: "Invalid event ID" });
    }

    const event = await prisma.event.findUnique({
        where: { id: evtId },
        include: {
            organizers: true,
            guests: true
        }
    });

    if (!event) {
        return res.status(404).json({ error: "Event not found" });
    }

    if (!event.published) {
        return res.status(404).json({ error: "Event not found" });
    }

    if (event.endTime < new Date()) {
        return res.status(410).json({ error: "Event has ended" });
    }

    if (event.capacity && event.guests.length >= event.capacity) {
        return res.status(410).json({ error: "Event is full" });
    }

    if (event.guests.some(g => g.userId === currentUserId)) {
        return res.status(400).json({ error: "Already RSVPed" });
    }

    const user = await prisma.user.findUnique({
        where: { id: currentUserId }
    });

    await prisma.eventGuest.create({
        data: {
            eventId: evtId,
            userId: currentUserId
        }
    });

    return res.status(201).json({
        id: event.id,
        name: event.name,
        location: event.location,
        guestAdded: { id: user.id, utorid: user.utorid, name: user.name },
        numGuests: event.guests.length + 1
    });
});

router.post("/:eventId/transactions", authenticateJWT, async (req, res) => {
    const { eventId } = req.params;
    const { type, utorid, amount, remark } = req.body;
    const currentUserRole = req.auth.role;
    const currentUserId = req.auth.id;

    const evtId = parseInt(eventId, 10);
    if (isNaN(evtId)) {
        return res.status(400).json({ error: "Invalid event ID" });
    }

    if (!type || type !== "event") {
        return res.status(400).json({ error: "Type must be 'event'" });
    }

    if (amount === undefined || !Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({ error: "Amount must be a positive integer" });
    }

    const event = await prisma.event.findUnique({
        where: { id: evtId },
        include: {
            organizers: true,
            guests: {
                include: { user: true }
            }
        }
    });

    if (!event) {
        return res.status(404).json({ error: "Event not found" });
    }

    const isManagerOrHigher = currentUserRole === "manager" || currentUserRole === "superuser";
    const isOrganizer = event.organizers.some(org => org.userId === currentUserId);

    if (!isManagerOrHigher && !isOrganizer) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const pointsRemaining = event.pointsTotal - event.pointsAwarded;

    if (utorid) {
        const user = await prisma.user.findUnique({
            where: { utorid }
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const isGuest = event.guests.some(g => g.userId === user.id);
        if (!isGuest) {
            return res.status(400).json({ error: "User is not a guest" });
        }

        if (amount > pointsRemaining) {
            return res.status(400).json({ error: "Insufficient points remaining" });
        }

        const transaction = await prisma.transaction.create({
            data: {
                type: "event",
                amount: amount,
                remark: remark || "",
                ownerUserId: user.id,
                creatorUserId: currentUserId,
                eventId: evtId
            }
        });

        await prisma.user.update({
            where: { id: user.id },
            data: { points: { increment: amount } }
        });

        await prisma.event.update({
            where: { id: evtId },
            data: { pointsAwarded: { increment: amount } }
        });

        return res.status(201).json({
            id: transaction.id,
            recipient: user.utorid,
            awarded: amount,
            type: "event",
            relatedId: evtId,
            remark: remark || "",
            createdBy: req.auth.utorid
        });
    }

    const totalAmount = amount * event.guests.length;
    if (totalAmount > pointsRemaining) {
        return res.status(400).json({ error: "Insufficient points remaining" });
    }

    const transactions = [];
    for (const guest of event.guests) {
        const transaction = await prisma.transaction.create({
            data: {
                type: "event",
                amount: amount,
                remark: remark || "",
                ownerUserId: guest.userId,
                creatorUserId: currentUserId,
                eventId: evtId
            }
        });

        await prisma.user.update({
            where: { id: guest.userId },
            data: { points: { increment: amount } }
        });

        transactions.push({
            id: transaction.id,
            recipient: guest.user.utorid,
            awarded: amount,
            type: "event",
            relatedId: evtId,
            remark: remark || "",
            createdBy: req.auth.utorid
        });
    }

    await prisma.event.update({
        where: { id: evtId },
        data: { pointsAwarded: { increment: totalAmount } }
    });

    return res.status(201).json(transactions);
});

router.get("/organizing/me", authenticateJWT, requireRole("regular"), async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const currentUserId = req.auth.id;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({ error: "Invalid page number" });
    }

    if (isNaN(limitNum) || limitNum < 1) {
        return res.status(400).json({ error: "Invalid limit" });
    }

    const events = await prisma.event.findMany({
        where: {
            organizers: {
                some: {
                    userId: currentUserId
                }
            }
        },
        include: {
            guests: true,
            organizers: {
                include: {
                    user: true
                }
            }
        },
        orderBy: { id: 'asc' }
    });

    const count = events.length;
    const paginatedEvents = events.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    const results = paginatedEvents.map(event => ({
        id: event.id,
        name: event.name,
        description: event.description,
        location: event.location,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        capacity: event.capacity,
        numGuests: event.guests.length,
        pointsTotal: event.pointsTotal,
        pointsAwarded: event.pointsAwarded,
        published: event.published
    }));

    return res.status(200).json({
        count,
        results
    });
});

router.get("/:eventId/guests", authenticateJWT, async (req, res) => {
    const { eventId } = req.params;
    const currentUserRole = req.auth.role;
    const currentUserId = req.auth.id;

    const evtId = parseInt(eventId, 10);
    if (isNaN(evtId)) {
        return res.status(400).json({ error: "Invalid event ID" });
    }

    const event = await prisma.event.findUnique({
        where: { id: evtId },
        include: {
            organizers: true,
            guests: {
                include: {
                    user: true
                }
            }
        }
    });

    if (!event) {
        return res.status(404).json({ error: "Event not found" });
    }

    const isManagerOrHigher = currentUserRole === "manager" || currentUserRole === "superuser";
    const isOrganizer = event.organizers.some(org => org.userId === currentUserId);

    if (!isManagerOrHigher && !isOrganizer) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const guests = event.guests.map(guest => ({
        id: guest.user.id,
        utorid: guest.user.utorid,
        name: guest.user.name
    }));

    return res.status(200).json(guests);
});

router.get("/:eventId/guests/me", authenticateJWT, requireRole("regular"), async (req, res) => {
    const { eventId } = req.params;
    const currentUserId = req.auth.id;

    const evtId = parseInt(eventId, 10);
    if (isNaN(evtId)) {
        return res.status(400).json({ error: "Invalid event ID" });
    }

    const event = await prisma.event.findUnique({
        where: { id: evtId },
        include: {
            guests: true
        }
    });

    if (!event || !event.published) {
        return res.status(404).json({ error: "Event not found" });
    }

    const guest = event.guests.find(g => g.userId === currentUserId);
    
    if (!guest) {
        return res.status(404).json({ error: "Not attending" });
    }

    return res.status(200).json({
        attending: true,
        eventId: event.id
    });
});

module.exports = router;
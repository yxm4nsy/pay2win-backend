// main prisma db connection to be used across all files
const {PrismaClient} = require("@prisma/client")
const prisma = new PrismaClient()
module.exports = prisma
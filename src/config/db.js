// Instância única do Prisma Client, reaproveitada em todo o app.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;

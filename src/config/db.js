// Instância única do Prisma Client, reaproveitada em todo o app.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const appDataDir = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');

fs.mkdirSync(appDataDir, { recursive: true });

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:../data/app.db';
}

if (process.env.DATABASE_URL.startsWith('file:')) {
  const sqlitePath = process.env.DATABASE_URL.slice('file:'.length).split('?')[0];
  const prismaDir = path.join(__dirname, '..', '..', 'prisma');
  const absolutePath = path.isAbsolute(sqlitePath)
    ? sqlitePath
    : path.resolve(prismaDir, sqlitePath);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  if (!fs.existsSync(absolutePath)) {
    fs.closeSync(fs.openSync(absolutePath, 'w'));
  }
}

const prisma = new PrismaClient();

module.exports = prisma;

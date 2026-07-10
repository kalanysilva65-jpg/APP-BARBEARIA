// Instância única do Prisma Client, reaproveitada em todo o app.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const { appDataDir } = require('./paths');

// Sem DATABASE_URL explícita, o banco mora na raiz de dados (que em produção
// aponta para fora da pasta de deploy — veja config/paths.js).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:' + path.join(appDataDir, 'app.db');
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

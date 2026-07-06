require('dotenv').config();
const fs = require('fs');
const path = require('path');

const databaseUrl = process.env.DATABASE_URL || 'file:../data/app.db';

if (!databaseUrl.startsWith('file:')) {
  process.exit(0);
}

const sqlitePath = databaseUrl.slice('file:'.length).split('?')[0];
const prismaDir = path.join(__dirname, '..', 'prisma');
const absolutePath = path.isAbsolute(sqlitePath)
  ? sqlitePath
  : path.resolve(prismaDir, sqlitePath);

fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

if (!fs.existsSync(absolutePath)) {
  fs.closeSync(fs.openSync(absolutePath, 'w'));
}

console.log(`SQLite pronto em ${absolutePath}`);

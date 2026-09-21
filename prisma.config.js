// Configuração do Prisma (substitui o bloco `prisma` do package.json, que o
// Prisma 7 vai REMOVER). Só aponta o schema e o comando de seed — o resto
// (datasource, gerador) continua no prisma/schema.prisma.
//
// CommonJS de propósito: o projeto é CommonJS (sem "type":"module"), então o
// carregador de config do Prisma lê este arquivo com require/module.exports.
//
// IMPORTANTE: com um prisma.config presente, o Prisma NÃO carrega o .env sozinho
// ("skipping environment variable loading"). Sem isto, DATABASE_URL some e o
// `prisma generate`/`migrate deploy` do deploy quebra. Então carregamos aqui.
require('dotenv').config();
const path = require('node:path');
const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    // Usado por `prisma db seed` e pelo auto-seed do `migrate dev`/`reset`.
    // (No deploy o seed roda explícito: `node prisma/seed.js`.)
    seed: 'node prisma/seed.js',
  },
});

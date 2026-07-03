// Perfil do usuário logado (usado no hero do painel: foto + nome).
const fs = require('fs');
const path = require('path');
const prisma = require('../config/db');

// POST /painel/perfil/foto — o próprio usuário logado troca sua foto.
async function salvarFoto(req, res) {
  const destino = req.get('Referer') || '/painel';
  const id = req.session.usuario.id;

  if (!req.file) return res.redirect(destino);

  const atual = await prisma.usuario.findUnique({ where: { id } });
  if (atual && atual.fotoUrl) {
    fs.unlink(path.join(__dirname, '..', '..', atual.fotoUrl.replace(/^\//, '')), () => {});
  }
  await prisma.usuario.update({ where: { id }, data: { fotoUrl: '/uploads/' + req.file.filename } });
  req.session.flash = { tipo: 'sucesso', texto: 'Foto atualizada.' };
  res.redirect(destino);
}

module.exports = { salvarFoto };

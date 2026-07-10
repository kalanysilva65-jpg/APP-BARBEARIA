// Perfil do usuário logado (usado no hero do painel: foto + nome).
const fs = require('fs');
const prisma = require('../config/db');
const { caminhoDoUpload } = require('../config/paths');
const { resumoJornada } = require('./horarioController');

// GET /painel/mais — cartão de perfil do usuário logado.
async function ver(req, res) {
  const usuario = req.session.usuario;
  let atendimentos = 0;
  let horarioTrabalho = null;

  if (usuario.barbeariaId) {
    atendimentos = await prisma.agendamentoItem.count({
      where: { agendamento: { usuarioId: usuario.id, status: 'concluido' } },
    }).catch(() => 0);

    const jornada = await prisma.horarioTrabalho.findMany({ where: { usuarioId: usuario.id } });
    horarioTrabalho = resumoJornada(jornada);
  }

  res.render('painel/mais', { titulo: 'Perfil', atendimentos, horarioTrabalho });
}

// POST /painel/perfil/foto — o próprio usuário logado troca sua foto.
async function salvarFoto(req, res) {
  const destino = req.get('Referer') || '/painel';
  const id = req.session.usuario.id;

  if (!req.file) return res.redirect(destino);

  const atual = await prisma.usuario.findUnique({ where: { id } });
  const anterior = atual && caminhoDoUpload(atual.fotoUrl);
  if (anterior) fs.unlink(anterior, () => {});
  await prisma.usuario.update({ where: { id }, data: { fotoUrl: '/uploads/' + req.file.filename } });
  req.session.flash = { tipo: 'sucesso', texto: 'Foto atualizada.' };
  res.redirect(destino);
}

module.exports = { ver, salvarFoto };

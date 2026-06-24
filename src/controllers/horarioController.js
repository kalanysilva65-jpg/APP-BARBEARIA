// Controlador de horários: jornada semanal e bloqueios por barbeiro.
// Acesso exclusivo do admin (garantido pela rota com exigeAdmin).
const prisma = require('../config/db');
const { DIAS_SEMANA } = require('../config/constantes');
const { dataLocal } = require('../services/disponibilidade');

// GET /painel/horarios — mostra jornada + bloqueios do barbeiro selecionado
async function ver(req, res) {
  const barbeiros = await prisma.usuario.findMany({ where: { ativo: true }, orderBy: { id: 'asc' } });
  if (barbeiros.length === 0) {
    return res.render('painel/horarios', { titulo: 'Horários', barbeiros, barbeiro: null, jornada: [], bloqueios: [], DIAS_SEMANA });
  }

  const barbeiroId = Number(req.query.barbeiro) || barbeiros[0].id;
  const barbeiro = barbeiros.find((b) => b.id === barbeiroId) || barbeiros[0];

  const jornada = await prisma.horarioTrabalho.findMany({
    where: { usuarioId: barbeiro.id },
    orderBy: { diaSemana: 'asc' },
  });

  // Bloqueios de hoje em diante
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const bloqueios = await prisma.bloqueio.findMany({
    where: { usuarioId: barbeiro.id, data: { gte: hoje } },
    orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
  });

  res.render('painel/horarios', { titulo: 'Horários', barbeiros, barbeiro, jornada, bloqueios, DIAS_SEMANA });
}

// POST /painel/horarios/jornada — salva a jornada semanal do barbeiro
async function salvarJornada(req, res) {
  const barbeiroId = Number(req.body.barbeiroId);
  if (!barbeiroId) return res.redirect('/painel/horarios');

  for (let dia = 0; dia <= 6; dia++) {
    const trabalha = req.body['trabalha_' + dia] === 'on';
    const horaInicio = req.body['inicio_' + dia] || '09:00';
    const horaFim = req.body['fim_' + dia] || '20:00';

    const existente = await prisma.horarioTrabalho.findFirst({
      where: { usuarioId: barbeiroId, diaSemana: dia },
    });
    if (existente) {
      await prisma.horarioTrabalho.update({
        where: { id: existente.id },
        data: { trabalha, horaInicio, horaFim },
      });
    } else {
      await prisma.horarioTrabalho.create({
        data: { usuarioId: barbeiroId, diaSemana: dia, trabalha, horaInicio, horaFim },
      });
    }
  }

  req.session.flash = { tipo: 'sucesso', texto: 'Jornada atualizada.' };
  res.redirect('/painel/horarios?barbeiro=' + barbeiroId);
}

// POST /painel/horarios/bloqueios — adiciona um bloqueio
async function adicionarBloqueio(req, res) {
  const barbeiroId = Number(req.body.barbeiroId);
  const data = req.body.data;
  const horaInicio = req.body.horaInicio;
  const horaFim = req.body.horaFim;
  const motivo = (req.body.motivo || '').trim() || null;

  if (barbeiroId && data && horaInicio && horaFim && horaInicio < horaFim) {
    await prisma.bloqueio.create({
      data: { usuarioId: barbeiroId, data: dataLocal(data), horaInicio, horaFim, motivo },
    });
    req.session.flash = { tipo: 'sucesso', texto: 'Bloqueio adicionado.' };
  } else {
    req.session.flash = { tipo: 'erro', texto: 'Preencha data e um intervalo de horário válido.' };
  }
  res.redirect('/painel/horarios?barbeiro=' + barbeiroId);
}

// POST /painel/horarios/bloqueios/:id/remover — remove um bloqueio
async function removerBloqueio(req, res) {
  const barbeiroId = Number(req.body.barbeiroId);
  await prisma.bloqueio.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  req.session.flash = { tipo: 'sucesso', texto: 'Bloqueio removido.' };
  res.redirect('/painel/horarios' + (barbeiroId ? '?barbeiro=' + barbeiroId : ''));
}

module.exports = { ver, salvarJornada, adicionarBloqueio, removerBloqueio };

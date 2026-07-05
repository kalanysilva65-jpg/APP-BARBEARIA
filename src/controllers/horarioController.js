// Controlador de horários: jornada semanal e bloqueios por barbeiro.
// Acesso exclusivo do admin (garantido pela rota com exigeAdmin).
const prisma = require('../config/db');
const { DIAS_SEMANA } = require('../config/constantes');
const { dataLocal } = require('../services/disponibilidade');

const DIAS_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Resume a jornada semanal numa frase curta (ex.: "Seg–Sáb, 09:00–18:00"),
// agrupando dias consecutivos que têm o mesmo horário.
function resumoJornada(jornada) {
  const porDia = new Array(7).fill(null);
  jornada.forEach((j) => { porDia[j.diaSemana] = j; });

  const grupos = [];
  let atual = null;
  for (let i = 0; i < 7; i++) {
    const j = porDia[i];
    if (j && j.trabalha) {
      if (atual && atual.fim === i - 1 && atual.horaInicio === j.horaInicio && atual.horaFim === j.horaFim) {
        atual.fim = i;
      } else {
        atual = { ini: i, fim: i, horaInicio: j.horaInicio, horaFim: j.horaFim };
        grupos.push(atual);
      }
    }
  }
  if (grupos.length === 0) return 'Sem expediente';
  return grupos
    .map((g) => {
      const dias = g.ini === g.fim ? DIAS_ABREV[g.ini] : `${DIAS_ABREV[g.ini]}–${DIAS_ABREV[g.fim]}`;
      return `${dias}, ${g.horaInicio}–${g.horaFim}`;
    })
    .join(' · ');
}

// Janela de agendamento do cliente: até quando ele pode marcar pelo app.
const JANELA_PADRAO = 'sem_limite';

async function lerJanelaAgendamento(barbeariaId) {
  const cfg = await prisma.configuracao.findUnique({
    where: { barbeariaId_chave: { barbeariaId, chave: 'janelaAgendamento' } },
  }).catch(() => null);
  return (cfg && cfg.valor) || JANELA_PADRAO;
}

// GET /painel/horarios — jornada de todos os barbeiros + bloqueios manuais (todos)
async function ver(req, res) {
  const b = req.barbeariaId;
  const barbeiros = await prisma.usuario.findMany({ where: { barbeariaId: b, ativo: true }, orderBy: { id: 'asc' } });

  const todaJornada = await prisma.horarioTrabalho.findMany({ where: { barbeariaId: b } });
  const barbeirosComJornada = barbeiros.map((barbeiro) => {
    const jornada = todaJornada.filter((j) => j.usuarioId === barbeiro.id);
    return { barbeiro, jornada, resumo: resumoJornada(jornada) };
  });

  // Bloqueios manuais de hoje em diante (todos os barbeiros).
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const bloqueios = await prisma.bloqueio.findMany({
    where: { barbeariaId: b, data: { gte: hoje } },
    include: { usuario: true },
    orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
  });

  const janelaAgendamento = await lerJanelaAgendamento(b);

  res.render('painel/horarios', {
    titulo: 'Horários',
    barbeirosComJornada,
    barbeiros,
    bloqueios,
    DIAS_SEMANA,
    janelaAgendamento,
  });
}

// POST /painel/horarios/janela — salva até quando o cliente pode marcar pelo app
async function salvarJanela(req, res) {
  const b = req.barbeariaId;
  const valor = ['semana', 'duas_semanas', 'sem_limite'].includes(req.body.janela) ? req.body.janela : JANELA_PADRAO;
  await prisma.configuracao.upsert({
    where: { barbeariaId_chave: { barbeariaId: b, chave: 'janelaAgendamento' } },
    update: { valor },
    create: { barbeariaId: b, chave: 'janelaAgendamento', valor },
  });
  res.redirect('/painel/horarios');
}

// Confere se o barbeiro pertence à barbearia do contexto.
async function barbeiroDaBarbearia(barbeiroId, barbeariaId) {
  if (!barbeiroId) return null;
  return prisma.usuario.findFirst({ where: { id: barbeiroId, barbeariaId } });
}

// POST /painel/horarios/jornada — salva a jornada semanal do barbeiro
async function salvarJornada(req, res) {
  const b = req.barbeariaId;
  const barbeiroId = Number(req.body.barbeiroId);
  if (!(await barbeiroDaBarbearia(barbeiroId, b))) return res.redirect('/painel/horarios');

  for (let dia = 0; dia <= 6; dia++) {
    const trabalha = req.body['trabalha_' + dia] === 'on';
    const horaInicio = req.body['inicio_' + dia] || '09:00';
    const horaFim = req.body['fim_' + dia] || '20:00';

    const existente = await prisma.horarioTrabalho.findFirst({
      where: { barbeariaId: b, usuarioId: barbeiroId, diaSemana: dia },
    });
    if (existente) {
      await prisma.horarioTrabalho.update({
        where: { id: existente.id },
        data: { trabalha, horaInicio, horaFim },
      });
    } else {
      await prisma.horarioTrabalho.create({
        data: { barbeariaId: b, usuarioId: barbeiroId, diaSemana: dia, trabalha, horaInicio, horaFim },
      });
    }
  }

  req.session.flash = { tipo: 'sucesso', texto: 'Jornada atualizada.' };
  res.redirect('/painel/horarios');
}

// POST /painel/horarios/bloqueios — adiciona um bloqueio
async function adicionarBloqueio(req, res) {
  const b = req.barbeariaId;
  const barbeiroId = Number(req.body.barbeiroId);
  const data = req.body.data;
  const horaInicio = req.body.horaInicio;
  const horaFim = req.body.horaFim;
  const motivo = (req.body.motivo || '').trim() || null;

  if ((await barbeiroDaBarbearia(barbeiroId, b)) && data && horaInicio && horaFim && horaInicio < horaFim) {
    await prisma.bloqueio.create({
      data: { barbeariaId: b, usuarioId: barbeiroId, data: dataLocal(data), horaInicio, horaFim, motivo },
    });
    req.session.flash = { tipo: 'sucesso', texto: 'Bloqueio adicionado.' };
  } else {
    req.session.flash = { tipo: 'erro', texto: 'Preencha data e um intervalo de horário válido.' };
  }
  res.redirect('/painel/horarios');
}

// POST /painel/horarios/bloqueios/:id/remover — remove um bloqueio
async function removerBloqueio(req, res) {
  await prisma.bloqueio.deleteMany({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId } }).catch(() => {});
  req.session.flash = { tipo: 'sucesso', texto: 'Bloqueio removido.' };
  res.redirect('/painel/horarios');
}

module.exports = { ver, salvarJornada, adicionarBloqueio, removerBloqueio, salvarJanela, resumoJornada };

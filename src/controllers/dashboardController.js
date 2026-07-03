// Dashboard do painel do barbeiro (tela inicial /painel).
// Reúne, a partir dos dados que já existem, os cartões: agenda de hoje + próximo
// cliente, faturamento do dia + barras da semana, produtividade (ocupação),
// retenção e novos clientes. Tudo escopado pela barbearia do contexto.
const prisma = require('../config/db');
const { paraMinutos } = require('../services/disponibilidade');

// Date -> meia-noite local do mesmo dia.
function inicioDoDia(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Ocupação (%) = minutos atendidos ÷ minutos de jornada disponível no período.
async function calcularOcupacao(barbeariaId, barbeiroIds, inicio, fimExcl) {
  if (!barbeiroIds.length) return 0;
  const ags = await prisma.agendamento.findMany({
    where: { barbeariaId, usuarioId: { in: barbeiroIds }, data: { gte: inicio, lt: fimExcl }, status: { not: 'cancelado' } },
    include: { itens: { include: { servico: true } } },
  });
  let ocupado = 0;
  for (const a of ags) ocupado += a.itens.reduce((s, it) => s + (it.servico.duracaoMin || 0) * it.quantidade, 0);

  const jornadas = await prisma.horarioTrabalho.findMany({ where: { barbeariaId, usuarioId: { in: barbeiroIds } } });
  const amanha0 = inicioDoDia(new Date());
  amanha0.setDate(amanha0.getDate() + 1);
  const limite = new Date(Math.min(fimExcl.getTime(), amanha0.getTime())); // não conta dias futuros
  let disponivel = 0;
  for (let d = new Date(inicio); d < limite; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    for (const j of jornadas) {
      if (j.diaSemana === dow && j.trabalha) disponivel += Math.max(0, paraMinutos(j.horaFim) - paraMinutos(j.horaInicio));
    }
  }
  return disponivel > 0 ? Math.round((ocupado / disponivel) * 100) : 0;
}

// GET /painel
async function ver(req, res) {
  const b = req.barbeariaId;
  const ehAdmin = req.ehAdmin;
  const usuarioId = req.session.usuario.id;

  const agora = new Date();
  const hoje0 = inicioDoDia(agora);
  const amanha0 = new Date(hoje0);
  amanha0.setDate(hoje0.getDate() + 1);
  const minutoAgora = agora.getHours() * 60 + agora.getMinutes();

  // Barbeiros do escopo: admin vê a barbearia toda; funcionário, só a si.
  const barbeiros = await prisma.usuario.findMany({ where: { barbeariaId: b, ativo: true }, select: { id: true } });
  const barbeiroIds = ehAdmin ? barbeiros.map((x) => x.id) : [usuarioId];

  // --- Agenda de hoje + próximo cliente ------------------------------------
  const filtroBarbeiro = ehAdmin ? {} : { usuarioId };
  const agsHoje = await prisma.agendamento.findMany({
    where: { barbeariaId: b, data: hoje0, status: { not: 'cancelado' }, ...filtroBarbeiro },
    include: { usuario: true, itens: { include: { servico: true } } },
    orderBy: { horaInicio: 'asc' },
  });
  const totalHoje = agsHoje.length;
  const proximoAg = agsHoje.find((a) => a.status === 'agendado' && paraMinutos(a.horaInicio) >= minutoAgora) || null;
  const proximo = proximoAg
    ? {
        nome: proximoAg.clienteNome,
        hora: proximoAg.horaInicio,
        servico: proximoAg.itens.map((i) => i.servico.nome).join(' + ') || 'Atendimento',
        barbeiro: proximoAg.usuario.nome,
      }
    : null;

  // --- Faturamento de hoje + previsto + barras da semana (admin) ------------
  let ganhoHoje = 0;
  let previstoHoje = 0;
  let barras = [];
  let maxBarra = 1;
  if (ehAdmin) {
    const caixaHoje = await prisma.caixa.aggregate({
      _sum: { valor: true },
      where: { barbeariaId: b, tipo: 'entrada', data: { gte: hoje0, lt: amanha0 } },
    });
    ganhoHoje = caixaHoje._sum.valor || 0;
    previstoHoje = agsHoje.reduce((s, a) => s + a.valorTotal, 0);

    // Semana atual (segunda a domingo)
    const offSeg = (agora.getDay() + 6) % 7; // 0 = segunda
    const seg = new Date(hoje0);
    seg.setDate(hoje0.getDate() - offSeg);
    const rotulos = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    for (let i = 0; i < 7; i++) {
      const d0 = new Date(seg);
      d0.setDate(seg.getDate() + i);
      const d1 = new Date(d0);
      d1.setDate(d0.getDate() + 1);
      const soma = await prisma.caixa.aggregate({
        _sum: { valor: true },
        where: { barbeariaId: b, tipo: 'entrada', data: { gte: d0, lt: d1 } },
      });
      barras.push({ rotulo: rotulos[i], valor: soma._sum.valor || 0, hoje: d0.getTime() === hoje0.getTime() });
    }
    maxBarra = Math.max(1, ...barras.map((x) => x.valor));
  }

  // --- Novos clientes (90 dias) --------------------------------------------
  const d90 = new Date(hoje0);
  d90.setDate(d90.getDate() - 90);
  const novosClientes = await prisma.cliente.count({ where: { barbeariaId: b, criadoEm: { gte: d90 } } });

  // --- Retenção (90 dias): % de clientes com 2+ atendimentos ---------------
  const ags90 = await prisma.agendamento.findMany({
    where: { barbeariaId: b, data: { gte: d90 }, status: { not: 'cancelado' }, clienteId: { not: null } },
    select: { clienteId: true },
  });
  const visitas = {};
  ags90.forEach((a) => (visitas[a.clienteId] = (visitas[a.clienteId] || 0) + 1));
  const totalComVisita = Object.keys(visitas).length;
  const recorrentes = Object.values(visitas).filter((n) => n >= 2).length;
  const retencao = totalComVisita > 0 ? Math.round((recorrentes / totalComVisita) * 100) : 0;

  // --- Produtividade / ocupação (90 dias) ----------------------------------
  const produtividade = await calcularOcupacao(b, barbeiroIds, d90, amanha0);

  // Alerta de estoque baixo (admin) — mantém o comportamento antigo.
  let estoqueBaixo = [];
  if (ehAdmin) {
    const itens = await prisma.estoque.findMany({ where: { barbeariaId: b } });
    estoqueBaixo = itens.filter((i) => i.quantidade <= i.quantidadeMinima);
  }

  res.render('painel/dashboard', {
    titulo: 'Painel',
    totalHoje,
    proximo,
    ganhoHoje,
    previstoHoje,
    barras,
    maxBarra,
    novosClientes,
    retencao,
    produtividade,
    estoqueBaixo,
  });
}

module.exports = { ver };

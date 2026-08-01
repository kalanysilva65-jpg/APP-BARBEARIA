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
  const concluidosHoje = agsHoje.filter((a) => a.status === 'concluido').length;
  const restantesHoje = totalHoje - concluidosHoje;

  // Próximos atendimentos (agendados, ainda não concluídos, a partir de agora).
  const proximosLista = agsHoje
    .filter((a) => a.status === 'agendado' && paraMinutos(a.horaInicio) >= minutoAgora)
    .slice(0, 3)
    .map((a) => ({
      nome: a.clienteNome,
      hora: a.horaInicio,
      servico: a.itens.map((i) => i.servico.nome).join(' + ') || 'Atendimento',
    }));

  // --- Faturamento de hoje + previsto + barras da semana (admin) ------------
  let ganhoHoje = 0;
  let previstoHoje = 0;
  let variacaoHojeOntem = null; // % vs ontem (null = sem dado de ontem pra comparar)
  let barras = [];
  let maxBarra = 1;
  if (ehAdmin) {
    const caixaHoje = await prisma.caixa.aggregate({
      _sum: { valor: true },
      where: { barbeariaId: b, tipo: 'entrada', data: { gte: hoje0, lt: amanha0 } },
    });
    ganhoHoje = caixaHoje._sum.valor || 0;
    previstoHoje = agsHoje.reduce((s, a) => s + a.valorTotal, 0);

    const ontem0 = new Date(hoje0);
    ontem0.setDate(ontem0.getDate() - 1);
    const caixaOntem = await prisma.caixa.aggregate({
      _sum: { valor: true },
      where: { barbeariaId: b, tipo: 'entrada', data: { gte: ontem0, lt: hoje0 } },
    });
    const ganhoOntem = caixaOntem._sum.valor || 0;
    if (ganhoOntem > 0) variacaoHojeOntem = Math.round(((ganhoHoje - ganhoOntem) / ganhoOntem) * 100);

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

  // --- Ticket médio de hoje (faturado ÷ atendimentos concluídos) -----------
  const ticketMedioHoje = concluidosHoje > 0 ? Math.round(ganhoHoje / concluidosHoje) : 0;

  // --- Saudação pela hora do dia (Bom dia / Boa tarde / Boa noite) ---------
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  // --- Data por extenso do cabeçalho ---------------------------------------
  const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const dataLonga = `${DIAS_SEMANA[agora.getDay()]}, ${agora.getDate()} de ${MESES_LONGOS[agora.getMonth()]}`;

  // --- "PRÓXIMO AGENDAMENTO" + os seguintes --------------------------------
  // Olha ALÉM de hoje de propósito: quando o dia já acabou, a Home mostra o
  // próximo compromisso real (amanhã, semana que vem) em vez de ficar vazia
  // — é o bloco que abre a tela no design Turno 6, não pode ficar em branco.
  const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const agsFuturos = await prisma.agendamento.findMany({
    where: { barbeariaId: b, data: { gte: hoje0 }, status: 'agendado', ...filtroBarbeiro },
    include: { itens: { include: { servico: true } } },
    orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
    take: 20,
  });
  const proximosTodos = agsFuturos
    // Hoje só conta o que ainda não passou; dias futuros contam inteiros.
    .filter((a) => a.data.getTime() > hoje0.getTime() || paraMinutos(a.horaInicio) >= minutoAgora)
    .slice(0, 4)
    .map((a) => ({
      cliente: a.clienteNome,
      hora: a.horaInicio,
      servico: a.itens.map((i) => i.servico.nome).join(' + ') || 'Atendimento',
      diaNum: a.data.getDate(),
      mesLabel: MESES_CURTOS[a.data.getMonth()],
    }));
  const proximoCorte = proximosTodos[0] || null;
  const seguintesCortes = proximosTodos.slice(1);

  // --- Faturamento semanal: total + colunas coloridas ----------------------
  // Os tons ciclam numa paleta fixa de 5 (igual à referência) — a cor não
  // codifica valor nenhum, é ritmo visual.
  const faturamentoSemanal = barras.reduce((s, x) => s + x.valor, 0);
  const TONS_BLOCO = [
    { fundo: '#ADADAD', texto: '#0E0E0E', apoio: '#454545' },
    { fundo: '#0E0E0E', texto: '#FAFAFA', apoio: '#7B7B7B' },
    { fundo: '#454545', texto: '#FAFAFA', apoio: '#ADADAD' },
    { fundo: '#FAFAFA', texto: '#0E0E0E', apoio: '#7B7B7B' },
    { fundo: '#1B1C1D', texto: '#FAFAFA', apoio: '#7B7B7B' },
  ];
  const blocosSemana = barras.map((x, i) => {
    const t = TONS_BLOCO[i % TONS_BLOCO.length];
    return {
      valor: x.valor,
      label: x.rotulo,
      // Piso de 120px: uma coluna zerada ainda precisa caber o valor + o dia.
      altura: Math.max(120, Math.round((x.valor / maxBarra) * 240)),
      fundo: t.fundo,
      texto: t.texto,
      apoio: t.apoio,
    };
  });

  // --- Alerta de estoque baixo ---------------------------------------------
  const itensEstoque = await prisma.estoque.findMany({ where: { barbeariaId: b } });
  const emFalta = itensEstoque.filter((e) => e.quantidadeMinima > 0 && e.quantidade <= e.quantidadeMinima);
  const estoqueBaixo = {
    tem: emFalta.length > 0,
    quantidade: emFalta.length,
    titulo: emFalta.length === 1 ? 'item no limite' : 'itens no limite',
    nomes: emFalta.slice(0, 4).map((e) => e.nome).join(', '),
  };

  res.render('painel/dashboard', {
    titulo: 'Painel',
    totalHoje,
    concluidosHoje,
    restantesHoje,
    proximosLista,
    ganhoHoje,
    previstoHoje,
    variacaoHojeOntem,
    barras,
    maxBarra,
    novosClientes,
    retencao,
    produtividade,
    ticketMedioHoje,
    saudacao,
    dataLonga,
    proximoCorte,
    seguintesCortes,
    faturamentoSemanal,
    blocosSemana,
    estoqueBaixo,
  });
}

module.exports = { ver };

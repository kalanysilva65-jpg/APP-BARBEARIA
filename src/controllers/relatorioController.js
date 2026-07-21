// Controlador da tela de Relatórios (só admin) — visão consolidada do
// desempenho da barbearia: faturamento, gastos/lucro, ranking de serviços/
// produtos/barbeiros, formas de pagamento e ocupação por dia/horário.
// Tudo calculado a partir dos dados reais (Agendamento/Caixa/Servico), sem
// nada fixo — diferente do protótipo, que usava números de exemplo.
const prisma = require('../config/db');
const { paraMinutos } = require('../services/disponibilidade');
const { COMISSAO_PRODUTO_PERCENTUAL } = require('../config/constantes');

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dataLocal(s) {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
}
function fmtDataBR(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Cores recicladas em toda a tela (categorias de gasto, donut de pagamento) —
// mesma paleta usada nos exemplos do HTML original (#0A0A0A, #6B7A8F, #C9A87C, #D7DBDC).
const PALETA = ['#0A0A0A', '#6B7A8F', '#C9A87C', '#D7DBDC', '#8FA6C9', '#B5C9A0'];

function somarEntradaSaida(lancamentos) {
  let entrou = 0;
  let saiu = 0;
  for (const l of lancamentos) {
    if (l.tipo === 'entrada') entrou += l.valor;
    else saiu += l.valor;
  }
  return { entrou, saiu, lucro: entrou - saiu };
}

function variacaoPct(atual, anterior) {
  if (anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

// GET /painel/relatorios
async function ver(req, res) {
  const b = req.barbeariaId;
  const agora = new Date();
  const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

  // --- Período -----------------------------------------------------------
  const periodo = ['hoje', 'semana', 'mes', 'ano', 'custom'].includes(req.query.periodo) ? req.query.periodo : 'mes';
  let inicio, fimExcl, rotulo;
  if (periodo === 'custom' && req.query.de && req.query.ate) {
    inicio = dataLocal(req.query.de);
    fimExcl = dataLocal(req.query.ate);
    fimExcl.setDate(fimExcl.getDate() + 1);
    rotulo = fmtDataBR(inicio) + ' – ' + fmtDataBR(new Date(fimExcl.getTime() - 86400000));
  } else if (periodo === 'hoje') {
    inicio = new Date(hoje0);
    fimExcl = new Date(hoje0);
    fimExcl.setDate(fimExcl.getDate() + 1);
    rotulo = 'Hoje';
  } else if (periodo === 'semana') {
    inicio = new Date(hoje0);
    inicio.setDate(hoje0.getDate() - hoje0.getDay());
    fimExcl = new Date(inicio);
    fimExcl.setDate(inicio.getDate() + 7);
    rotulo = 'Esta semana';
  } else if (periodo === 'ano') {
    inicio = new Date(hoje0.getFullYear(), 0, 1);
    fimExcl = new Date(hoje0.getFullYear() + 1, 0, 1);
    rotulo = 'Este ano';
  } else {
    inicio = new Date(hoje0.getFullYear(), hoje0.getMonth(), 1);
    fimExcl = new Date(hoje0.getFullYear(), hoje0.getMonth() + 1, 1);
    rotulo = 'Este mês';
  }
  // Período anterior de mesma duração, pra comparar (%).
  const duracaoMs = fimExcl.getTime() - inicio.getTime();
  const inicioAnterior = new Date(inicio.getTime() - duracaoMs);
  const fimAnteriorExcl = new Date(inicio);

  const [lancamentos, lancamentosAnterior] = await Promise.all([
    prisma.caixa.findMany({ where: { barbeariaId: b, data: { gte: inicio, lt: fimExcl } }, include: { categoria: true } }),
    prisma.caixa.findMany({ where: { barbeariaId: b, data: { gte: inicioAnterior, lt: fimAnteriorExcl } } }),
  ]);
  const resumo = somarEntradaSaida(lancamentos);
  const resumoAnterior = somarEntradaSaida(lancamentosAnterior);
  const variacaoFaturamento = variacaoPct(resumo.entrou, resumoAnterior.entrou);
  const variacaoLucro = variacaoPct(resumo.lucro, resumoAnterior.lucro);

  // --- Gastos por categoria (pop-up "Gastos") -----------------------------
  const gastosPorCategoria = new Map();
  for (const l of lancamentos) {
    if (l.tipo !== 'saida') continue;
    const nome = l.categoria ? l.categoria.nome : 'Sem categoria';
    if (!gastosPorCategoria.has(nome)) gastosPorCategoria.set(nome, { nome, valor: 0, itens: [] });
    const g = gastosPorCategoria.get(nome);
    g.valor += l.valor;
    g.itens.push({ label: l.descricao, valor: l.valor });
  }
  const gastosDetail = Array.from(gastosPorCategoria.values())
    .sort((a, b2) => b2.valor - a.valor)
    .map((g, i) => ({
      name: g.nome,
      value: fmtBRLLocal(g.valor),
      pct: resumo.saiu > 0 ? Math.round((g.valor / resumo.saiu) * 100) : 0,
      color: PALETA[i % PALETA.length],
      items: g.itens.sort((a, b2) => b2.valor - a.valor).slice(0, 4).map((it) => ({ label: it.label, value: fmtBRLLocal(it.valor) })),
    }));

  // --- Agendamentos concluídos do período (base pra ticket médio, top
  //     serviços/produtos, desempenho por barbeiro, clientes novos/recorrentes) ---
  const agendamentos = await prisma.agendamento.findMany({
    where: { barbeariaId: b, status: 'concluido', data: { gte: inicio, lt: fimExcl } },
    include: { usuario: true, itens: { include: { servico: true } }, cliente: true },
    orderBy: [{ data: 'desc' }, { horaInicio: 'desc' }],
  });

  const ticketMedio = agendamentos.length > 0 ? Math.round(resumo.entrou / agendamentos.length) : 0;
  const agendamentosAnterior = await prisma.agendamento.count({
    where: { barbeariaId: b, status: 'concluido', data: { gte: inicioAnterior, lt: fimAnteriorExcl } },
  });
  const ticketMedioAnterior = agendamentosAnterior > 0 ? Math.round(resumoAnterior.entrou / agendamentosAnterior) : 0;
  const variacaoTicket = variacaoPct(ticketMedio, ticketMedioAnterior);

  // --- Top serviços / produtos --------------------------------------------
  const porServico = new Map();
  const porProduto = new Map();
  for (const ag of agendamentos) {
    for (const it of ag.itens) {
      const mapa = it.servico.ehProduto ? porProduto : porServico;
      const valor = it.valorUnitario * it.quantidade;
      mapa.set(it.servico.nome, (mapa.get(it.servico.nome) || 0) + valor);
    }
  }
  function ranking(mapa, limite) {
    const lista = Array.from(mapa.entries())
      .sort((a, b2) => b2[1] - a[1])
      .slice(0, limite);
    const max = lista.length ? lista[0][1] : 1;
    return lista.map(([nome, valor], i) => ({ rank: i + 1, name: nome, value: fmtBRLLocal(valor), pct: Math.round((valor / max) * 100) }));
  }
  const topServices = ranking(porServico, 5);
  const topProducts = ranking(porProduto, 5);

  // --- Desempenho por barbeiro ---------------------------------------------
  const porBarbeiro = new Map();
  for (const ag of agendamentos) {
    const nome = ag.usuario.nome;
    porBarbeiro.set(nome, (porBarbeiro.get(nome) || 0) + ag.valorTotal);
  }
  const maxBarbeiro = Math.max(1, ...Array.from(porBarbeiro.values()));
  const barberPerf = Array.from(porBarbeiro.entries())
    .sort((a, b2) => b2[1] - a[1])
    .map(([nome, valor]) => ({
      initials: nome.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase(),
      name: nome,
      revenue: fmtBRLLocal(valor),
      pct: Math.round((valor / maxBarbeiro) * 100),
      avatarBg: 'linear-gradient(135deg,#3A3A40,#111114)',
    }));

  // --- Clientes novos vs recorrentes ----------------------------------------
  // Novo = o 1º agendamento concluído (de todos os tempos) desse cliente caiu
  // dentro do período; recorrente = já tinha atendimento concluído antes.
  const clienteIds = Array.from(new Set(agendamentos.filter((a) => a.clienteId).map((a) => a.clienteId)));
  let clientesNovos = 0;
  let clientesRecorrentes = 0;
  for (const cid of clienteIds) {
    const primeiro = await prisma.agendamento.findFirst({
      where: { barbeariaId: b, clienteId: cid, status: 'concluido' },
      orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
    });
    if (primeiro && primeiro.data >= inicio && primeiro.data < fimExcl) clientesNovos++;
    else clientesRecorrentes++;
  }
  const totalClientesPeriodo = Math.max(1, clientesNovos + clientesRecorrentes);
  const clientesNovosPct = Math.round((clientesNovos / totalClientesPeriodo) * 100);
  const clientesRecorrentesPct = 100 - clientesNovosPct;

  // --- Formas de pagamento (donut) ------------------------------------------
  const FORMAS = [
    { valor: 'pix', label: 'Pix', cor: PALETA[0] },
    { valor: 'credito', label: 'Crédito', cor: PALETA[1] },
    { valor: 'debito', label: 'Débito', cor: PALETA[2] },
    { valor: 'dinheiro', label: 'Dinheiro', cor: PALETA[3] },
  ];
  const totalPago = lancamentos.filter((l) => l.tipo === 'entrada' && l.formaPagamento).reduce((s, l) => s + l.valor, 0);
  let acumulado = 0;
  const formasPagamento = FORMAS.map((f) => {
    const valor = lancamentos.filter((l) => l.tipo === 'entrada' && l.formaPagamento === f.valor).reduce((s, l) => s + l.valor, 0);
    const pct = totalPago > 0 ? Math.round((valor / totalPago) * 100) : 0;
    const de = acumulado;
    acumulado += pct;
    return { ...f, pct, de, ate: acumulado };
  }).filter((f) => f.pct > 0);
  const donutGradiente = formasPagamento.length
    ? 'conic-gradient(' + formasPagamento.map((f) => `${f.cor} ${f.de}% ${f.ate}%`).join(', ') + ')'
    : '#efefef';

  // --- Ocupação por dia da semana × horário (heatmap) -----------------------
  const HORAS_GRID = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  const DIAS_GRID = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const contagem = DIAS_GRID.map(() => HORAS_GRID.map(() => 0));
  const agsOcupacao = await prisma.agendamento.findMany({
    where: { barbeariaId: b, status: { not: 'cancelado' }, data: { gte: inicio, lt: fimExcl } },
    select: { data: true, horaInicio: true },
  });
  for (const ag of agsOcupacao) {
    const diaIdx = (new Date(ag.data).getDay() + 6) % 7; // 0 = segunda
    const hora = Math.floor(paraMinutos(ag.horaInicio) / 60);
    const horaIdx = HORAS_GRID.indexOf(hora);
    if (horaIdx !== -1) contagem[diaIdx][horaIdx]++;
  }
  const maxContagem = Math.max(1, ...contagem.flat());
  function corCelula(n) {
    if (n === 0) return '#EFEFEF';
    const r = n / maxContagem;
    if (r > 0.75) return '#0A0A0A';
    if (r > 0.4) return '#6B7A8F';
    return '#D7DBDC';
  }
  const occupancyGrid = DIAS_GRID.map((dia, di) => ({
    day: dia,
    cells: HORAS_GRID.map((h, hi) => ({ bg: corCelula(contagem[di][hi]), peak: contagem[di][hi] === maxContagem && maxContagem > 0 })),
  }));
  const occupancyHours = HORAS_GRID.map((h) => h + 'h');

  // Frase de horário de pico, calculada de verdade (não fixa) a partir da
  // própria grade acima.
  let horarioPico = null;
  let maiorContagemPico = 0;
  for (let di = 0; di < DIAS_GRID.length; di++) {
    for (let hi = 0; hi < HORAS_GRID.length; hi++) {
      if (contagem[di][hi] > maiorContagemPico) {
        maiorContagemPico = contagem[di][hi];
        horarioPico = { dia: DIAS_GRID[di], hora: HORAS_GRID[hi] };
      }
    }
  }
  const fraseOcupacao = horarioPico
    ? `${horarioPico.dia} às ${horarioPico.hora}h é o horário com mais atendimentos no período (${maiorContagemPico}).`
    : 'Ainda não há atendimentos suficientes neste período pra identificar um horário de pico.';

  // --- Histórico de clientes por horário (lista recente) --------------------
  const slotHistory = agendamentos.slice(0, 8).map((ag) => ({
    time: ag.horaInicio,
    day: fmtDataBR(new Date(ag.data)),
    client: ag.clienteNome,
    service: ag.itens.map((it) => it.servico.nome).join(' + ') || 'Atendimento',
    barber: ag.usuario.nome.split(' ')[0],
    value: fmtBRLLocal(ag.valorTotal),
  }));

  // --- Sparkline do faturamento (bucketiza o período em até 12 pontos) ------
  const NUM_BUCKETS = 10;
  const bucketMs = Math.max(1, duracaoMs / NUM_BUCKETS);
  const buckets = new Array(NUM_BUCKETS).fill(0);
  for (const l of lancamentos) {
    if (l.tipo !== 'entrada') continue;
    const idx = Math.min(NUM_BUCKETS - 1, Math.floor((l.data.getTime() - inicio.getTime()) / bucketMs));
    if (idx >= 0) buckets[idx] += l.valor;
  }
  const maxBucket = Math.max(1, ...buckets);
  const relChartPoints = buckets
    .map((v, i) => {
      const x = Math.round((i / (NUM_BUCKETS - 1)) * 300);
      const y = Math.round(50 - (v / maxBucket) * 46);
      return `${x},${y}`;
    })
    .join(' ');

  function fmtBRLLocal(centavos) {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  res.render('painel/relatorios', {
    titulo: 'Relatórios',
    periodo,
    relPeriodLabel: rotulo,
    deStr: req.query.de || iso(inicio),
    ateStr: req.query.ate || iso(new Date(fimExcl.getTime() - 86400000)),
    relFaturamentoVal: fmtBRLLocal(resumo.entrou),
    variacaoFaturamento,
    relChartPoints,
    gastosVal: fmtBRLLocal(resumo.saiu),
    gastosDetail,
    lucroVal: fmtBRLLocal(resumo.lucro),
    variacaoLucro,
    ticketMedioVal: fmtBRLLocal(ticketMedio),
    variacaoTicket,
    clientesNovos,
    clientesRecorrentes,
    clientesNovosPct,
    clientesRecorrentesPct,
    topServices,
    topProducts,
    barberPerf,
    formasPagamento,
    donutGradiente,
    occupancyHours,
    occupancyGrid,
    fraseOcupacao,
    slotHistory,
  });
}

module.exports = { ver };

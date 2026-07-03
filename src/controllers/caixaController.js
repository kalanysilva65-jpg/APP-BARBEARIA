// Controlador do controle de caixa (entradas/saídas) e suas categorias.
// Acesso exclusivo do admin (garantido pelas rotas com exigeAdmin).
const prisma = require('../config/db');
const caixaServ = require('../services/caixa');

// "40,00" / "40" -> 4000 (centavos). Retorna null se inválido.
function reaisParaCentavos(valorStr) {
  const n = parseFloat(String(valorStr).replace(',', '.'));
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

// Date -> "YYYY-MM"
function isoMes(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Date -> "YYYY-MM-DD"
function isoDia(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "YYYY-MM" -> { inicio, fim } (primeiro dia do mês e primeiro dia do mês seguinte)
function intervaloMes(mesStr) {
  const [ano, mes] = mesStr.split('-').map(Number);
  return { inicio: new Date(ano, mes - 1, 1), fim: new Date(ano, mes, 1) };
}

// Soma entradas/saídas de uma lista de lançamentos.
function somar(lista) {
  let entrou = 0;
  let saiu = 0;
  for (const l of lista) {
    if (l.tipo === 'entrada') entrou += l.valor;
    else saiu += l.valor;
  }
  return { entrou, saiu, saldo: entrou - saiu };
}

// GET /painel/caixa
async function ver(req, res) {
  const b = req.barbeariaId;
  const agora = new Date();
  const mesSel = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : isoMes(agora);
  const { inicio, fim } = intervaloMes(mesSel);

  // Lançamentos do mês selecionado
  const lancamentos = await prisma.caixa.findMany({
    where: { barbeariaId: b, data: { gte: inicio, lt: fim } },
    include: { categoria: true },
    orderBy: [{ data: 'desc' }, { id: 'desc' }],
  });
  const resumoMes = somar(lancamentos);

  // Resumo do dia (hoje)
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const fimHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
  const lancHoje = await prisma.caixa.findMany({ where: { barbeariaId: b, data: { gte: inicioHoje, lt: fimHoje } } });
  const resumoHoje = somar(lancHoje);

  const categorias = await prisma.categoriaCaixa.findMany({
    where: { barbeariaId: b },
    orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
    include: { _count: { select: { lancamentos: true } } },
  });
  const autoLigado = await caixaServ.caixaAutomaticoLigado(b);

  // Ganhos da semana atual (segunda a domingo) — para o gráfico de barras.
  const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const offSeg = (agora.getDay() + 6) % 7; // 0 = segunda
  const seg = new Date(hoje0);
  seg.setDate(hoje0.getDate() - offSeg);
  const rotulos = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const barrasSemana = [];
  for (let i = 0; i < 7; i++) {
    const d0 = new Date(seg);
    d0.setDate(seg.getDate() + i);
    const d1 = new Date(d0);
    d1.setDate(d0.getDate() + 1);
    const soma = await prisma.caixa.aggregate({
      _sum: { valor: true },
      where: { barbeariaId: b, tipo: 'entrada', data: { gte: d0, lt: d1 } },
    });
    barrasSemana.push({ rotulo: rotulos[i], valor: soma._sum.valor || 0, hoje: d0.getTime() === hoje0.getTime() });
  }
  const maxBarraSemana = Math.max(1, ...barrasSemana.map((x) => x.valor));
  const totalSemana = barrasSemana.reduce((s, x) => s + x.valor, 0);

  // Navegação de meses
  const [ay, am] = mesSel.split('-').map(Number);

  res.render('painel/caixa', {
    titulo: 'Caixa',
    lancamentos,
    resumoMes,
    resumoHoje,
    categorias,
    autoLigado,
    barrasSemana,
    maxBarraSemana,
    totalSemana,
    mesSel,
    mesAnterior: isoMes(new Date(ay, am - 2, 1)),
    mesProximo: isoMes(new Date(ay, am, 1)),
    hojeIso: isoDia(agora),
  });
}

// POST /painel/caixa — registra um lançamento manual
async function criar(req, res) {
  const b = req.barbeariaId;
  const descricao = (req.body.descricao || '').trim();
  const valor = reaisParaCentavos(req.body.valor);
  const categoriaId = req.body.categoriaId ? Number(req.body.categoriaId) : null;

  const categoria = categoriaId
    ? await prisma.categoriaCaixa.findFirst({ where: { id: categoriaId, barbeariaId: b } })
    : null;

  // O tipo (entrada/saída) vem da categoria.
  if (!categoria || valor === null) {
    req.session.flash = { tipo: 'erro', texto: 'Selecione uma categoria e informe um valor válido.' };
    return res.redirect('/painel/caixa');
  }

  // Data: meio-dia local evita "pular" de dia por causa de fuso.
  const data = req.body.data ? new Date(req.body.data + 'T12:00:00') : new Date();

  await prisma.caixa.create({
    data: {
      barbeariaId: b,
      descricao: descricao || categoria.nome,
      valor,
      tipo: categoria.tipo,
      data,
      categoriaId: categoria.id,
    },
  });
  req.session.flash = { tipo: 'sucesso', texto: 'Lançamento registrado.' };
  res.redirect('/painel/caixa?mes=' + isoMes(data));
}

// POST /painel/caixa/:id/remover
async function remover(req, res) {
  const l = await prisma.caixa.findFirst({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId } });
  if (l) await prisma.caixa.delete({ where: { id: l.id } }).catch(() => {});
  req.session.flash = { tipo: 'sucesso', texto: 'Lançamento removido.' };
  res.redirect('/painel/caixa' + (l ? '?mes=' + isoMes(new Date(l.data)) : ''));
}

// POST /painel/caixa/config — liga/desliga a entrada automática
async function alternarAutomatico(req, res) {
  const ligar = req.body.ligado === 'true';
  await caixaServ.definirCaixaAutomatico(req.barbeariaId, ligar);
  req.session.flash = {
    tipo: 'sucesso',
    texto: ligar ? 'Entrada automática ligada.' : 'Entrada automática desligada.',
  };
  res.redirect('/painel/caixa');
}

// --- Categorias de caixa --------------------------------------------------
async function criarCategoria(req, res) {
  const nome = (req.body.nome || '').trim();
  const tipo = req.body.tipo === 'saida' ? 'saida' : 'entrada';
  if (nome) await prisma.categoriaCaixa.create({ data: { barbeariaId: req.barbeariaId, nome, tipo } });
  res.redirect('/painel/caixa');
}

async function atualizarCategoria(req, res) {
  const nome = (req.body.nome || '').trim();
  const tipo = req.body.tipo === 'saida' ? 'saida' : 'entrada';
  const data = { tipo };
  if (nome) data.nome = nome;
  await prisma.categoriaCaixa
    .updateMany({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId }, data })
    .catch(() => {});
  res.redirect('/painel/caixa');
}

async function removerCategoria(req, res) {
  // Lançamentos da categoria não são apagados: ficam "sem categoria" (SetNull).
  await prisma.categoriaCaixa
    .deleteMany({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId } })
    .catch(() => {});
  res.redirect('/painel/caixa');
}

module.exports = {
  ver,
  criar,
  remover,
  alternarAutomatico,
  criarCategoria,
  atualizarCategoria,
  removerCategoria,
};

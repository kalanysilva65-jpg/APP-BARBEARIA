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

  // Ganhos por semana DENTRO do mês selecionado — para o gráfico de barras.
  // Acompanha o mês escolhido no filtro (não fica travado no mês atual).
  const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const barrasMes = [];
  let cursor = new Date(inicio);
  while (cursor < fim) {
    const fimSemana = new Date(cursor);
    fimSemana.setDate(cursor.getDate() + 7);
    const bucketFim = fimSemana > fim ? fim : fimSemana;
    const valor = lancamentos
      .filter((l) => l.tipo === 'entrada' && l.data >= cursor && l.data < bucketFim)
      .reduce((s, l) => s + l.valor, 0);
    barrasMes.push({
      rotulo: String(cursor.getDate()).padStart(2, '0'),
      valor,
      hoje: hoje0 >= cursor && hoje0 < bucketFim,
    });
    cursor = bucketFim;
  }
  const maxBarraMes = Math.max(1, ...barrasMes.map((x) => x.valor));

  // Navegação de meses
  const [ay, am] = mesSel.split('-').map(Number);
  const nomesMes = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  const nomeMesSel = `${nomesMes[am - 1]} de ${ay}`;
  const ehMesAtual = mesSel === isoMes(agora);

  res.render('painel/caixa', {
    titulo: 'Caixa',
    lancamentos,
    resumoMes,
    resumoHoje,
    categorias,
    autoLigado,
    barrasMes,
    maxBarraMes,
    nomeMesSel,
    ehMesAtual,
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

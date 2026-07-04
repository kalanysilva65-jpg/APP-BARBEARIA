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

// Date -> "YYYY-MM-DD"
function isoDia(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "YYYY-MM-DD" -> Date à meia-noite local
function dataLocal(s) {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function fmtDataBR(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Período padrão = mês atual (primeiro ao último dia)
function periodoMesAtual() {
  const hoje = new Date();
  return {
    inicio: isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    fim: isoDia(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
  };
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

  const padrao = periodoMesAtual();
  let inicioStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.inicio || '') ? req.query.inicio : padrao.inicio;
  let fimStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.fim || '') ? req.query.fim : padrao.fim;
  if (inicioStr > fimStr) {
    const t = inicioStr;
    inicioStr = fimStr;
    fimStr = t;
  }

  const inicio = dataLocal(inicioStr);
  const fimExcl = dataLocal(fimStr);
  fimExcl.setDate(fimExcl.getDate() + 1); // limite superior exclusivo (inclui o dia "fim")

  // Lançamentos do período selecionado
  const lancamentos = await prisma.caixa.findMany({
    where: { barbeariaId: b, data: { gte: inicio, lt: fimExcl } },
    include: { categoria: true },
    orderBy: [{ data: 'desc' }, { id: 'desc' }],
  });
  const resumoPeriodo = somar(lancamentos);

  // Resumo do dia (hoje) — só faz sentido mostrar se "hoje" está dentro do período visto.
  const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const amanha0 = new Date(hoje0);
  amanha0.setDate(hoje0.getDate() + 1);
  const lancHoje = await prisma.caixa.findMany({ where: { barbeariaId: b, data: { gte: hoje0, lt: amanha0 } } });
  const resumoHoje = somar(lancHoje);
  const incluiHoje = hoje0 >= inicio && hoje0 < fimExcl;

  // Saldo do mês corrente (fixo — independe do período filtrado acima).
  const mesAtualStr = periodoMesAtual();
  const inicioMesAtual = dataLocal(mesAtualStr.inicio);
  const fimMesAtualExcl = dataLocal(mesAtualStr.fim);
  fimMesAtualExcl.setDate(fimMesAtualExcl.getDate() + 1);
  const lancMesAtual = await prisma.caixa.findMany({
    where: { barbeariaId: b, data: { gte: inicioMesAtual, lt: fimMesAtualExcl } },
  });
  const resumoMesAtual = somar(lancMesAtual);

  const categorias = await prisma.categoriaCaixa.findMany({
    where: { barbeariaId: b },
    orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
    include: { _count: { select: { lancamentos: true } } },
  });
  const autoLigado = await caixaServ.caixaAutomaticoLigado(b);

  // Ganhos por semana DENTRO do período selecionado — para o gráfico de barras.
  const barrasPeriodo = [];
  let cursor = new Date(inicio);
  while (cursor < fimExcl) {
    const fimSemana = new Date(cursor);
    fimSemana.setDate(cursor.getDate() + 7);
    const bucketFim = fimSemana > fimExcl ? fimExcl : fimSemana;
    const valor = lancamentos
      .filter((l) => l.tipo === 'entrada' && l.data >= cursor && l.data < bucketFim)
      .reduce((s, l) => s + l.valor, 0);
    barrasPeriodo.push({
      rotulo: String(cursor.getDate()).padStart(2, '0') + '/' + String(cursor.getMonth() + 1).padStart(2, '0'),
      valor,
      hoje: hoje0 >= cursor && hoje0 < bucketFim,
    });
    cursor = bucketFim;
  }
  const maxBarraPeriodo = Math.max(1, ...barrasPeriodo.map((x) => x.valor));

  const nomePeriodoSel = inicioStr === fimStr ? fmtDataBR(inicio) : `${fmtDataBR(inicio)} – ${fmtDataBR(new Date(fimExcl.getTime() - 86400000))}`;

  // Atalhos de período
  const offSegunda = (agora.getDay() + 6) % 7; // 0 = segunda
  const seg = new Date(hoje0);
  seg.setDate(hoje0.getDate() - offSegunda);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  const presetHoje = { inicio: isoDia(hoje0), fim: isoDia(hoje0) };
  const presetSemana = { inicio: isoDia(seg), fim: isoDia(dom) };

  // Qual pill de atalho está ativa (pra destacar visualmente) — 'custom' se o
  // período não bater com nenhum atalho (ex.: De/Até escolhido manualmente).
  let periodoAtivo = 'custom';
  if (inicioStr === presetHoje.inicio && fimStr === presetHoje.fim) periodoAtivo = 'hoje';
  else if (inicioStr === presetSemana.inicio && fimStr === presetSemana.fim) periodoAtivo = 'semana';
  else if (inicioStr === padrao.inicio && fimStr === padrao.fim) periodoAtivo = 'mes';

  res.render('painel/caixa', {
    titulo: 'Financeiro',
    lancamentos,
    resumoPeriodo,
    resumoHoje,
    resumoMesAtual,
    incluiHoje,
    categorias,
    autoLigado,
    barrasPeriodo,
    maxBarraPeriodo,
    nomePeriodoSel,
    periodoAtivo,
    inicioStr,
    fimStr,
    hojeIso: isoDia(agora),
    presetHoje,
    presetSemana,
    presetMes: padrao,
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

  const qs = new URLSearchParams();
  if (req.body.inicio) qs.set('inicio', req.body.inicio);
  if (req.body.fim) qs.set('fim', req.body.fim);
  const destino = '/painel/caixa' + (qs.toString() ? '?' + qs.toString() : '');

  // O tipo (entrada/saída) vem da categoria.
  if (!categoria || valor === null) {
    req.session.flash = { tipo: 'erro', texto: 'Selecione uma categoria e informe um valor válido.' };
    return res.redirect(destino);
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
  res.redirect(destino);
}

// POST /painel/caixa/:id/remover
async function remover(req, res) {
  const l = await prisma.caixa.findFirst({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId } });
  if (l) await prisma.caixa.delete({ where: { id: l.id } }).catch(() => {});
  req.session.flash = { tipo: 'sucesso', texto: 'Lançamento removido.' };

  const qs = new URLSearchParams();
  if (req.body.inicio) qs.set('inicio', req.body.inicio);
  if (req.body.fim) qs.set('fim', req.body.fim);
  res.redirect('/painel/caixa' + (qs.toString() ? '?' + qs.toString() : ''));
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

// Controlador do painel de comissões por barbeiro (somente admin).
// Serviços: comissão pela % de cada barbeiro. Produtos: comissão fixa (COMISSAO_PRODUTO_PERCENTUAL).
// Relatório sobre dados existentes, usando o valorUnitario congelado e só
// agendamentos CONCLUÍDOS no período.
const prisma = require('../config/db');
const { COMISSAO_PRODUTO_PERCENTUAL } = require('../config/constantes');

// Date -> "YYYY-MM-DD"
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "YYYY-MM-DD" -> Date à meia-noite local
function dataLocal(s) {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
}

// Período padrão = mês atual (primeiro ao último dia)
function periodoMesAtual() {
  const hoje = new Date();
  return {
    inicio: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    fim: iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
  };
}

// GET /painel/comissoes
async function ver(req, res) {
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

  const barbeiros = await prisma.usuario.findMany({ where: { ativo: true }, orderBy: { id: 'asc' } });

  const agendamentos = await prisma.agendamento.findMany({
    where: { status: 'concluido', data: { gte: inicio, lt: fimExcl } },
    include: { usuario: true, itens: { include: { servico: true } } },
    orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
  });

  // Agrupa por barbeiro, separando serviços de produtos
  const mapa = new Map();
  for (const b of barbeiros) {
    mapa.set(b.id, { barbeiro: b, atendimentos: [], servicosTotal: 0, produtosTotal: 0, qtd: 0 });
  }

  for (const ag of agendamentos) {
    const grupo = mapa.get(ag.usuarioId);
    if (!grupo) continue; // agendamento de barbeiro inativo: fora do relatório

    let servicosSub = 0;
    let produtosSub = 0;
    const itens = ag.itens.map((it) => {
      const produto = it.servico.ehProduto;
      const valor = it.valorUnitario * it.quantidade;
      if (produto) produtosSub += valor;
      else servicosSub += valor;
      return { nome: it.servico.nome, quantidade: it.quantidade, valor, ehProduto: produto };
    });

    grupo.atendimentos.push({ ag, itens, servicosSub, produtosSub });
    grupo.servicosTotal += servicosSub;
    grupo.produtosTotal += produtosSub;
    grupo.qtd += 1;
  }

  // Comissão = serviços × (% do barbeiro) + produtos × (% fixo de produto)
  const todosGrupos = Array.from(mapa.values()).map((g) => {
    const pct = g.barbeiro.comissaoPercentual ?? 50;
    const comissaoServicos = Math.round(g.servicosTotal * (pct / 100));
    const comissaoProdutos = Math.round(g.produtosTotal * (COMISSAO_PRODUTO_PERCENTUAL / 100));
    return { ...g, comissaoServicos, comissaoProdutos, comissao: comissaoServicos + comissaoProdutos };
  });

  // Filtro de barbeiro: 'todos' (padrão) ou um id específico.
  const barbeiroSelecionado =
    req.query.barbeiro && /^\d+$/.test(req.query.barbeiro) ? req.query.barbeiro : 'todos';

  const grupos =
    barbeiroSelecionado === 'todos'
      ? todosGrupos
      : todosGrupos.filter((g) => String(g.barbeiro.id) === barbeiroSelecionado);

  // Totais refletem a seleção
  const totalServicos = grupos.reduce((s, g) => s + g.servicosTotal, 0);
  const totalProdutos = grupos.reduce((s, g) => s + g.produtosTotal, 0);
  const totalGeralComissao = grupos.reduce((s, g) => s + g.comissao, 0);

  // Atalhos de período
  const hoje = new Date();
  const offSegunda = (hoje.getDay() + 6) % 7; // 0 = segunda
  const seg = new Date(hoje);
  seg.setDate(hoje.getDate() - offSegunda);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);

  res.render('painel/comissoes', {
    titulo: 'Comissões',
    grupos,
    barbeiros,
    barbeiroSelecionado,
    inicioStr,
    fimStr,
    totalServicos,
    totalProdutos,
    totalGeralComissao,
    comissaoProdutoPct: COMISSAO_PRODUTO_PERCENTUAL,
    presetHoje: { inicio: iso(hoje), fim: iso(hoje) },
    presetSemana: { inicio: iso(seg), fim: iso(dom) },
    presetMes: periodoMesAtual(),
  });
}

// POST /painel/comissoes/percentual/:id — ajusta a % de comissão (serviços) de um barbeiro
async function salvarPercentual(req, res) {
  const id = Number(req.params.id);
  let p = parseFloat(String(req.body.percentual || '').replace(',', '.'));
  if (isNaN(p)) p = 0;
  p = Math.min(100, Math.max(0, p)); // limita entre 0 e 100
  await prisma.usuario.update({ where: { id }, data: { comissaoPercentual: p } }).catch(() => {});

  // Redireciona preservando o período e o filtro de barbeiro
  const qs = new URLSearchParams();
  if (req.body.inicio) qs.set('inicio', req.body.inicio);
  if (req.body.fim) qs.set('fim', req.body.fim);
  if (req.body.barbeiro) qs.set('barbeiro', req.body.barbeiro);
  const s = qs.toString();
  res.redirect('/painel/comissoes' + (s ? '?' + s : ''));
}

module.exports = { ver, salvarPercentual };

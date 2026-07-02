// Controlador do painel de comissões por barbeiro (somente admin).
// Serviços: comissão pela % de cada barbeiro. Produtos: comissão fixa (COMISSAO_PRODUTO_PERCENTUAL).
// Relatório sobre dados existentes, usando o valorUnitario congelado e só
// agendamentos CONCLUÍDOS no período.
const prisma = require('../config/db');
const { COMISSAO_PRODUTO_PERCENTUAL } = require('../config/constantes');
const { paraMinutos } = require('../services/disponibilidade');

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

  const b = req.barbeariaId;
  const barbeiros = await prisma.usuario.findMany({ where: { barbeariaId: b, ativo: true }, orderBy: { id: 'asc' } });

  const agendamentos = await prisma.agendamento.findMany({
    where: { barbeariaId: b, status: 'concluido', data: { gte: inicio, lt: fimExcl } },
    include: {
      usuario: true,
      itens: { include: { servico: true } },
      clientePlano: { include: { plano: true } },
    },
    orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
  });

  // Agrupa por barbeiro, separando serviços de produtos
  const mapa = new Map();
  for (const b of barbeiros) {
    mapa.set(b.id, { barbeiro: b, atendimentos: [], servicosTotal: 0, produtosTotal: 0, comissaoProdutosTotal: 0, ocupadoMin: 0, qtd: 0 });
  }

  // O valor do plano conta UMA ÚNICA VEZ por assinatura (não por atendimento).
  const planosCreditados = new Set();
  for (const ag of agendamentos) {
    const grupo = mapa.get(ag.usuarioId);
    if (!grupo) continue; // agendamento de barbeiro inativo: fora do relatório

    let servicosSub = 0;
    let produtosSub = 0;
    let duracaoApt = 0;
    const viaPlano = !!ag.clientePlanoId;

    // Itens (para exibição) e tempo ocupado.
    const itens = ag.itens.map((it) => {
      duracaoApt += (it.servico.duracaoMin || 0) * it.quantidade;
      return {
        nome: it.servico.nome,
        quantidade: it.quantidade,
        valor: it.valorUnitario * it.quantidade,
        ehProduto: it.servico.ehProduto,
      };
    });

    if (viaPlano && ag.clientePlano && ag.clientePlano.plano) {
      // Cliente paga R$ 0. A comissão usa o VALOR DO PLANO, contado uma única vez
      // por assinatura no período (no 1º atendimento concluído); os demais usos contam 0.
      if (!planosCreditados.has(ag.clientePlanoId)) {
        servicosSub = ag.clientePlano.plano.valor;
        planosCreditados.add(ag.clientePlanoId);
      }
    } else {
      let comissaoProdutosSub = 0;
      for (const it of ag.itens) {
        const valor = it.valorUnitario * it.quantidade;
        if (it.servico.ehProduto) {
          produtosSub += valor;
          comissaoProdutosSub += Math.round(valor * ((it.servico.comissaoPercentual ?? 10) / 100));
        } else servicosSub += valor;
      }
      grupo.comissaoProdutosTotal += comissaoProdutosSub;
    }

    grupo.atendimentos.push({ ag, itens, servicosSub, produtosSub, viaPlano });
    grupo.servicosTotal += servicosSub;
    grupo.produtosTotal += produtosSub;
    grupo.ocupadoMin += duracaoApt;
    grupo.qtd += 1;
  }

  // --- Disponibilidade (minutos de jornada) por barbeiro no período --------
  // Soma a jornada dos dias trabalhados, desconta os bloqueios e NÃO conta dias
  // futuros (limita ao começo de amanhã), para a ocupação fazer sentido "até hoje".
  const jornadas = await prisma.horarioTrabalho.findMany({ where: { barbeariaId: b } });
  const bloqueios = await prisma.bloqueio.findMany({ where: { barbeariaId: b, data: { gte: inicio, lt: fimExcl } } });

  const amanha = new Date();
  amanha.setHours(0, 0, 0, 0);
  amanha.setDate(amanha.getDate() + 1);
  const limite = new Date(Math.min(fimExcl.getTime(), amanha.getTime()));

  const dispMin = new Map();
  for (const b of barbeiros) dispMin.set(b.id, 0);

  for (let d = new Date(inicio); d < limite; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    for (const b of barbeiros) {
      const j = jornadas.find((x) => x.usuarioId === b.id && x.diaSemana === dow);
      if (j && j.trabalha) {
        dispMin.set(b.id, dispMin.get(b.id) + Math.max(0, paraMinutos(j.horaFim) - paraMinutos(j.horaInicio)));
      }
    }
  }
  for (const bl of bloqueios) {
    if (bl.data < limite && dispMin.has(bl.usuarioId)) {
      const m = Math.max(0, paraMinutos(bl.horaFim) - paraMinutos(bl.horaInicio));
      dispMin.set(bl.usuarioId, Math.max(0, dispMin.get(bl.usuarioId) - m));
    }
  }

  // Comissão = serviços × (% do barbeiro) + produtos × (% fixo de produto)
  const todosGrupos = Array.from(mapa.values()).map((g) => {
    const pct = g.barbeiro.comissaoPercentual ?? 50;
    const comissaoServicos = Math.round(g.servicosTotal * (pct / 100));
    const comissaoProdutos = g.comissaoProdutosTotal;
    const faturadoTotal = g.servicosTotal + g.produtosTotal;
    // Ticket médio = faturado total ÷ atendimentos concluídos no período.
    const ticketMedio = g.qtd > 0 ? Math.round(faturadoTotal / g.qtd) : 0;
    // Ocupação = tempo ocupado ÷ jornada disponível (null se não há jornada no período).
    const disponivelMin = dispMin.get(g.barbeiro.id) || 0;
    const ocupacaoPct = disponivelMin > 0 ? Math.round((g.ocupadoMin / disponivelMin) * 100) : null;
    return {
      ...g,
      comissaoServicos,
      comissaoProdutos,
      comissao: comissaoServicos + comissaoProdutos,
      faturadoTotal,
      ticketMedio,
      ocupacaoPct,
    };
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
  await prisma.usuario
    .updateMany({ where: { id, barbeariaId: req.barbeariaId }, data: { comissaoPercentual: p } })
    .catch(() => {});

  // Redireciona preservando o período e o filtro de barbeiro
  const qs = new URLSearchParams();
  if (req.body.inicio) qs.set('inicio', req.body.inicio);
  if (req.body.fim) qs.set('fim', req.body.fim);
  if (req.body.barbeiro) qs.set('barbeiro', req.body.barbeiro);
  const s = qs.toString();
  res.redirect('/painel/comissoes' + (s ? '?' + s : ''));
}

module.exports = { ver, salvarPercentual };

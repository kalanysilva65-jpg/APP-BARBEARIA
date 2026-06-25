// Controlador do painel de comissões por barbeiro (somente admin).
// Relatório sobre dados existentes: soma os itens de SERVIÇO (não produtos) dos
// agendamentos CONCLUÍDOS no período, usando o valorUnitario congelado de cada item.
// Comissão = 50% do total de serviços de cada barbeiro.
const prisma = require('../config/db');

// Convenção do catálogo: item com duração > 0 é serviço; duração 0 é produto.
function ehServico(servico) {
  return servico.duracaoMin > 0;
}

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

  // Agrupa por barbeiro
  const mapa = new Map();
  for (const b of barbeiros) {
    mapa.set(b.id, { barbeiro: b, atendimentos: [], totalServicos: 0, qtd: 0 });
  }

  for (const ag of agendamentos) {
    const grupo = mapa.get(ag.usuarioId);
    if (!grupo) continue; // agendamento de barbeiro inativo: fora do relatório

    let subtotal = 0;
    const itens = ag.itens.map((it) => {
      const servico = ehServico(it.servico);
      const valor = it.valorUnitario * it.quantidade;
      if (servico) subtotal += valor; // só serviços entram na comissão
      return { nome: it.servico.nome, quantidade: it.quantidade, valor, ehServico: servico };
    });

    grupo.atendimentos.push({ ag, itens, subtotal });
    grupo.totalServicos += subtotal;
    grupo.qtd += 1;
  }

  const todosGrupos = Array.from(mapa.values()).map((g) => ({
    ...g,
    comissao: Math.round(g.totalServicos * 0.5),
  }));

  // Filtro de barbeiro: 'todos' (padrão) ou um id específico.
  const barbeiroSelecionado =
    req.query.barbeiro && /^\d+$/.test(req.query.barbeiro) ? req.query.barbeiro : 'todos';

  const grupos =
    barbeiroSelecionado === 'todos'
      ? todosGrupos
      : todosGrupos.filter((g) => String(g.barbeiro.id) === barbeiroSelecionado);

  // Totais refletem a seleção (um barbeiro ou todos).
  const totalGeralServicos = grupos.reduce((s, g) => s + g.totalServicos, 0);
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
    totalGeralServicos,
    totalGeralComissao,
    presetHoje: { inicio: iso(hoje), fim: iso(hoje) },
    presetSemana: { inicio: iso(seg), fim: iso(dom) },
    presetMes: periodoMesAtual(),
  });
}

module.exports = { ver };

// Controlador da tela de Fidelidade (só admin): cupons de desconto e o
// ranking de selos acumulados por cliente. O HTML original só mostrava o
// botão de "+1 selo" (sem forma de resgatar o que foi acumulado) — aqui
// entra também "Resgatar", que zera o contador e alimenta o "Resgates/mês"
// (sem essa ação o contador não teria de onde vir de verdade).
const prisma = require('../config/db');

function iniciais(nome) {
  return nome.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

// GET /painel/fidelidade
async function ver(req, res) {
  const b = req.barbeariaId;
  const hoje = new Date();
  const hoje0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimMesExcl = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);

  const [clientesFieisCount, cupons, resgatesMes, ranking] = await Promise.all([
    prisma.cliente.count({ where: { barbeariaId: b, selosFidelidade: { gt: 0 } } }),
    prisma.cupom.findMany({ where: { barbeariaId: b }, orderBy: [{ ativo: 'desc' }, { validade: 'asc' }] }),
    prisma.fidelidadeResgate.count({ where: { barbeariaId: b, data: { gte: inicioMes, lt: fimMesExcl } } }),
    prisma.cliente.findMany({
      where: { barbeariaId: b, selosFidelidade: { gt: 0 } },
      orderBy: { selosFidelidade: 'desc' },
      take: 10,
    }),
  ]);

  const cuponsAtivosCount = cupons.filter((c) => c.ativo && c.validade >= hoje0).length;

  res.render('painel/fidelidade', {
    titulo: 'Fidelidade',
    fidClientesFieisCount: clientesFieisCount,
    fidCuponsAtivosCount: cuponsAtivosCount,
    fidResgatesMes: resgatesMes,
    cupons,
    hojeIso: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`,
    fidRanking: ranking.map((c, i) => ({
      rank: i + 1,
      id: c.id,
      name: c.nome,
      initials: iniciais(c.nome),
      loyalty: c.selosFidelidade,
    })),
  });
}

// POST /painel/fidelidade/cupons — cria um cupom
async function criarCupom(req, res) {
  const b = req.barbeariaId;
  const nome = (req.body.nome || '').trim();
  const descricao = (req.body.descricao || '').trim() || null;
  const desconto = (req.body.desconto || '').trim();
  const validade = req.body.validade ? new Date(req.body.validade + 'T12:00:00') : null;

  if (!nome || !desconto || !validade) {
    req.session.flash = { tipo: 'erro', texto: 'Informe nome, desconto e validade do cupom.' };
    return res.redirect('/painel/fidelidade');
  }

  await prisma.cupom.create({ data: { barbeariaId: b, nome, descricao, desconto, validade } });
  req.session.flash = { tipo: 'sucesso', texto: 'Cupom criado.' };
  res.redirect('/painel/fidelidade');
}

// POST /painel/fidelidade/cupons/:id/remover
async function removerCupom(req, res) {
  await prisma.cupom.deleteMany({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId } });
  req.session.flash = { tipo: 'sucesso', texto: 'Cupom removido.' };
  res.redirect('/painel/fidelidade');
}

// POST /painel/fidelidade/clientes/:id/selo — soma 1 selo
async function adicionarSelo(req, res) {
  const cliente = await prisma.cliente.findFirst({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId } });
  if (cliente) await prisma.cliente.update({ where: { id: cliente.id }, data: { selosFidelidade: cliente.selosFidelidade + 1 } });
  res.redirect('/painel/fidelidade');
}

// POST /painel/fidelidade/clientes/:id/resgatar — zera os selos e registra o resgate
async function resgatar(req, res) {
  const b = req.barbeariaId;
  const cliente = await prisma.cliente.findFirst({ where: { id: Number(req.params.id), barbeariaId: b } });
  if (cliente && cliente.selosFidelidade > 0) {
    await prisma.$transaction([
      prisma.fidelidadeResgate.create({ data: { barbeariaId: b, clienteId: cliente.id, selosUsados: cliente.selosFidelidade } }),
      prisma.cliente.update({ where: { id: cliente.id }, data: { selosFidelidade: 0 } }),
    ]);
    req.session.flash = { tipo: 'sucesso', texto: `Resgate registrado para ${cliente.nome}.` };
  }
  res.redirect('/painel/fidelidade');
}

module.exports = { ver, criarCupom, removerCupom, adicionarSelo, resgatar };

// Controlador dos modelos de plano.
// Visualização para todos os usuários logados; criação/edição só para o admin
// (garantido pelas rotas com exigeAdmin).
const prisma = require('../config/db');

// "120,00" / "120" -> 12000 (centavos). Vazio/inválido -> 0.
function reaisParaCentavos(valorStr) {
  const n = parseFloat(String(valorStr).replace(',', '.'));
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

// "0,2,3" (vindo do seletor de dias) -> "0,2,3" validado; vazio/inválido -> todos os dias.
function lerDiasSemana(diasStr) {
  const dias = String(diasStr || '')
    .split(',')
    .map((d) => parseInt(d, 10))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const unicos = Array.from(new Set(dias)).sort();
  return unicos.length ? unicos.join(',') : '0,1,2,3,4,5,6';
}

// Normaliza os campos do formulário num objeto pronto para o banco.
function lerForm(body) {
  const nome = (body.nome || '').trim();
  const tipo = body.tipo === 'ilimitado' ? 'ilimitado' : 'limitado';
  const usos = tipo === 'limitado' ? Math.max(1, parseInt(body.usos, 10) || 1) : null;
  const validadeDias = Math.max(1, parseInt(body.validadeDias, 10) || 30);
  const valor = reaisParaCentavos(body.valor);
  const servicoId = body.servicoId ? Number(body.servicoId) : null; // null = qualquer serviço
  const diasSemana = lerDiasSemana(body.diasSemana);
  return { nome, tipo, usos, validadeDias, valor, servicoId, diasSemana };
}

// Serviços ativos (da barbearia) para o select do formulário.
function listarServicos(barbeariaId) {
  return prisma.servico.findMany({ where: { barbeariaId, ativo: true }, orderBy: { nome: 'asc' } });
}

// GET /painel/planos
async function listar(req, res) {
  const planos = await prisma.plano.findMany({
    where: { barbeariaId: req.barbeariaId },
    include: { servico: true },
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
  });

  // Assinaturas VIGENTES (ativas e dentro da validade) — são elas que dizem
  // quantos assinantes cada plano tem e quanto de receita recorrente a
  // barbearia tem por mês, os dois números que o design Turno 6 põe no topo
  // da tela (pedido do dono, 2026-07-28).
  const vigentes = await prisma.clientePlano.findMany({
    where: { barbeariaId: req.barbeariaId, ativo: true, dataFim: { gte: new Date() } },
    select: { planoId: true },
  });
  const porPlano = new Map();
  vigentes.forEach((a) => porPlano.set(a.planoId, (porPlano.get(a.planoId) || 0) + 1));
  planos.forEach((p) => {
    p.assinantes = porPlano.get(p.id) || 0;
    p.mrr = p.assinantes * p.valor;
  });

  const mrr = planos.reduce((soma, p) => soma + p.mrr, 0);
  const lider = planos.reduce((maior, p) => (!maior || p.assinantes > maior.assinantes ? p : maior), null);
  const resumo = {
    mrr,
    assinantes: vigentes.length,
    ticket: vigentes.length ? Math.round(mrr / vigentes.length) : 0,
    // Só faz sentido falar em "líder" se alguém tiver assinante.
    lider: lider && lider.assinantes > 0 ? lider : null,
  };

  res.render('painel/planos', {
    titulo: 'Planos',
    planos,
    resumo,
    servicos: await listarServicos(req.barbeariaId),
  });
}

// GET /painel/planos/novo
async function formNovo(req, res) {
  res.render('painel/plano-form', { titulo: 'Novo plano', plano: null, servicos: await listarServicos(req.barbeariaId) });
}

// POST /painel/planos
async function criar(req, res) {
  const dados = lerForm(req.body);
  if (!dados.nome) {
    req.session.flash = { tipo: 'erro', texto: 'Informe o nome do plano.' };
    return res.redirect('/painel/planos/novo');
  }
  await prisma.plano.create({ data: { ...dados, barbeariaId: req.barbeariaId } });
  req.session.flash = { tipo: 'sucesso', texto: 'Plano criado.' };
  res.redirect('/painel/planos');
}

// GET /painel/planos/:id/editar
async function formEditar(req, res) {
  const plano = await prisma.plano.findFirst({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId } });
  if (!plano) return res.redirect('/painel/planos');
  res.render('painel/plano-form', { titulo: 'Editar plano', plano, servicos: await listarServicos(req.barbeariaId) });
}

// POST /painel/planos/:id
async function atualizar(req, res) {
  const id = Number(req.params.id);
  const plano = await prisma.plano.findFirst({ where: { id, barbeariaId: req.barbeariaId } });
  if (!plano) return res.redirect('/painel/planos');

  const dados = lerForm(req.body);
  if (!dados.nome) {
    req.session.flash = { tipo: 'erro', texto: 'Informe o nome do plano.' };
    return res.redirect('/painel/planos/' + id + '/editar');
  }
  await prisma.plano.update({ where: { id }, data: dados });
  req.session.flash = { tipo: 'sucesso', texto: 'Plano atualizado.' };
  res.redirect('/painel/planos');
}

// POST /painel/planos/:id/toggle
async function alternarAtivo(req, res) {
  const id = Number(req.params.id);
  const p = await prisma.plano.findFirst({ where: { id, barbeariaId: req.barbeariaId } });
  if (p) await prisma.plano.update({ where: { id }, data: { ativo: !p.ativo } });
  res.redirect('/painel/planos');
}

// POST /painel/planos/:id/remover — exclui (ou desativa se já tiver assinaturas)
async function remover(req, res) {
  const id = Number(req.params.id);
  const alvo = await prisma.plano.findFirst({ where: { id, barbeariaId: req.barbeariaId } });
  if (!alvo) return res.redirect('/painel/planos');
  try {
    await prisma.plano.delete({ where: { id } });
    req.session.flash = { tipo: 'sucesso', texto: 'Plano excluído.' };
  } catch (e) {
    await prisma.plano.update({ where: { id }, data: { ativo: false } }).catch(() => {});
    req.session.flash = {
      tipo: 'aviso',
      texto: 'Esse plano já tem clientes vinculados, então foi desativado em vez de excluído.',
    };
  }
  res.redirect('/painel/planos');
}

module.exports = { listar, formNovo, criar, formEditar, atualizar, alternarAtivo, remover };

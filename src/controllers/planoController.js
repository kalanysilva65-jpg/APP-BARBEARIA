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

// Normaliza os campos do formulário num objeto pronto para o banco.
function lerForm(body) {
  const nome = (body.nome || '').trim();
  const tipo = body.tipo === 'ilimitado' ? 'ilimitado' : 'limitado';
  const usos = tipo === 'limitado' ? Math.max(1, parseInt(body.usos, 10) || 1) : null;
  const validadeDias = Math.max(1, parseInt(body.validadeDias, 10) || 30);
  const valor = reaisParaCentavos(body.valor);
  const servicoId = body.servicoId ? Number(body.servicoId) : null; // null = qualquer serviço
  return { nome, tipo, usos, validadeDias, valor, servicoId };
}

// Serviços ativos para o select do formulário.
function listarServicos() {
  return prisma.servico.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } });
}

// GET /painel/planos
async function listar(req, res) {
  const planos = await prisma.plano.findMany({
    include: { servico: true },
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
  });
  res.render('painel/planos', { titulo: 'Planos', planos });
}

// GET /painel/planos/novo
async function formNovo(req, res) {
  res.render('painel/plano-form', { titulo: 'Novo plano', plano: null, servicos: await listarServicos() });
}

// POST /painel/planos
async function criar(req, res) {
  const dados = lerForm(req.body);
  if (!dados.nome) {
    req.session.flash = { tipo: 'erro', texto: 'Informe o nome do plano.' };
    return res.redirect('/painel/planos/novo');
  }
  await prisma.plano.create({ data: dados });
  req.session.flash = { tipo: 'sucesso', texto: 'Plano criado.' };
  res.redirect('/painel/planos');
}

// GET /painel/planos/:id/editar
async function formEditar(req, res) {
  const plano = await prisma.plano.findUnique({ where: { id: Number(req.params.id) } });
  if (!plano) return res.redirect('/painel/planos');
  res.render('painel/plano-form', { titulo: 'Editar plano', plano, servicos: await listarServicos() });
}

// POST /painel/planos/:id
async function atualizar(req, res) {
  const id = Number(req.params.id);
  const plano = await prisma.plano.findUnique({ where: { id } });
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
  const p = await prisma.plano.findUnique({ where: { id } });
  if (p) await prisma.plano.update({ where: { id }, data: { ativo: !p.ativo } });
  res.redirect('/painel/planos');
}

// POST /painel/planos/:id/remover — exclui (ou desativa se já tiver assinaturas)
async function remover(req, res) {
  const id = Number(req.params.id);
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

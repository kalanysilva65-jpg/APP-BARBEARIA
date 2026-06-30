// Controlador do catálogo de serviços/produtos e suas categorias.
// Acesso exclusivo do admin (garantido pelas rotas com exigeAdmin).
const prisma = require('../config/db');
const fs = require('fs');
const path = require('path');

// "40.50" / "40" -> 4050 (centavos). Retorna null se inválido.
function reaisParaCentavos(valorStr) {
  const n = parseFloat(String(valorStr).replace(',', '.'));
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

// Apaga um arquivo de foto do disco (silencioso se não existir).
function apagarFoto(fotoUrl) {
  if (!fotoUrl) return;
  const caminho = path.join(__dirname, '..', '..', fotoUrl.replace(/^\//, ''));
  fs.unlink(caminho, () => {});
}

// GET /painel/servicos — lista o catálogo + categorias
async function listar(req, res) {
  const servicos = await prisma.servico.findMany({
    include: { categoria: true },
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
  });
  const categorias = await prisma.categoriaServico.findMany({
    orderBy: { nome: 'asc' },
    include: { _count: { select: { servicos: true } } },
  });
  res.render('painel/servicos', { titulo: 'Serviços & Produtos', servicos, categorias });
}

// GET /painel/servicos/novo — formulário de criação
async function formNovo(req, res) {
  const categorias = await prisma.categoriaServico.findMany({ orderBy: { nome: 'asc' } });
  res.render('painel/servico-form', { titulo: 'Novo serviço', servico: null, categorias });
}

// POST /painel/servicos — cria um serviço/produto
async function criar(req, res) {
  const nome = (req.body.nome || '').trim();
  const valor = reaisParaCentavos(req.body.valor);
  const duracaoMin = Math.max(0, parseInt(req.body.duracaoMin, 10) || 0);
  const categoriaId = req.body.categoriaId ? Number(req.body.categoriaId) : null;
  const ehProduto = req.body.ehProduto === 'on';
  const comissaoPercentual = Math.min(100, Math.max(0, parseFloat(req.body.comissaoPercentual) || 10));
  const fotoUrl = req.file ? '/uploads/' + req.file.filename : null;

  if (!nome || valor === null) {
    if (fotoUrl) apagarFoto(fotoUrl);
    req.session.flash = { tipo: 'erro', texto: 'Informe ao menos nome e um valor válido.' };
    return res.redirect('/painel/servicos/novo');
  }

  await prisma.servico.create({ data: { nome, valor, duracaoMin, categoriaId, ehProduto, comissaoPercentual, fotoUrl } });
  req.session.flash = { tipo: 'sucesso', texto: 'Serviço criado.' };
  res.redirect('/painel/servicos');
}

// GET /painel/servicos/:id/editar — formulário de edição
async function formEditar(req, res) {
  const servico = await prisma.servico.findUnique({ where: { id: Number(req.params.id) } });
  if (!servico) return res.redirect('/painel/servicos');
  const categorias = await prisma.categoriaServico.findMany({ orderBy: { nome: 'asc' } });
  res.render('painel/servico-form', { titulo: 'Editar serviço', servico, categorias });
}

// POST /painel/servicos/:id — atualiza um serviço/produto
async function atualizar(req, res) {
  const id = Number(req.params.id);
  const servico = await prisma.servico.findUnique({ where: { id } });
  if (!servico) {
    if (req.file) apagarFoto('/uploads/' + req.file.filename);
    return res.redirect('/painel/servicos');
  }

  const nome = (req.body.nome || '').trim();
  const valor = reaisParaCentavos(req.body.valor);
  const duracaoMin = Math.max(0, parseInt(req.body.duracaoMin, 10) || 0);
  const categoriaId = req.body.categoriaId ? Number(req.body.categoriaId) : null;
  const ehProduto = req.body.ehProduto === 'on';
  const comissaoPercentual = Math.min(100, Math.max(0, parseFloat(req.body.comissaoPercentual) || 10));

  if (!nome || valor === null) {
    if (req.file) apagarFoto('/uploads/' + req.file.filename);
    req.session.flash = { tipo: 'erro', texto: 'Informe ao menos nome e um valor válido.' };
    return res.redirect('/painel/servicos/' + id + '/editar');
  }

  const data = { nome, valor, duracaoMin, categoriaId, ehProduto, comissaoPercentual };
  if (req.file) {
    apagarFoto(servico.fotoUrl); // remove a foto antiga
    data.fotoUrl = '/uploads/' + req.file.filename;
  }

  await prisma.servico.update({ where: { id }, data });
  req.session.flash = { tipo: 'sucesso', texto: 'Serviço atualizado.' };
  res.redirect('/painel/servicos');
}

// POST /painel/servicos/:id/toggle — ativa/desativa
async function alternarAtivo(req, res) {
  const id = Number(req.params.id);
  const s = await prisma.servico.findUnique({ where: { id } });
  if (s) await prisma.servico.update({ where: { id }, data: { ativo: !s.ativo } });
  res.redirect('/painel/servicos');
}

// POST /painel/servicos/:id/remover — exclui (ou desativa se tiver histórico)
async function remover(req, res) {
  const id = Number(req.params.id);
  const s = await prisma.servico.findUnique({ where: { id } });
  if (!s) return res.redirect('/painel/servicos');

  try {
    await prisma.servico.delete({ where: { id } });
    apagarFoto(s.fotoUrl);
    req.session.flash = { tipo: 'sucesso', texto: 'Serviço excluído.' };
  } catch (e) {
    // Está referenciado em agendamentos: desativa em vez de excluir.
    await prisma.servico.update({ where: { id }, data: { ativo: false } });
    req.session.flash = {
      tipo: 'aviso',
      texto: 'Esse item tem histórico em agendamentos, então foi desativado em vez de excluído.',
    };
  }
  res.redirect('/painel/servicos');
}

// --- Categorias -----------------------------------------------------------
async function criarCategoria(req, res) {
  const nome = (req.body.nome || '').trim();
  if (nome) await prisma.categoriaServico.create({ data: { nome } });
  res.redirect('/painel/servicos');
}

async function renomearCategoria(req, res) {
  const nome = (req.body.nome || '').trim();
  if (nome) await prisma.categoriaServico.update({ where: { id: Number(req.params.id) }, data: { nome } });
  res.redirect('/painel/servicos');
}

async function removerCategoria(req, res) {
  // Os serviços da categoria não são apagados: ficam "sem categoria" (SetNull).
  await prisma.categoriaServico.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.redirect('/painel/servicos');
}

module.exports = {
  listar,
  formNovo,
  criar,
  formEditar,
  atualizar,
  alternarAtivo,
  remover,
  criarCategoria,
  renomearCategoria,
  removerCategoria,
};

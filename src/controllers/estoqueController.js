// Controlador do controle de estoque (insumos internos) e suas categorias.
// Acesso exclusivo do admin (garantido pelas rotas com exigeAdmin).
const prisma = require('../config/db');

// "12,50" / "12" -> 1250 (centavos). Vazio/inválido -> 0.
function reaisParaCentavos(valorStr) {
  const n = parseFloat(String(valorStr).replace(',', '.'));
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

// GET /painel/estoque — lista os itens, destaca reposição e gerencia categorias
async function listar(req, res) {
  const itens = await prisma.estoque.findMany({
    include: { categoria: true },
    orderBy: [{ nome: 'asc' }],
  });
  const categorias = await prisma.categoriaEstoque.findMany({
    orderBy: { nome: 'asc' },
    include: { _count: { select: { itens: true } } },
  });
  // Alerta: quantidade no mínimo ou abaixo
  const baixoEstoque = itens.filter((i) => i.quantidade <= i.quantidadeMinima);

  res.render('painel/estoque', { titulo: 'Estoque', itens, categorias, baixoEstoque });
}

// GET /painel/estoque/novo — formulário de criação
async function formNovo(req, res) {
  const categorias = await prisma.categoriaEstoque.findMany({ orderBy: { nome: 'asc' } });
  res.render('painel/estoque-form', { titulo: 'Novo item de estoque', item: null, categorias });
}

// POST /painel/estoque — cria um item
async function criar(req, res) {
  const nome = (req.body.nome || '').trim();
  const quantidade = Math.max(0, parseInt(req.body.quantidade, 10) || 0);
  const quantidadeMinima = Math.max(0, parseInt(req.body.quantidadeMinima, 10) || 0);
  const valorGasto = reaisParaCentavos(req.body.valorGasto);
  const categoriaId = req.body.categoriaId ? Number(req.body.categoriaId) : null;

  if (!nome) {
    req.session.flash = { tipo: 'erro', texto: 'Informe o nome do item.' };
    return res.redirect('/painel/estoque/novo');
  }

  await prisma.estoque.create({ data: { nome, quantidade, quantidadeMinima, valorGasto, categoriaId } });
  req.session.flash = { tipo: 'sucesso', texto: 'Item adicionado ao estoque.' };
  res.redirect('/painel/estoque');
}

// GET /painel/estoque/:id/editar — formulário de edição
async function formEditar(req, res) {
  const item = await prisma.estoque.findUnique({ where: { id: Number(req.params.id) } });
  if (!item) return res.redirect('/painel/estoque');
  const categorias = await prisma.categoriaEstoque.findMany({ orderBy: { nome: 'asc' } });
  res.render('painel/estoque-form', { titulo: 'Editar item', item, categorias });
}

// POST /painel/estoque/:id — atualiza um item
async function atualizar(req, res) {
  const id = Number(req.params.id);
  const item = await prisma.estoque.findUnique({ where: { id } });
  if (!item) return res.redirect('/painel/estoque');

  const nome = (req.body.nome || '').trim();
  const quantidade = Math.max(0, parseInt(req.body.quantidade, 10) || 0);
  const quantidadeMinima = Math.max(0, parseInt(req.body.quantidadeMinima, 10) || 0);
  const valorGasto = reaisParaCentavos(req.body.valorGasto);
  const categoriaId = req.body.categoriaId ? Number(req.body.categoriaId) : null;

  if (!nome) {
    req.session.flash = { tipo: 'erro', texto: 'Informe o nome do item.' };
    return res.redirect('/painel/estoque/' + id + '/editar');
  }

  await prisma.estoque.update({
    where: { id },
    data: { nome, quantidade, quantidadeMinima, valorGasto, categoriaId },
  });
  req.session.flash = { tipo: 'sucesso', texto: 'Item atualizado.' };
  res.redirect('/painel/estoque');
}

// POST /painel/estoque/:id/ajuste — soma/subtrai a quantidade (ajuste rápido)
async function ajustar(req, res) {
  const id = Number(req.params.id);
  const delta = parseInt(req.body.delta, 10) || 0;
  const item = await prisma.estoque.findUnique({ where: { id } });
  if (item) {
    const nova = Math.max(0, item.quantidade + delta);
    await prisma.estoque.update({ where: { id }, data: { quantidade: nova } });
  }
  res.redirect('/painel/estoque');
}

// POST /painel/estoque/:id/remover — exclui um item (não há FK dependente)
async function remover(req, res) {
  await prisma.estoque.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  req.session.flash = { tipo: 'sucesso', texto: 'Item removido do estoque.' };
  res.redirect('/painel/estoque');
}

// --- Categorias de estoque ------------------------------------------------
async function criarCategoria(req, res) {
  const nome = (req.body.nome || '').trim();
  if (nome) await prisma.categoriaEstoque.create({ data: { nome } });
  res.redirect('/painel/estoque');
}

async function renomearCategoria(req, res) {
  const nome = (req.body.nome || '').trim();
  if (nome) await prisma.categoriaEstoque.update({ where: { id: Number(req.params.id) }, data: { nome } });
  res.redirect('/painel/estoque');
}

async function removerCategoria(req, res) {
  // Itens da categoria não são apagados: ficam "sem categoria" (SetNull).
  await prisma.categoriaEstoque.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.redirect('/painel/estoque');
}

module.exports = {
  listar,
  formNovo,
  criar,
  formEditar,
  atualizar,
  ajustar,
  remover,
  criarCategoria,
  renomearCategoria,
  removerCategoria,
};

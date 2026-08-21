// Controlador do catálogo de serviços/produtos e suas categorias.
// Alterar é exclusivo do admin (rotas com exigeAdmin). LISTAR é aberto ao
// funcionário: ele precisa do catálogo e dos preços para montar o atendimento.
const prisma = require('../config/db');
const fs = require('fs');
const { caminhoDoUpload } = require('../config/paths');

// "40.50" / "40" -> 4050 (centavos). Retorna null se inválido.
function reaisParaCentavos(valorStr) {
  const n = parseFloat(String(valorStr).replace(',', '.'));
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

// Apaga um arquivo de foto do disco (silencioso se não existir).
function apagarFoto(fotoUrl) {
  const caminho = caminhoDoUpload(fotoUrl);
  if (caminho) fs.unlink(caminho, () => {});
}

// Serviços e Produtos são telas separadas, mas a mesma tabela/registro por
// trás — o redirect volta para a tela certa conforme o ehProduto do item.
function destino(ehProduto) {
  return ehProduto ? '/painel/produtos' : '/painel/servicos';
}

// GET /painel/servicos — lista só os serviços (ehProduto:false)
async function listar(req, res) {
  const b = req.barbeariaId;
  const servicos = await prisma.servico.findMany({
    where: { barbeariaId: b, ehProduto: false },
    include: { categoria: true },
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
  });
  const categorias = await prisma.categoriaServico.findMany({
    where: { barbeariaId: b },
    orderBy: { nome: 'asc' },
    include: { _count: { select: { servicos: true } } },
  });
  res.render('painel/servicos', { titulo: 'Serviços', servicos, categorias });
}

// GET /painel/produtos — lista só os produtos (ehProduto:true)
async function listarProdutos(req, res) {
  const b = req.barbeariaId;
  const produtos = await prisma.servico.findMany({
    where: { barbeariaId: b, ehProduto: true },
    include: { categoria: true },
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
  });
  const categorias = await prisma.categoriaServico.findMany({
    where: { barbeariaId: b },
    orderBy: { nome: 'asc' },
    include: { _count: { select: { servicos: true } } },
  });

  // Quanto cada produto vendeu NO MÊS: o design Turno 6 (2026-07-28) abre a
  // tela com "vendido no mês" em manchete e traz o número de vendas dentro de
  // cada faixa. Só conta atendimento concluído — agendado ainda pode furar.
  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const inicioProxMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
  const vendidos = await prisma.agendamentoItem.findMany({
    where: {
      servico: { barbeariaId: b, ehProduto: true },
      agendamento: { barbeariaId: b, status: 'concluido', data: { gte: inicioMes, lt: inicioProxMes } },
    },
    select: { servicoId: true, quantidade: true, valorUnitario: true },
  });

  const porProduto = new Map();
  vendidos.forEach((it) => {
    const acc = porProduto.get(it.servicoId) || { qtd: 0, receita: 0 };
    acc.qtd += it.quantidade;
    acc.receita += it.valorUnitario * it.quantidade;
    porProduto.set(it.servicoId, acc);
  });
  produtos.forEach((p) => {
    const v = porProduto.get(p.id) || { qtd: 0, receita: 0 };
    p.vendidosMes = v.qtd;
    p.receitaMes = v.receita;
  });

  const maisVendido = produtos.reduce((a, p) => (a && a.vendidosMes >= p.vendidosMes ? a : p), null);
  const resumoMes = {
    receita: produtos.reduce((s, p) => s + p.receitaMes, 0),
    unidades: produtos.reduce((s, p) => s + p.vendidosMes, 0),
    itens: produtos.length,
    topNome: maisVendido && maisVendido.vendidosMes > 0 ? maisVendido.nome : null,
    topQtd: maisVendido ? maisVendido.vendidosMes : 0,
  };

  res.render('painel/produtos', { titulo: 'Produtos', produtos, categorias, resumoMes });
}

// GET /painel/servicos/novo — formulário de criação
async function formNovo(req, res) {
  const categorias = await prisma.categoriaServico.findMany({ where: { barbeariaId: req.barbeariaId }, orderBy: { nome: 'asc' } });
  res.render('painel/servico-form', { titulo: 'Novo serviço', servico: null, categorias });
}

// POST /painel/servicos — cria um serviço/produto
async function criar(req, res) {
  const nome = (req.body.nome || '').trim();
  const descricao = (req.body.descricao || '').trim() || null;
  const valor = reaisParaCentavos(req.body.valor);
  const duracaoMin = Math.max(0, parseInt(req.body.duracaoMin, 10) || 0);
  const categoriaId = req.body.categoriaId ? Number(req.body.categoriaId) : null;
  const ehProduto = req.body.ehProduto === 'on';
  const comissaoPercentual = Math.min(100, Math.max(0, parseFloat(req.body.comissaoPercentual) || 10));
  const fotoUrl = req.file ? '/uploads/' + req.file.filename : null;

  if (!nome || valor === null) {
    if (fotoUrl) apagarFoto(fotoUrl);
    req.session.flash = { tipo: 'erro', texto: 'Informe ao menos nome e um valor válido.' };
    return res.redirect(destino(ehProduto));
  }

  await prisma.servico.create({ data: { barbeariaId: req.barbeariaId, nome, descricao, valor, duracaoMin, categoriaId, ehProduto, comissaoPercentual, fotoUrl } });
  req.session.flash = { tipo: 'sucesso', texto: ehProduto ? 'Produto criado.' : 'Serviço criado.' };
  res.redirect(destino(ehProduto));
}

// GET /painel/servicos/:id/editar — formulário de edição
async function formEditar(req, res) {
  const servico = await prisma.servico.findFirst({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId } });
  if (!servico) return res.redirect('/painel/servicos');
  const categorias = await prisma.categoriaServico.findMany({ where: { barbeariaId: req.barbeariaId }, orderBy: { nome: 'asc' } });
  res.render('painel/servico-form', { titulo: 'Editar serviço', servico, categorias });
}

// POST /painel/servicos/:id — atualiza um serviço/produto
async function atualizar(req, res) {
  const id = Number(req.params.id);
  const servico = await prisma.servico.findFirst({ where: { id, barbeariaId: req.barbeariaId } });
  if (!servico) {
    if (req.file) apagarFoto('/uploads/' + req.file.filename);
    return res.redirect('/painel/servicos');
  }

  const nome = (req.body.nome || '').trim();
  const descricao = (req.body.descricao || '').trim() || null;
  const valor = reaisParaCentavos(req.body.valor);
  const duracaoMin = Math.max(0, parseInt(req.body.duracaoMin, 10) || 0);
  const categoriaId = req.body.categoriaId ? Number(req.body.categoriaId) : null;
  const ehProduto = req.body.ehProduto === 'on';
  const comissaoPercentual = Math.min(100, Math.max(0, parseFloat(req.body.comissaoPercentual) || 10));

  if (!nome || valor === null) {
    if (req.file) apagarFoto('/uploads/' + req.file.filename);
    req.session.flash = { tipo: 'erro', texto: 'Informe ao menos nome e um valor válido.' };
    return res.redirect(destino(servico.ehProduto));
  }

  const data = { nome, descricao, valor, duracaoMin, categoriaId, ehProduto, comissaoPercentual };
  if (req.file) {
    apagarFoto(servico.fotoUrl); // remove a foto antiga
    data.fotoUrl = '/uploads/' + req.file.filename;
  }

  await prisma.servico.update({ where: { id }, data });
  req.session.flash = { tipo: 'sucesso', texto: ehProduto ? 'Produto atualizado.' : 'Serviço atualizado.' };
  res.redirect(destino(ehProduto));
}

// POST /painel/servicos/:id/toggle — ativa/desativa
async function alternarAtivo(req, res) {
  const id = Number(req.params.id);
  const s = await prisma.servico.findFirst({ where: { id, barbeariaId: req.barbeariaId } });
  if (s) await prisma.servico.update({ where: { id }, data: { ativo: !s.ativo } });
  res.redirect(destino(s && s.ehProduto));
}

// POST /painel/servicos/:id/remover — exclui (ou desativa se tiver histórico)
async function remover(req, res) {
  const id = Number(req.params.id);
  const s = await prisma.servico.findFirst({ where: { id, barbeariaId: req.barbeariaId } });
  if (!s) return res.redirect('/painel/servicos');

  try {
    await prisma.servico.delete({ where: { id } });
    apagarFoto(s.fotoUrl);
    req.session.flash = { tipo: 'sucesso', texto: s.ehProduto ? 'Produto excluído.' : 'Serviço excluído.' };
  } catch (e) {
    // Está referenciado em agendamentos: desativa em vez de excluir.
    await prisma.servico.update({ where: { id }, data: { ativo: false } });
    req.session.flash = {
      tipo: 'aviso',
      texto: 'Esse item tem histórico em agendamentos, então foi desativado em vez de excluído.',
    };
  }
  res.redirect(destino(s.ehProduto));
}

// --- Categorias -------------------------------------------------------------
// Compartilhadas entre Serviços e Produtos (mesmo CategoriaServico) — o
// redirect volta para a tela de onde veio o formulário via campo `retorno`.
function destinoCategoria(req) {
  const retorno = req.body.retorno || req.query.retorno;
  return retorno === 'produtos' ? '/painel/produtos' : '/painel/servicos';
}

async function criarCategoria(req, res) {
  const nome = (req.body.nome || '').trim();
  if (nome) await prisma.categoriaServico.create({ data: { barbeariaId: req.barbeariaId, nome } });
  res.redirect(destinoCategoria(req));
}

async function renomearCategoria(req, res) {
  const nome = (req.body.nome || '').trim();
  if (nome) await prisma.categoriaServico.updateMany({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId }, data: { nome } });
  res.redirect(destinoCategoria(req));
}

async function removerCategoria(req, res) {
  // Os serviços da categoria não são apagados: ficam "sem categoria" (SetNull).
  await prisma.categoriaServico.deleteMany({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId } }).catch(() => {});
  res.redirect(destinoCategoria(req));
}

module.exports = {
  listar,
  listarProdutos,
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

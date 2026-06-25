// Controlador do cadastro de clientes.
// Acessível a admin e funcionários (rota sem exigeAdmin) — útil no balcão.
// Regra principal: telefone único, comparado de forma NORMALIZADA (só dígitos).
const prisma = require('../config/db');
const { normalizarTelefone } = require('../utils/telefone');

// GET /painel/clientes — lista + formulário (cria ou edita, conforme "editando")
async function listar(req, res) {
  const clientes = await prisma.cliente.findMany({
    orderBy: { nome: 'asc' },
    include: { _count: { select: { agendamentos: true } } },
  });
  res.render('painel/clientes', { titulo: 'Clientes', clientes, editando: null });
}

// POST /painel/clientes — cadastra um cliente
async function criar(req, res) {
  const nome = (req.body.nome || '').trim();
  const telefone = normalizarTelefone(req.body.telefone);

  if (!nome || !telefone) {
    req.session.flash = { tipo: 'erro', texto: 'Informe nome e telefone.' };
    return res.redirect('/painel/clientes');
  }

  // Unicidade do telefone (normalizado)
  const existe = await prisma.cliente.findUnique({ where: { telefone } });
  if (existe) {
    req.session.flash = { tipo: 'erro', texto: 'Já existe um cliente com esse telefone.' };
    return res.redirect('/painel/clientes');
  }

  await prisma.cliente.create({ data: { nome, telefone } });
  req.session.flash = { tipo: 'sucesso', texto: 'Cliente cadastrado.' };
  res.redirect('/painel/clientes');
}

// GET /painel/clientes/:id/editar — abre a mesma tela com o formulário em modo edição
async function formEditar(req, res) {
  const editando = await prisma.cliente.findUnique({ where: { id: Number(req.params.id) } });
  if (!editando) return res.redirect('/painel/clientes');
  const clientes = await prisma.cliente.findMany({
    orderBy: { nome: 'asc' },
    include: { _count: { select: { agendamentos: true } } },
  });
  res.render('painel/clientes', { titulo: 'Clientes', clientes, editando });
}

// POST /painel/clientes/:id — atualiza nome/telefone (unicidade continua valendo)
async function atualizar(req, res) {
  const id = Number(req.params.id);
  const cliente = await prisma.cliente.findUnique({ where: { id } });
  if (!cliente) return res.redirect('/painel/clientes');

  const nome = (req.body.nome || '').trim();
  const telefone = normalizarTelefone(req.body.telefone);

  if (!nome || !telefone) {
    req.session.flash = { tipo: 'erro', texto: 'Informe nome e telefone.' };
    return res.redirect('/painel/clientes/' + id + '/editar');
  }

  // O telefone não pode ser de OUTRO cliente
  const outro = await prisma.cliente.findUnique({ where: { telefone } });
  if (outro && outro.id !== id) {
    req.session.flash = { tipo: 'erro', texto: 'Já existe um cliente com esse telefone.' };
    return res.redirect('/painel/clientes/' + id + '/editar');
  }

  await prisma.cliente.update({ where: { id }, data: { nome, telefone } });
  req.session.flash = { tipo: 'sucesso', texto: 'Cliente atualizado.' };
  res.redirect('/painel/clientes');
}

// POST /painel/clientes/:id/remover — exclui o cliente
async function remover(req, res) {
  // Agendamentos vinculados ficam com clienteId nulo (SetNull no schema).
  await prisma.cliente.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  req.session.flash = { tipo: 'sucesso', texto: 'Cliente removido.' };
  res.redirect('/painel/clientes');
}

module.exports = { listar, criar, formEditar, atualizar, remover };

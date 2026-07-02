// Controlador do cadastro de clientes.
// Acessível a admin e funcionários (rota sem exigeAdmin) — útil no balcão.
// Regra principal: telefone único por barbearia, comparado de forma NORMALIZADA (só dígitos).
const prisma = require('../config/db');
const { normalizarTelefone } = require('../utils/telefone');

// GET /painel/clientes — lista + formulário (cria ou edita, conforme "editando")
async function listar(req, res) {
  const clientes = await prisma.cliente.findMany({
    where: { barbeariaId: req.barbeariaId },
    orderBy: { nome: 'asc' },
    include: { _count: { select: { agendamentos: true } } },
  });
  res.render('painel/clientes', { titulo: 'Clientes', clientes, editando: null });
}

// POST /painel/clientes — cadastra um cliente
async function criar(req, res) {
  const b = req.barbeariaId;
  const nome = (req.body.nome || '').trim();
  const telefone = normalizarTelefone(req.body.telefone);

  if (!nome || !telefone) {
    req.session.flash = { tipo: 'erro', texto: 'Informe nome e telefone.' };
    return res.redirect('/painel/clientes');
  }

  // Unicidade do telefone (normalizado) dentro da barbearia
  const existe = await prisma.cliente.findUnique({ where: { barbeariaId_telefone: { barbeariaId: b, telefone } } });
  if (existe) {
    req.session.flash = { tipo: 'erro', texto: 'Já existe um cliente com esse telefone.' };
    return res.redirect('/painel/clientes');
  }

  const dataNascimento = req.body.dataNascimento ? new Date(req.body.dataNascimento + 'T12:00:00') : null;
  await prisma.cliente.create({ data: { barbeariaId: b, nome, telefone, dataNascimento } });
  req.session.flash = { tipo: 'sucesso', texto: 'Cliente cadastrado.' };
  res.redirect('/painel/clientes');
}

// GET /painel/clientes/:id/editar — abre a mesma tela com o formulário em modo edição
async function formEditar(req, res) {
  const editando = await prisma.cliente.findFirst({
    where: { id: Number(req.params.id), barbeariaId: req.barbeariaId },
  });
  if (!editando) return res.redirect('/painel/clientes');
  const clientes = await prisma.cliente.findMany({
    where: { barbeariaId: req.barbeariaId },
    orderBy: { nome: 'asc' },
    include: { _count: { select: { agendamentos: true } } },
  });
  res.render('painel/clientes', { titulo: 'Clientes', clientes, editando });
}

// POST /painel/clientes/:id — atualiza nome/telefone (unicidade continua valendo)
async function atualizar(req, res) {
  const b = req.barbeariaId;
  const id = Number(req.params.id);
  const cliente = await prisma.cliente.findFirst({ where: { id, barbeariaId: b } });
  if (!cliente) return res.redirect('/painel/clientes');

  const nome = (req.body.nome || '').trim();
  const telefone = normalizarTelefone(req.body.telefone);

  if (!nome || !telefone) {
    req.session.flash = { tipo: 'erro', texto: 'Informe nome e telefone.' };
    return res.redirect('/painel/clientes/' + id + '/editar');
  }

  // O telefone não pode ser de OUTRO cliente da mesma barbearia
  const outro = await prisma.cliente.findUnique({ where: { barbeariaId_telefone: { barbeariaId: b, telefone } } });
  if (outro && outro.id !== id) {
    req.session.flash = { tipo: 'erro', texto: 'Já existe um cliente com esse telefone.' };
    return res.redirect('/painel/clientes/' + id + '/editar');
  }

  const dataNascimento = req.body.dataNascimento ? new Date(req.body.dataNascimento + 'T12:00:00') : null;
  await prisma.cliente.update({ where: { id }, data: { nome, telefone, dataNascimento } });
  req.session.flash = { tipo: 'sucesso', texto: 'Cliente atualizado.' };
  res.redirect('/painel/clientes');
}

// "YYYY-MM-DD" do dia atual (meia-noite local)
function isoHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// GET /painel/clientes/:id — detalhe do cliente (histórico + planos)
async function detalhe(req, res) {
  const b = req.barbeariaId;
  const cliente = await prisma.cliente.findFirst({ where: { id: Number(req.params.id), barbeariaId: b } });
  if (!cliente) return res.redirect('/painel/clientes');

  const agendamentos = await prisma.agendamento.findMany({
    where: { clienteId: cliente.id },
    include: { usuario: true, itens: { include: { servico: true } } },
    orderBy: [{ data: 'desc' }, { horaInicio: 'desc' }],
  });

  // Planos do cliente (assinaturas) + planos disponíveis para adicionar
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const assinaturasRaw = await prisma.clientePlano.findMany({
    where: { clienteId: cliente.id },
    include: { plano: true },
    orderBy: { criadoEm: 'desc' },
  });
  const assinaturas = assinaturasRaw.map((a) => ({
    ...a,
    // Vigente = ativo, dentro da validade e (se limitado) com usos restantes.
    vigente: a.ativo && new Date(a.dataFim) >= hoje && (a.usosRestantes === null || a.usosRestantes > 0),
  }));
  const planosDisponiveis = await prisma.plano.findMany({
    where: { barbeariaId: b, ativo: true },
    orderBy: { nome: 'asc' },
  });

  res.render('painel/cliente-detalhe', {
    titulo: cliente.nome,
    cliente,
    agendamentos,
    assinaturas,
    planosDisponiveis,
    hojeIso: isoHoje(),
  });
}

// POST /painel/clientes/:id/planos — atribui um plano ao cliente (entrada no caixa na compra)
async function adicionarPlano(req, res) {
  const b = req.barbeariaId;
  const clienteId = Number(req.params.id);
  const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, barbeariaId: b } });
  if (!cliente) return res.redirect('/painel/clientes');

  const plano = await prisma.plano.findFirst({ where: { id: Number(req.body.planoId), barbeariaId: b, ativo: true } });
  if (!plano) {
    req.session.flash = { tipo: 'erro', texto: 'Selecione um plano válido.' };
    return res.redirect('/painel/clientes/' + clienteId);
  }

  const dataInicio = req.body.dataInicio ? new Date(req.body.dataInicio + 'T12:00:00') : new Date();
  const dataFim = new Date(dataInicio);
  dataFim.setDate(dataFim.getDate() + plano.validadeDias);
  const usosRestantes = plano.tipo === 'limitado' ? plano.usos : null;

  await prisma.clientePlano.create({
    data: { barbeariaId: b, clienteId, planoId: plano.id, dataInicio, dataFim, usosRestantes, ativo: true },
  });

  // Valor do plano entra no caixa na compra (entrada), se houver valor.
  if (plano.valor > 0) {
    await prisma.caixa.create({
      data: {
        barbeariaId: b,
        descricao: 'Plano: ' + plano.nome + ' — ' + cliente.nome,
        valor: plano.valor,
        tipo: 'entrada',
        data: new Date(),
        categoriaId: null,
      },
    });
  }

  req.session.flash = { tipo: 'sucesso', texto: 'Plano adicionado ao cliente.' };
  res.redirect('/painel/clientes/' + clienteId);
}

// POST /painel/clientes/planos/:id/remover — remove uma assinatura do cliente
async function removerPlano(req, res) {
  const assinatura = await prisma.clientePlano.findFirst({
    where: { id: Number(req.params.id), barbeariaId: req.barbeariaId },
  });
  if (assinatura) await prisma.clientePlano.delete({ where: { id: assinatura.id } }).catch(() => {});
  // Observação: não removemos a entrada do caixa (o valor já foi recebido na compra).
  req.session.flash = { tipo: 'sucesso', texto: 'Plano removido do cliente.' };
  res.redirect('/painel/clientes' + (assinatura ? '/' + assinatura.clienteId : ''));
}

// POST /painel/clientes/:id/remover — exclui o cliente
async function remover(req, res) {
  // Agendamentos vinculados ficam com clienteId nulo (SetNull no schema).
  await prisma.cliente
    .deleteMany({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId } })
    .catch(() => {});
  req.session.flash = { tipo: 'sucesso', texto: 'Cliente removido.' };
  res.redirect('/painel/clientes');
}

module.exports = { listar, criar, formEditar, atualizar, remover, detalhe, adicionarPlano, removerPlano };

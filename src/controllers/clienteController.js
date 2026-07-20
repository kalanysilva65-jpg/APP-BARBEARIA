// Controlador do cadastro de clientes.
// Acessível a admin e funcionários (rota sem exigeAdmin) — útil no balcão.
// Regra principal: telefone único por barbearia, comparado de forma NORMALIZADA (só dígitos).
const prisma = require('../config/db');
const { normalizarTelefone } = require('../utils/telefone');

const DIAS_SUMIDO = 30; // mesmo limite usado no HTML original (lastVisitDays >= 30)

// Estatísticas por cliente (gasto total, última visita, serviço/barbeiro mais
// frequentes) — calculadas a partir do histórico real de agendamentos
// concluídos, diferente do protótipo (que usava campos soltos fixos).
function calcularStats(agendamentos) {
  const concluidos = agendamentos.filter((a) => a.status === 'concluido').sort((a, b) => new Date(a.data) - new Date(b.data));

  const totalGasto = concluidos.reduce((soma, a) => soma + a.valorTotal, 0);

  const contagemServico = new Map();
  const contagemBarbeiro = new Map();
  concluidos.forEach((a) => {
    contagemBarbeiro.set(a.usuario.nome, (contagemBarbeiro.get(a.usuario.nome) || 0) + 1);
    a.itens.forEach((it) => {
      contagemServico.set(it.servico.nome, (contagemServico.get(it.servico.nome) || 0) + 1);
    });
  });
  const maisFrequente = (mapa) => {
    let melhor = null;
    let max = 0;
    mapa.forEach((qtd, nome) => { if (qtd > max) { max = qtd; melhor = nome; } });
    return melhor;
  };

  let diasDesdeUltima = null;
  let frequenciaDias = null;
  if (concluidos.length > 0) {
    const ultima = concluidos[concluidos.length - 1].data;
    diasDesdeUltima = Math.floor((Date.now() - new Date(ultima).getTime()) / 86400000);
  }
  if (concluidos.length >= 2) {
    const primeira = new Date(concluidos[0].data).getTime();
    const ultima = new Date(concluidos[concluidos.length - 1].data).getTime();
    frequenciaDias = Math.round((ultima - primeira) / 86400000 / (concluidos.length - 1));
  }

  return {
    totalGasto,
    diasDesdeUltima,
    frequenciaDias,
    servicoFavorito: maisFrequente(contagemServico),
    barbeiroFavorito: maisFrequente(contagemBarbeiro),
    sumido: diasDesdeUltima !== null && diasDesdeUltima >= DIAS_SUMIDO,
  };
}

function iniciais(nome) {
  return nome.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

// "YYYY-MM-DD" do dia atual (meia-noite local)
function isoHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// GET /painel/clientes — lista + pop-up de detalhe por cliente (tudo numa
// tela só, igual ao HTML original — sem página de detalhe separada).
async function listar(req, res) {
  const b = req.barbeariaId;
  const clientes = await prisma.cliente.findMany({
    where: { barbeariaId: b },
    orderBy: { nome: 'asc' },
    include: {
      agendamentos: { include: { usuario: true, itens: { include: { servico: true } } }, orderBy: [{ data: 'desc' }, { horaInicio: 'desc' }] },
      planos: { include: { plano: true }, orderBy: { criadoEm: 'desc' } },
    },
  });

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const planosDisponiveis = await prisma.plano.findMany({ where: { barbeariaId: b, ativo: true }, orderBy: { nome: 'asc' } });

  const clientesComStats = clientes.map((c) => {
    const stats = calcularStats(c.agendamentos);
    const assinaturas = c.planos.map((a) => ({
      ...a,
      vigente: a.ativo && new Date(a.dataFim) >= hoje && (a.usosRestantes === null || a.usosRestantes > 0),
    }));
    return { ...c, iniciais: iniciais(c.nome), stats, assinaturas };
  });

  res.render('painel/clientes', { titulo: 'Clientes', clientes: clientesComStats, planosDisponiveis, hojeIso: isoHoje() });
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

// POST /painel/clientes/:id — atualiza os campos editáveis do pop-up
async function atualizar(req, res) {
  const b = req.barbeariaId;
  const id = Number(req.params.id);
  const cliente = await prisma.cliente.findFirst({ where: { id, barbeariaId: b } });
  if (!cliente) return res.redirect('/painel/clientes');

  const telefone = normalizarTelefone(req.body.telefone);
  if (!telefone) {
    req.session.flash = { tipo: 'erro', texto: 'Informe um telefone válido.' };
    return res.redirect('/painel/clientes');
  }

  // O telefone não pode ser de OUTRO cliente da mesma barbearia
  const outro = await prisma.cliente.findUnique({ where: { barbeariaId_telefone: { barbeariaId: b, telefone } } });
  if (outro && outro.id !== id) {
    req.session.flash = { tipo: 'erro', texto: 'Já existe um cliente com esse telefone.' };
    return res.redirect('/painel/clientes');
  }

  const dataNascimento = req.body.dataNascimento ? new Date(req.body.dataNascimento + 'T12:00:00') : null;
  const observacoes = (req.body.observacoes || '').trim() || null;
  await prisma.cliente.update({ where: { id }, data: { telefone, dataNascimento, observacoes } });
  req.session.flash = { tipo: 'sucesso', texto: 'Cliente atualizado.' };
  res.redirect('/painel/clientes');
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
    return res.redirect('/painel/clientes');
  }

  const dataInicio = req.body.dataInicio ? new Date(req.body.dataInicio + 'T12:00:00') : new Date();
  const dataFim = new Date(dataInicio);
  dataFim.setDate(dataFim.getDate() + plano.validadeDias);
  const usosRestantes = plano.tipo === 'limitado' ? plano.usos : null;

  await prisma.clientePlano.create({
    data: { barbeariaId: b, clienteId, planoId: plano.id, dataInicio, dataFim, usosRestantes, ativo: true },
  });

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
  res.redirect('/painel/clientes');
}

// POST /painel/clientes/planos/:id/remover — remove uma assinatura do cliente
async function removerPlano(req, res) {
  const assinatura = await prisma.clientePlano.findFirst({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId } });
  if (assinatura) await prisma.clientePlano.delete({ where: { id: assinatura.id } }).catch(() => {});
  req.session.flash = { tipo: 'sucesso', texto: 'Plano removido do cliente.' };
  res.redirect('/painel/clientes');
}

// POST /painel/clientes/:id/remover — exclui o cliente
async function remover(req, res) {
  await prisma.cliente
    .deleteMany({ where: { id: Number(req.params.id), barbeariaId: req.barbeariaId } })
    .catch(() => {});
  req.session.flash = { tipo: 'sucesso', texto: 'Cliente removido.' };
  res.redirect('/painel/clientes');
}

module.exports = { listar, criar, atualizar, remover, adicionarPlano, removerPlano };

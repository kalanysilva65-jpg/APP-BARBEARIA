// Controlador da agenda interna (equipe).
// Regras de acesso (verificadas no backend):
//  - Funcionário vê e altera SOMENTE a própria agenda.
//  - Admin (e o dono operando a barbearia) vê a agenda de todos e altera qualquer um.
// Tudo é escopado pela barbearia do contexto (req.barbeariaId).
const prisma = require('../config/db');
const { dataLocal, paraMinutos, duracaoEfetiva } = require('../services/disponibilidade');
const { DIAS_SEMANA, INTERVALO_SLOT_MIN } = require('../config/constantes');
const { normalizarTelefone } = require('../utils/telefone');
const caixaServ = require('../services/caixa');
const planoServ = require('../services/plano');

// Date -> "YYYY-MM-DD"
function iso(data) {
  const a = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, '0');
  const d = String(data.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

// Recalcula o valor_total do agendamento a partir dos seus itens.
async function recalcularTotal(agendamentoId) {
  const itens = await prisma.agendamentoItem.findMany({ where: { agendamentoId } });
  const total = itens.reduce((s, it) => s + it.valorUnitario * it.quantidade, 0);
  await prisma.agendamento.update({ where: { id: agendamentoId }, data: { valorTotal: total } });
  return total;
}

// Confere se o usuário logado pode mexer no agendamento (admin/dono, ou o próprio barbeiro).
function podeAlterar(req, agendamento) {
  return req.ehAdmin || agendamento.usuarioId === req.session.usuario.id;
}

function negarAcesso(res) {
  return res.status(403).render('erro', {
    layout: 'layouts/blank',
    titulo: 'Acesso negado',
    mensagem: 'Você só pode alterar os seus próprios agendamentos.',
  });
}

// Monta a URL de retorno para a agenda, preservando data e filtro de barbeiro.
function urlRetorno(req) {
  const qs = new URLSearchParams();
  if (req.body.retornoData) qs.set('data', req.body.retornoData);
  if (req.body.retornoBarbeiro) qs.set('barbeiro', req.body.retornoBarbeiro);
  const s = qs.toString();
  return '/painel/agenda' + (s ? '?' + s : '');
}

// GET /painel/agenda
async function verAgenda(req, res) {
  const usuario = req.session.usuario;
  const ehAdmin = req.ehAdmin;
  const b = req.barbeariaId;

  // Data selecionada (padrão: hoje)
  const dataStr = req.query.data || iso(new Date());
  const dataObj = dataLocal(dataStr);

  // Filtro de barbeiro:
  //  - Funcionário: sempre o próprio (ignora a query).
  //  - Admin: 'todos' ou um id específico; padrão = a própria agenda.
  let filtroBarbeiro = null; // null = todos
  let barbeiroSelecionado;
  if (ehAdmin) {
    barbeiroSelecionado = req.query.barbeiro || String(usuario.id);
    if (barbeiroSelecionado !== 'todos') filtroBarbeiro = Number(barbeiroSelecionado);
  } else {
    barbeiroSelecionado = String(usuario.id);
    filtroBarbeiro = usuario.id;
  }

  const where = { barbeariaId: b, data: dataObj };
  if (filtroBarbeiro) where.usuarioId = filtroBarbeiro;

  const agendamentos = await prisma.agendamento.findMany({
    where,
    include: { usuario: true, itens: { include: { servico: true } } },
    orderBy: [{ horaInicio: 'asc' }],
  });

  const barbeiros = ehAdmin
    ? await prisma.usuario.findMany({ where: { barbeariaId: b, ativo: true }, orderBy: { id: 'asc' } })
    : [];
  const servicos = await prisma.servico.findMany({ where: { barbeariaId: b, ativo: true }, orderBy: { nome: 'asc' } });

  // Navegação de datas (dia anterior / seguinte)
  const prev = new Date(dataObj);
  prev.setDate(prev.getDate() - 1);
  const next = new Date(dataObj);
  next.setDate(next.getDate() + 1);

  res.render('painel/agenda', {
    titulo: 'Agenda',
    ehAdmin,
    agendamentos,
    barbeiros,
    servicos,
    dataStr,
    dataExtenso: `${DIAS_SEMANA[dataObj.getDay()]}, ${res.locals.fmtData(dataObj)}`,
    barbeiroSelecionado,
    dataPrev: iso(prev),
    dataNext: iso(next),
    dataHoje: iso(new Date()),
    mostrarBarbeiroNoCard: !filtroBarbeiro, // mostra o nome do barbeiro quando vê "todos"
  });
}

// POST /painel/agenda/:id/itens — adiciona um serviço/produto ao agendamento
async function adicionarItem(req, res) {
  const b = req.barbeariaId;
  const agendamento = await prisma.agendamento.findFirst({
    where: { id: Number(req.params.id), barbeariaId: b },
  });
  if (!agendamento) return res.redirect('/painel/agenda');
  if (!podeAlterar(req, agendamento)) return negarAcesso(res);

  const servico = await prisma.servico.findFirst({
    where: { id: Number(req.body.servicoId), barbeariaId: b, ativo: true },
  });
  const quantidade = Math.max(1, Number(req.body.quantidade) || 1);

  if (servico) {
    await prisma.agendamentoItem.create({
      data: {
        agendamentoId: agendamento.id,
        servicoId: servico.id,
        valorUnitario: servico.valor, // congela o preço atual
        quantidade,
      },
    });
    await recalcularTotal(agendamento.id);
    req.session.flash = { tipo: 'sucesso', texto: 'Item adicionado.' };
  } else {
    req.session.flash = { tipo: 'erro', texto: 'Selecione um item válido.' };
  }
  res.redirect(urlRetorno(req));
}

// POST /painel/agenda/itens/:id/remover — remove um item do agendamento
async function removerItem(req, res) {
  const item = await prisma.agendamentoItem.findUnique({
    where: { id: Number(req.params.id) },
    include: { agendamento: true },
  });
  if (!item || item.agendamento.barbeariaId !== req.barbeariaId) return res.redirect('/painel/agenda');
  if (!podeAlterar(req, item.agendamento)) return negarAcesso(res);

  await prisma.agendamentoItem.delete({ where: { id: item.id } });
  await recalcularTotal(item.agendamentoId);
  req.session.flash = { tipo: 'sucesso', texto: 'Item removido.' };
  res.redirect(urlRetorno(req));
}

// POST /painel/agenda/:id/status — muda o status do agendamento
async function mudarStatus(req, res) {
  const b = req.barbeariaId;
  const agendamento = await prisma.agendamento.findFirst({
    where: { id: Number(req.params.id), barbeariaId: b },
  });
  if (!agendamento) return res.redirect('/painel/agenda');
  if (!podeAlterar(req, agendamento)) return negarAcesso(res);

  const novo = req.body.status;
  if (['agendado', 'concluido', 'cancelado'].includes(novo)) {
    await prisma.agendamento.update({ where: { id: agendamento.id }, data: { status: novo } });

    // Integração com o caixa (toggle "caixa automático"):
    if (novo === 'concluido') {
      // Gera a entrada no caixa, se o toggle estiver ligado (usa o total atualizado).
      if (await caixaServ.caixaAutomaticoLigado(b)) {
        const atual = await prisma.agendamento.findUnique({ where: { id: agendamento.id } });
        await caixaServ.registrarEntradaAgendamento(atual);
      }
    } else {
      // Reabrir (agendado) ou cancelar: remove eventual entrada automática.
      await caixaServ.removerEntradaAgendamento(agendamento.id);
    }

    // Ajuste de uso do plano (cancelar devolve 1 uso; reabrir volta a consumir).
    if (agendamento.clientePlanoId) {
      const eraAtivo = agendamento.status !== 'cancelado';
      const ficaAtivo = novo !== 'cancelado';
      if (eraAtivo && !ficaAtivo) await planoServ.ajustarUso(agendamento.clientePlanoId, +1);
      else if (!eraAtivo && ficaAtivo) await planoServ.ajustarUso(agendamento.clientePlanoId, -1);
    }
  }
  res.redirect(urlRetorno(req));
}

// POST /painel/agenda/:id/excluir — exclui o agendamento (qualquer status)
async function excluir(req, res) {
  const agendamento = await prisma.agendamento.findFirst({
    where: { id: Number(req.params.id), barbeariaId: req.barbeariaId },
  });
  if (!agendamento) return res.redirect('/painel/agenda');
  if (!podeAlterar(req, agendamento)) return negarAcesso(res);

  // Remove eventual entrada automática no caixa vinculada a este agendamento.
  await caixaServ.removerEntradaAgendamento(agendamento.id);
  // Devolve o uso do plano se o agendamento ainda estava ativo (não cancelado).
  if (agendamento.clientePlanoId && agendamento.status !== 'cancelado') {
    await planoServ.ajustarUso(agendamento.clientePlanoId, +1);
  }
  // Exclui o agendamento (os itens caem em cascata pelo schema).
  await prisma.agendamento.delete({ where: { id: agendamento.id } });

  req.session.flash = { tipo: 'sucesso', texto: 'Agendamento excluído.' };
  res.redirect(urlRetorno(req));
}

// Carrega os dados auxiliares do formulário de agendamento manual.
async function dadosForm(req) {
  const b = req.barbeariaId;
  const ehAdmin = req.ehAdmin;
  const barbeiros = ehAdmin
    ? await prisma.usuario.findMany({ where: { barbeariaId: b, ativo: true }, orderBy: { id: 'asc' } })
    : [];
  const servicos = await prisma.servico.findMany({ where: { barbeariaId: b, ativo: true }, orderBy: { nome: 'asc' } });
  const clientes = await prisma.cliente.findMany({
    where: { barbeariaId: b },
    select: { id: true, nome: true, telefone: true },
    orderBy: { nome: 'asc' },
  });
  return { ehAdmin, barbeiros, servicos, clientes };
}

// GET /painel/agenda/novo — formulário de agendamento manual
async function formNovo(req, res) {
  const dados = await dadosForm(req);
  res.render('painel/agenda-novo', {
    titulo: 'Novo agendamento',
    ...dados,
    valores: null,
    erro: null,
    hojeIso: iso(new Date()),
  });
}

// POST /painel/agenda/novo — cria o agendamento manual (com bloqueio de conflito)
async function criarManual(req, res) {
  const usuario = req.session.usuario;
  const ehAdmin = req.ehAdmin;
  const b = req.barbeariaId;

  // Barbeiro: admin escolhe; funcionário agenda sempre para si.
  const usuarioId = ehAdmin ? Number(req.body.barbeiroId) : usuario.id;
  const servicoId = Number(req.body.servicoId);
  const data = req.body.data;
  const hora = req.body.hora;
  const nome = (req.body.cliente_nome || '').trim();
  const email = (req.body.cliente_email || '').trim();
  const telefone = (req.body.cliente_telefone || '').trim();

  const barbeiro = await prisma.usuario.findFirst({ where: { id: usuarioId, barbeariaId: b, ativo: true } });
  const servico = await prisma.servico.findFirst({ where: { id: servicoId, barbeariaId: b, ativo: true } });

  const erros = [];
  if (!barbeiro) erros.push('Selecione um barbeiro.');
  if (!servico) erros.push('Selecione um serviço.');
  if (!data || !hora) erros.push('Informe data e horário.');
  if (!nome) erros.push('Informe o nome do cliente.');
  if (!telefone) erros.push('Informe o telefone do cliente.');

  // Bloqueio de conflito: o novo horário não pode sobrepor outro atendimento do barbeiro.
  if (barbeiro && servico && data && hora) {
    const iniNovo = paraMinutos(hora);
    const fimNovo = iniNovo + duracaoEfetiva(servico.duracaoMin);
    const existentes = await prisma.agendamento.findMany({
      where: { barbeariaId: b, usuarioId, data: dataLocal(data), status: { not: 'cancelado' } },
      include: { itens: { include: { servico: true } } },
    });
    const conflita = existentes.some((ag) => {
      const ini = paraMinutos(ag.horaInicio);
      const dur =
        ag.itens.reduce((s, it) => s + duracaoEfetiva(it.servico.duracaoMin) * it.quantidade, 0) ||
        INTERVALO_SLOT_MIN;
      return iniNovo < ini + dur && ini < fimNovo;
    });
    if (conflita) erros.push('Esse horário conflita com outro atendimento desse barbeiro. Escolha outro.');
  }

  if (erros.length) {
    const dados = await dadosForm(req);
    return res.render('painel/agenda-novo', {
      titulo: 'Novo agendamento',
      ...dados,
      valores: req.body,
      erro: erros.join(' '),
      hojeIso: iso(new Date()),
    });
  }

  // Alimenta/vincula o cliente pelo telefone normalizado (igual ao agendamento do site).
  const telNorm = normalizarTelefone(telefone);
  let clienteId = null;
  if (telNorm) {
    let cliente = await prisma.cliente.findUnique({
      where: { barbeariaId_telefone: { barbeariaId: b, telefone: telNorm } },
    });
    if (!cliente) cliente = await prisma.cliente.create({ data: { barbeariaId: b, nome, telefone: telNorm } });
    clienteId = cliente.id;
  }

  await prisma.agendamento.create({
    data: {
      barbeariaId: b,
      usuarioId,
      clienteId,
      clienteNome: nome,
      clienteEmail: email,
      clienteTelefone: telefone,
      data: dataLocal(data),
      horaInicio: hora,
      status: 'agendado',
      valorTotal: servico.valor,
      itens: { create: [{ servicoId: servico.id, valorUnitario: servico.valor, quantidade: 1 }] },
    },
  });

  req.session.flash = { tipo: 'sucesso', texto: 'Agendamento criado.' };
  res.redirect('/painel/agenda?data=' + data + (ehAdmin ? '&barbeiro=' + usuarioId : ''));
}

module.exports = { verAgenda, adicionarItem, removerItem, mudarStatus, excluir, formNovo, criarManual };

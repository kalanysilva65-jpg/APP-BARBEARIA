// Controlador da agenda interna (equipe).
// Regras de acesso (verificadas no backend):
//  - Funcionário vê e altera SOMENTE a própria agenda.
//  - Admin vê a agenda de todos e pode alterar qualquer agendamento.
const prisma = require('../config/db');
const { dataLocal } = require('../services/disponibilidade');
const { DIAS_SEMANA } = require('../config/constantes');
const caixaServ = require('../services/caixa');

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

// Confere se o usuário logado pode mexer no agendamento (dono ou admin).
function podeAlterar(usuario, agendamento) {
  return usuario.papel === 'admin' || agendamento.usuarioId === usuario.id;
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
  const ehAdmin = usuario.papel === 'admin';

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

  const where = { data: dataObj };
  if (filtroBarbeiro) where.usuarioId = filtroBarbeiro;

  const agendamentos = await prisma.agendamento.findMany({
    where,
    include: { usuario: true, itens: { include: { servico: true } } },
    orderBy: [{ horaInicio: 'asc' }],
  });

  const barbeiros = ehAdmin
    ? await prisma.usuario.findMany({ where: { ativo: true }, orderBy: { id: 'asc' } })
    : [];
  const servicos = await prisma.servico.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } });

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
  const agendamento = await prisma.agendamento.findUnique({ where: { id: Number(req.params.id) } });
  if (!agendamento) return res.redirect('/painel/agenda');
  if (!podeAlterar(req.session.usuario, agendamento)) return negarAcesso(res);

  const servico = await prisma.servico.findFirst({
    where: { id: Number(req.body.servicoId), ativo: true },
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
  if (!item) return res.redirect('/painel/agenda');
  if (!podeAlterar(req.session.usuario, item.agendamento)) return negarAcesso(res);

  await prisma.agendamentoItem.delete({ where: { id: item.id } });
  await recalcularTotal(item.agendamentoId);
  req.session.flash = { tipo: 'sucesso', texto: 'Item removido.' };
  res.redirect(urlRetorno(req));
}

// POST /painel/agenda/:id/status — muda o status do agendamento
async function mudarStatus(req, res) {
  const agendamento = await prisma.agendamento.findUnique({ where: { id: Number(req.params.id) } });
  if (!agendamento) return res.redirect('/painel/agenda');
  if (!podeAlterar(req.session.usuario, agendamento)) return negarAcesso(res);

  const novo = req.body.status;
  if (['agendado', 'concluido', 'cancelado'].includes(novo)) {
    await prisma.agendamento.update({ where: { id: agendamento.id }, data: { status: novo } });

    // Integração com o caixa (toggle "caixa automático"):
    if (novo === 'concluido') {
      // Gera a entrada no caixa, se o toggle estiver ligado (usa o total atualizado).
      if (await caixaServ.caixaAutomaticoLigado()) {
        const atual = await prisma.agendamento.findUnique({ where: { id: agendamento.id } });
        await caixaServ.registrarEntradaAgendamento(atual);
      }
    } else {
      // Reabrir (agendado) ou cancelar: remove eventual entrada automática.
      await caixaServ.removerEntradaAgendamento(agendamento.id);
    }
  }
  res.redirect(urlRetorno(req));
}

module.exports = { verAgenda, adicionarItem, removerItem, mudarStatus };

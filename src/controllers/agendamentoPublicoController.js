// Controlador do fluxo público de agendamento (cliente, sem login).
// Passos: (plano) -> serviço -> barbeiro -> horário -> dados -> confirmação.
// O estado segue pela querystring. A assinatura de plano (quando usada) é
// carregada pelo parâmetro `assinatura` e aplica: só seg–qui (ilimitado),
// valor R$ 0 e consumo de 1 uso (limitado).
const prisma = require('../config/db');
const { horariosDisponiveis, dataLocal } = require('../services/disponibilidade');
const { DIAS_SEMANA } = require('../config/constantes');
const { normalizarTelefone } = require('../utils/telefone');
const planoServ = require('../services/plano');

// Date -> "YYYY-MM-DD"
function iso(data) {
  const a = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, '0');
  const d = String(data.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

// "YYYY-MM-DD" -> "Segunda, 24/06/2026"
function dataPorExtenso(dataStr) {
  const d = dataLocal(dataStr);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${DIAS_SEMANA[d.getDay()]}, ${dia}/${mes}/${d.getFullYear()}`;
}

// Carrega e valida a assinatura (plano vigente). Retorna null se inválida/ausente.
async function carregarAssinatura(idStr) {
  const id = Number(idStr);
  if (!id) return null;
  const a = await prisma.clientePlano.findUnique({
    where: { id },
    include: { plano: { include: { servico: true } }, cliente: true },
  });
  if (!a || !planoServ.vigente(a)) return null;
  return a;
}

// Sufixo de querystring para carregar a assinatura entre os passos.
function suf(assinatura) {
  return assinatura ? '&assinatura=' + assinatura.id : '';
}

// GET /agendar/plano — consulta de plano por telefone
async function passoPlano(req, res) {
  const telefoneDigitado = (req.query.telefone || '').toString();
  let resultado = null;
  if (telefoneDigitado.trim()) {
    const { cliente, assinaturas } = await planoServ.assinaturasVigentesPorTelefone(
      normalizarTelefone(telefoneDigitado)
    );
    resultado = { cliente, assinaturas };
  }
  res.render('agendar/plano', {
    layout: 'layouts/publico',
    titulo: 'Meu plano',
    passo: 0,
    telefoneDigitado,
    resultado,
    dataPorExtenso,
  });
}

// Passo 1 — escolher o serviço
async function passoServico(req, res) {
  const assinatura = await carregarAssinatura(req.query.assinatura);
  const servicos = await prisma.servico.findMany({
    where: { ativo: true },
    include: { categoria: true },
    orderBy: { nome: 'asc' },
  });
  res.render('agendar/servico', { layout: 'layouts/publico', titulo: 'Agendar', passo: 1, servicos, assinatura });
}

// Passo 2 — escolher o barbeiro
async function passoBarbeiro(req, res) {
  const assinatura = await carregarAssinatura(req.query.assinatura);
  const servico = await prisma.servico.findFirst({ where: { id: Number(req.query.servicoId), ativo: true } });
  if (!servico) return res.redirect('/agendar?' + (assinatura ? 'assinatura=' + assinatura.id : ''));

  const barbeiros = await prisma.usuario.findMany({ where: { ativo: true }, orderBy: { id: 'asc' } });
  res.render('agendar/barbeiro', {
    layout: 'layouts/publico',
    titulo: 'Escolha o barbeiro',
    passo: 2,
    servico,
    barbeiros,
    assinatura,
  });
}

// Passo 3 — escolher data e horário
async function passoHorario(req, res) {
  const assinatura = await carregarAssinatura(req.query.assinatura);
  const servico = await prisma.servico.findFirst({ where: { id: Number(req.query.servicoId), ativo: true } });
  const barbeiro = await prisma.usuario.findFirst({ where: { id: Number(req.query.barbeiroId), ativo: true } });
  if (!servico || !barbeiro) return res.redirect('/agendar');

  const ilimitado = assinatura && assinatura.plano.tipo === 'ilimitado';

  const jornadas = await prisma.horarioTrabalho.findMany({ where: { usuarioId: barbeiro.id, trabalha: true } });
  const diasQueTrabalha = new Set(jornadas.map((j) => j.diaSemana));

  const datas = [];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  for (let i = 0; i < 21 && datas.length < 14; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    const dow = d.getDay();
    // Plano ilimitado só pode ser agendado de segunda (1) a quinta (4).
    if (ilimitado && (dow < 1 || dow > 4)) continue;
    if (diasQueTrabalha.has(dow)) {
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      datas.push({ iso: iso(d), rotulo: `${DIAS_SEMANA[dow].slice(0, 3)} ${dia}/${mes}` });
    }
  }

  let dataSel = req.query.data;
  if (!dataSel || !datas.find((x) => x.iso === dataSel)) dataSel = datas.length ? datas[0].iso : null;

  let horarios = [];
  if (dataSel) horarios = await horariosDisponiveis(barbeiro.id, dataSel, servico.duracaoMin);

  res.render('agendar/horario', {
    layout: 'layouts/publico',
    titulo: 'Escolha o horário',
    passo: 3,
    servico,
    barbeiro,
    datas,
    dataSel,
    horarios,
    assinatura,
    ilimitado,
  });
}

// Passo 4 — dados do cliente
async function passoDados(req, res) {
  const assinatura = await carregarAssinatura(req.query.assinatura);
  const { servicoId, barbeiroId, data, hora } = req.query;
  const servico = await prisma.servico.findFirst({ where: { id: Number(servicoId), ativo: true } });
  const barbeiro = await prisma.usuario.findFirst({ where: { id: Number(barbeiroId), ativo: true } });
  if (!servico || !barbeiro || !data || !hora) return res.redirect('/agendar');

  res.render('agendar/dados', {
    layout: 'layouts/publico',
    titulo: 'Seus dados',
    passo: 4,
    servico,
    barbeiro,
    data,
    hora,
    dataExtenso: dataPorExtenso(data),
    assinatura,
  });
}

// Confirmação — cria o agendamento (com validação no backend)
async function confirmar(req, res) {
  const assinatura = await carregarAssinatura(req.body.assinatura);
  let servicoId = Number(req.body.servicoId);
  // Se o plano cobre um serviço específico, é esse serviço que vale (segurança).
  if (assinatura && assinatura.plano.servicoId) servicoId = assinatura.plano.servicoId;
  const barbeiroId = Number(req.body.barbeiroId);
  const data = req.body.data;
  const hora = req.body.hora;
  let nome = (req.body.cliente_nome || '').trim();
  const email = (req.body.cliente_email || '').trim();
  let telefone = (req.body.cliente_telefone || '').trim();

  const servico = await prisma.servico.findFirst({ where: { id: servicoId, ativo: true } });
  const barbeiro = await prisma.usuario.findFirst({ where: { id: barbeiroId, ativo: true } });

  // Agendamento via plano usa os dados do cliente do plano.
  if (assinatura) {
    nome = assinatura.cliente.nome;
    telefone = assinatura.cliente.telefone;
  }

  const erros = [];
  if (!servico) erros.push('Serviço inválido.');
  if (!barbeiroId || !barbeiro) erros.push('Selecione um barbeiro.');
  if (!data || !hora) erros.push('Selecione data e horário.');
  if (!nome) erros.push('Informe seu nome.');
  if (!telefone) erros.push('Informe seu telefone.');
  if (!assinatura && !email) erros.push('Informe seu e-mail.');
  // Enviou um plano que não está mais válido
  if (!assinatura && req.body.assinatura) erros.push('Seu plano não está mais ativo.');
  // Plano ilimitado: só seg–qui
  if (assinatura && assinatura.plano.tipo === 'ilimitado' && data) {
    const dow = dataLocal(data).getDay();
    if (dow < 1 || dow > 4) erros.push('O plano ilimitado só pode ser agendado de segunda a quinta.');
  }

  // Revalida a disponibilidade real (evita corrida / horário ocupado)
  if (servico && barbeiro && data && hora) {
    const livres = await horariosDisponiveis(barbeiroId, data, servico.duracaoMin);
    if (!livres.includes(hora)) erros.push('Esse horário não está mais disponível. Escolha outro.');
  }

  if (erros.length) {
    req.session.flash = { tipo: 'erro', texto: erros.join(' ') };
    const qs = new URLSearchParams({
      servicoId: servicoId || '',
      barbeiroId: barbeiroId || '',
      data: data || '',
      hora: hora || '',
    });
    if (assinatura) qs.set('assinatura', assinatura.id);
    return res.redirect('/agendar/dados?' + qs.toString());
  }

  // Cliente: do plano (se houver) ou cria/reaproveita pelo telefone
  let clienteId = null;
  if (assinatura) {
    clienteId = assinatura.clienteId;
  } else {
    const telNorm = normalizarTelefone(telefone);
    if (telNorm) {
      let cliente = await prisma.cliente.findUnique({ where: { telefone: telNorm } });
      if (!cliente) cliente = await prisma.cliente.create({ data: { nome, telefone: telNorm } });
      clienteId = cliente.id;
    }
  }

  const usaPlano = !!assinatura;
  const agendamento = await prisma.agendamento.create({
    data: {
      usuarioId: barbeiroId,
      clienteId,
      clientePlanoId: usaPlano ? assinatura.id : null,
      clienteNome: nome,
      clienteEmail: email,
      clienteTelefone: telefone,
      data: dataLocal(data),
      horaInicio: hora,
      status: 'agendado',
      valorTotal: usaPlano ? 0 : servico.valor, // plano: coberto (R$ 0)
      itens: {
        create: [{ servicoId: servico.id, valorUnitario: usaPlano ? 0 : servico.valor, quantidade: 1 }],
      },
    },
  });

  // Consome 1 uso do plano (limitado; ilimitado não desconta).
  if (usaPlano) await planoServ.ajustarUso(assinatura.id, -1);

  res.redirect('/agendar/sucesso/' + agendamento.id);
}

// Tela de sucesso
async function sucesso(req, res) {
  const agendamento = await prisma.agendamento.findUnique({
    where: { id: Number(req.params.id) },
    include: { usuario: true, itens: { include: { servico: true } } },
  });
  if (!agendamento) return res.redirect('/agendar');

  res.render('agendar/sucesso', {
    layout: 'layouts/publico',
    titulo: 'Agendamento confirmado',
    passo: 5,
    agendamento,
    dataExtenso: dataPorExtenso(iso(new Date(agendamento.data))),
    usouPlano: !!agendamento.clientePlanoId,
  });
}

module.exports = { passoPlano, passoServico, passoBarbeiro, passoHorario, passoDados, confirmar, sucesso };

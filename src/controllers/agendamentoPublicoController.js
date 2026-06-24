// Controlador do fluxo público de agendamento (cliente, sem login).
// Um passo por tela: serviço -> barbeiro -> horário -> dados -> confirmação.
// O estado é carregado entre as telas via querystring (sem necessidade de JS).
const prisma = require('../config/db');
const { horariosDisponiveis, dataLocal } = require('../services/disponibilidade');
const { DIAS_SEMANA } = require('../config/constantes');

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

// Passo 1 — escolher o serviço
async function passoServico(req, res) {
  const servicos = await prisma.servico.findMany({
    where: { ativo: true },
    include: { categoria: true },
    orderBy: { nome: 'asc' },
  });
  res.render('agendar/servico', { layout: 'layouts/publico', titulo: 'Agendar', passo: 1, servicos });
}

// Passo 2 — escolher o barbeiro (obrigatório)
async function passoBarbeiro(req, res) {
  const servico = await prisma.servico.findFirst({
    where: { id: Number(req.query.servicoId), ativo: true },
  });
  if (!servico) return res.redirect('/agendar');

  // Todos os usuários ativos são barbeiros agendáveis (admin + funcionários)
  const barbeiros = await prisma.usuario.findMany({ where: { ativo: true }, orderBy: { id: 'asc' } });

  res.render('agendar/barbeiro', {
    layout: 'layouts/publico',
    titulo: 'Escolha o barbeiro',
    passo: 2,
    servico,
    barbeiros,
  });
}

// Passo 3 — escolher data e horário (disponibilidade do barbeiro escolhido)
async function passoHorario(req, res) {
  const servico = await prisma.servico.findFirst({
    where: { id: Number(req.query.servicoId), ativo: true },
  });
  const barbeiro = await prisma.usuario.findFirst({
    where: { id: Number(req.query.barbeiroId), ativo: true },
  });
  if (!servico || !barbeiro) return res.redirect('/agendar');

  // Dias em que o barbeiro trabalha
  const jornadas = await prisma.horarioTrabalho.findMany({
    where: { usuarioId: barbeiro.id, trabalha: true },
  });
  const diasQueTrabalha = new Set(jornadas.map((j) => j.diaSemana));

  // Próximos dias de atendimento (até 14, varrendo 21 dias)
  const datas = [];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  for (let i = 0; i < 21 && datas.length < 14; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    if (diasQueTrabalha.has(d.getDay())) {
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      datas.push({ iso: iso(d), rotulo: `${DIAS_SEMANA[d.getDay()].slice(0, 3)} ${dia}/${mes}` });
    }
  }

  // Data selecionada: a da querystring (se válida) ou a primeira disponível
  let dataSel = req.query.data;
  if (!dataSel || !datas.find((x) => x.iso === dataSel)) {
    dataSel = datas.length ? datas[0].iso : null;
  }

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
  });
}

// Passo 4 — dados do cliente (resumo + formulário)
async function passoDados(req, res) {
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
  });
}

// Confirmação — cria o agendamento (com validação no backend)
async function confirmar(req, res) {
  const servicoId = Number(req.body.servicoId);
  const barbeiroId = Number(req.body.barbeiroId);
  const data = req.body.data;
  const hora = req.body.hora;
  const nome = (req.body.cliente_nome || '').trim();
  const email = (req.body.cliente_email || '').trim();
  const telefone = (req.body.cliente_telefone || '').trim();

  const servico = await prisma.servico.findFirst({ where: { id: servicoId, ativo: true } });
  const barbeiro = await prisma.usuario.findFirst({ where: { id: barbeiroId, ativo: true } });

  // Validações no backend (não confiamos só no frontend)
  const erros = [];
  if (!servico) erros.push('Serviço inválido.');
  if (!barbeiroId || !barbeiro) erros.push('Selecione um barbeiro.'); // barbeiro é obrigatório
  if (!data || !hora) erros.push('Selecione data e horário.');
  if (!nome) erros.push('Informe seu nome.');
  if (!email) erros.push('Informe seu e-mail.');
  if (!telefone) erros.push('Informe seu telefone.');

  // Revalida a disponibilidade real (evita corrida / horário ocupado nesse meio-tempo)
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
    }).toString();
    return res.redirect('/agendar/dados?' + qs);
  }

  // Cria o agendamento já com o item do serviço escolhido (preço congelado)
  const agendamento = await prisma.agendamento.create({
    data: {
      usuarioId: barbeiroId,
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
  });
}

module.exports = { passoServico, passoBarbeiro, passoHorario, passoDados, confirmar, sucesso };

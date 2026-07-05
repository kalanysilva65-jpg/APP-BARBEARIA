// Controlador do fluxo público de agendamento (cliente, sem login).
// Passos: (plano) -> serviço -> barbeiro -> horário -> dados -> confirmação.
// O estado segue pela querystring. A barbearia vem do subdomínio (req.barbeariaId,
// garantido pelo middleware exigeBarbeariaPublica). A assinatura de plano (quando
// usada) é carregada pelo parâmetro `assinatura` e aplica: só seg–qui (ilimitado),
// valor R$ 0 e consumo de 1 uso (limitado).
const prisma = require('../config/db');
const { horariosDisponiveis, dataLocal } = require('../services/disponibilidade');
const { DIAS_SEMANA } = require('../config/constantes');
const { normalizarTelefone } = require('../utils/telefone');
const planoServ = require('../services/plano');
const { lerJanelaAgendamento } = require('./horarioController');

// Até quantos dias no futuro o cliente pode marcar, de acordo com a janela
// configurada pelo admin em Horários ("Janela de agendamento do cliente").
const JANELA_DIAS = { semana: 7, duas_semanas: 14, sem_limite: 60 };

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

// Carrega e valida a assinatura (plano vigente) DENTRO da barbearia. Null se inválida.
async function carregarAssinatura(idStr, barbeariaId) {
  const id = Number(idStr);
  if (!id) return null;
  const a = await prisma.clientePlano.findFirst({
    where: { id, barbeariaId },
    include: { plano: { include: { servico: true } }, cliente: true },
  });
  if (!a || !planoServ.vigente(a)) return null;
  return a;
}

// GET /agendar/plano — consulta de plano por telefone
async function passoPlano(req, res) {
  const telefoneDigitado = (req.query.telefone || '').toString();
  let resultado = null;
  if (telefoneDigitado.trim()) {
    const { cliente, assinaturas } = await planoServ.assinaturasVigentesPorTelefone(
      req.barbeariaId,
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

// Converte "1,2,3" ou "1" em [1, 2, 3]
function parseIds(str) {
  return (str || '').toString().split(',').map(Number).filter(Boolean);
}

// Passo 1 — escolher o serviço
async function passoServico(req, res) {
  const assinatura = await carregarAssinatura(req.query.assinatura, req.barbeariaId);
  const servicos = await prisma.servico.findMany({
    where: { barbeariaId: req.barbeariaId, ativo: true, ehProduto: false },
    include: { categoria: true },
    orderBy: { nome: 'asc' },
  });
  res.render('agendar/servico', { layout: 'layouts/publico', titulo: 'Agendar', passo: 1, servicos, assinatura });
}

// Passo 2 — escolher o barbeiro
async function passoBarbeiro(req, res) {
  const assinatura = await carregarAssinatura(req.query.assinatura, req.barbeariaId);
  // Suporta servicoIds (multi) e servicoId (legado / plano)
  const ids = parseIds(req.query.servicoIds || req.query.servicoId);
  const servicos = await prisma.servico.findMany({
    where: { id: { in: ids }, barbeariaId: req.barbeariaId, ativo: true },
    include: { categoria: true },
    orderBy: { nome: 'asc' },
  });
  if (!servicos.length) return res.redirect('/agendar' + (assinatura ? '?assinatura=' + assinatura.id : ''));

  const servicoIdsStr = servicos.map((s) => s.id).join(',');
  const duracaoTotal = servicos.reduce((s, x) => s + x.duracaoMin, 0);
  const valorTotal = servicos.reduce((s, x) => s + x.valor, 0);

  const barbeiros = await prisma.usuario.findMany({ where: { barbeariaId: req.barbeariaId, ativo: true }, orderBy: { id: 'asc' } });
  res.render('agendar/barbeiro', {
    layout: 'layouts/publico',
    titulo: 'Escolha o barbeiro',
    passo: 2,
    servicos,
    servicoIdsStr,
    duracaoTotal,
    valorTotal,
    barbeiros,
    assinatura,
  });
}

// Passo 3 — escolher data e horário
async function passoHorario(req, res) {
  const assinatura = await carregarAssinatura(req.query.assinatura, req.barbeariaId);
  const ids = parseIds(req.query.servicoIds || req.query.servicoId);
  const servicos = await prisma.servico.findMany({
    where: { id: { in: ids }, barbeariaId: req.barbeariaId, ativo: true },
    include: { categoria: true },
    orderBy: { nome: 'asc' },
  });
  const barbeiro = await prisma.usuario.findFirst({ where: { id: Number(req.query.barbeiroId), barbeariaId: req.barbeariaId, ativo: true } });
  if (!servicos.length || !barbeiro) return res.redirect('/agendar');

  const servicoIdsStr = servicos.map((s) => s.id).join(',');
  const duracaoTotal = servicos.reduce((s, x) => s + x.duracaoMin, 0);
  const valorTotal = servicos.reduce((s, x) => s + x.valor, 0);
  const ilimitado = assinatura && assinatura.plano.tipo === 'ilimitado';

  const jornadas = await prisma.horarioTrabalho.findMany({ where: { usuarioId: barbeiro.id, trabalha: true } });
  const diasQueTrabalha = new Set(jornadas.map((j) => j.diaSemana));

  const janela = await lerJanelaAgendamento(req.barbeariaId);
  const janelaDias = JANELA_DIAS[janela] || JANELA_DIAS.sem_limite;

  const datas = [];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  for (let i = 0; i < janelaDias && datas.length < 30; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    const dow = d.getDay();
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
  if (dataSel) horarios = await horariosDisponiveis(barbeiro.id, dataSel, duracaoTotal);

  res.render('agendar/horario', {
    layout: 'layouts/publico',
    titulo: 'Escolha o horário',
    passo: 3,
    servicos,
    servicoIdsStr,
    duracaoTotal,
    valorTotal,
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
  const assinatura = await carregarAssinatura(req.query.assinatura, req.barbeariaId);
  const { barbeiroId, data, hora } = req.query;
  const ids = parseIds(req.query.servicoIds || req.query.servicoId);
  const servicos = await prisma.servico.findMany({
    where: { id: { in: ids }, barbeariaId: req.barbeariaId, ativo: true },
    orderBy: { nome: 'asc' },
  });
  const barbeiro = await prisma.usuario.findFirst({ where: { id: Number(barbeiroId), barbeariaId: req.barbeariaId, ativo: true } });
  if (!servicos.length || !barbeiro || !data || !hora) return res.redirect('/agendar');

  const servicoIdsStr = servicos.map((s) => s.id).join(',');
  const valorTotal = servicos.reduce((s, x) => s + x.valor, 0);

  res.render('agendar/dados', {
    layout: 'layouts/publico',
    titulo: 'Seus dados',
    passo: 4,
    servicos,
    servicoIdsStr,
    valorTotal,
    barbeiro,
    data,
    hora,
    dataExtenso: dataPorExtenso(data),
    assinatura,
  });
}

// Confirmação — cria o agendamento (com validação no backend)
async function confirmar(req, res) {
  const b = req.barbeariaId;
  const assinatura = await carregarAssinatura(req.body.assinatura, b);
  let servicoIds = parseIds(req.body.servicoIds || req.body.servicoId);
  // Se o plano cobre um serviço específico, apenas esse serviço vale (segurança).
  if (assinatura && assinatura.plano.servicoId) servicoIds = [assinatura.plano.servicoId];
  const barbeiroId = Number(req.body.barbeiroId);
  const data = req.body.data;
  const hora = req.body.hora;
  let nome = (req.body.cliente_nome || '').trim();
  let telefone = (req.body.cliente_telefone || '').trim();
  const nascimentoStr = (req.body.cliente_nascimento || '').trim();

  const servicos = await prisma.servico.findMany({ where: { id: { in: servicoIds }, barbeariaId: b, ativo: true } });
  const barbeiro = await prisma.usuario.findFirst({ where: { id: barbeiroId, barbeariaId: b, ativo: true } });

  // Agendamento via plano usa os dados do cliente do plano.
  if (assinatura) {
    nome = assinatura.cliente.nome;
    telefone = assinatura.cliente.telefone;
  }

  const usaPlano = !!assinatura;
  const duracaoTotal = servicos.reduce((s, x) => s + x.duracaoMin, 0);
  const valorTotal = usaPlano ? 0 : servicos.reduce((s, x) => s + x.valor, 0);

  const erros = [];
  if (!servicos.length) erros.push('Serviço inválido.');
  if (!barbeiroId || !barbeiro) erros.push('Selecione um barbeiro.');
  if (!data || !hora) erros.push('Selecione data e horário.');
  if (!nome) erros.push('Informe seu nome.');
  if (!telefone) erros.push('Informe seu telefone.');
  if (!assinatura && req.body.assinatura) erros.push('Seu plano não está mais ativo.');
  if (assinatura && assinatura.plano.tipo === 'ilimitado' && data) {
    const dow = dataLocal(data).getDay();
    if (dow < 1 || dow > 4) erros.push('O plano ilimitado só pode ser agendado de segunda a quinta.');
  }

  // Revalida a disponibilidade real (soma das durações de todos os serviços)
  if (servicos.length && barbeiro && data && hora) {
    const livres = await horariosDisponiveis(barbeiroId, data, duracaoTotal);
    if (!livres.includes(hora)) erros.push('Esse horário não está mais disponível. Escolha outro.');
  }

  if (erros.length) {
    req.session.flash = { tipo: 'erro', texto: erros.join(' ') };
    const qs = new URLSearchParams({
      servicoIds: servicoIds.join(','),
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
      let cliente = await prisma.cliente.findUnique({
        where: { barbeariaId_telefone: { barbeariaId: b, telefone: telNorm } },
      });
      if (!cliente) {
        const dataNascimento =
          nascimentoStr && /^\d{4}-\d{2}-\d{2}$/.test(nascimentoStr)
            ? new Date(nascimentoStr + 'T12:00:00')
            : null;
        cliente = await prisma.cliente.create({ data: { barbeariaId: b, nome, telefone: telNorm, dataNascimento } });
      }
      clienteId = cliente.id;
    }
  }

  const agendamento = await prisma.agendamento.create({
    data: {
      barbeariaId: b,
      usuarioId: barbeiroId,
      clienteId,
      clientePlanoId: usaPlano ? assinatura.id : null,
      clienteNome: nome,
      clienteEmail: null,
      clienteTelefone: telefone,
      data: dataLocal(data),
      horaInicio: hora,
      status: 'agendado',
      valorTotal,
      itens: {
        create: servicos.map((s) => ({
          servicoId: s.id,
          valorUnitario: usaPlano ? 0 : s.valor,
          quantidade: 1,
        })),
      },
    },
  });

  // Consome 1 uso do plano (limitado; ilimitado não desconta).
  if (usaPlano) await planoServ.ajustarUso(assinatura.id, -1);

  res.redirect('/agendar/sucesso/' + agendamento.id);
}

// Tela de sucesso
async function sucesso(req, res) {
  const agendamento = await prisma.agendamento.findFirst({
    where: { id: Number(req.params.id), barbeariaId: req.barbeariaId },
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

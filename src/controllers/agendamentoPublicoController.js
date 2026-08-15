// Controlador do fluxo público de agendamento (cliente, sem login).
// Passos: (plano) -> serviço -> barbeiro -> horário -> dados -> confirmação.
// O estado segue pela querystring. A barbearia vem do subdomínio (req.barbeariaId,
// garantido pelo middleware exigeBarbeariaPublica). A assinatura de plano (quando
// usada) é carregada pelo parâmetro `assinatura` e aplica: os dias da semana
// configurados no plano (diasSemana), valor R$ 0 e consumo de 1 uso (limitado).
const prisma = require('../config/db');
const { horariosDisponiveis, todosHorarios, dataLocal } = require('../services/disponibilidade');
const { DIAS_SEMANA } = require('../config/constantes');
const { normalizarTelefone } = require('../utils/telefone');
const planoServ = require('../services/plano');
const notifServ = require('../services/notificacoes');
const { lerJanelaAgendamento } = require('./horarioController');

// Até quantos dias no futuro o cliente pode marcar, de acordo com a janela
// configurada pelo admin em Horários ("Janela de agendamento do cliente").
const JANELA_DIAS = { semana: 7, duas_semanas: 14, sem_limite: 60 };

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Id vindo da URL -> inteiro, ou 0 se não for um número.
//
// Sem isto, um link torto (ex.: "?barbeiroId=2?b=x", que acontece quando alguém
// cola duas querystrings juntas) vira `Number(...) === NaN`, e o Prisma recusa
// NaN com um erro não tratado: o cliente leva uma tela de erro 500 no meio do
// agendamento. Com 0, a busca simplesmente não acha ninguém e o fluxo cai no
// redirecionamento normal de volta.
function idNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

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

// "0,1,2,3,4,5,6" -> "todos os dias" / "segunda a quinta" (dias corridos) / "seg, ter, qua"
function diasLabel(diasStr) {
  const dias = String(diasStr || '').split(',').map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);
  if (dias.length === 7) return 'todos os dias';
  const corrido = dias.every((d, i) => i === 0 || d === dias[i - 1] + 1);
  if (corrido && dias.length > 1) return `${DIAS_SEMANA[dias[0]].toLowerCase()} a ${DIAS_SEMANA[dias[dias.length - 1]].toLowerCase()}`;
  return dias.map((d) => DIAS_SEMANA[d].slice(0, 3)).join(', ');
}

// Data de nascimento digitada pelo cliente -> Date (ou null).
// Aceita "dd/mm/aaaa" (campo com máscara, formato usado pela tela desde
// 2026-07-28) e "aaaa-mm-dd" (formato do <input type="date"> anterior, mantido
// para não quebrar quem tiver a tela antiga em cache). Fixa meio-dia porque
// salvar à meia-noite faz o fuso jogar o aniversário pro dia anterior.
function parseNascimento(str) {
  const s = String(str || '').trim();
  let ymd = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) ymd = s;
  else {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) ymd = `${m[3]}-${m[2]}-${m[1]}`;
  }
  if (!ymd) return null;
  const d = new Date(ymd + 'T12:00:00');
  return isNaN(d.getTime()) ? null : d;
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
    // O "Voltar" mora no cabeçalho, que é do layout — como o destino carrega
    // a querystring do fluxo, quem sabe dele é este controlador.
    // Null = passo sem volta (primeiro passo / sucesso).
    voltarHref: '/agendar',
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
  res.render('agendar/servico', {
    layout: 'layouts/publico',
    titulo: 'Agendar',
    passo: 1,
    servicos,
    assinatura,
    // Só há pra onde voltar se o cliente chegou aqui pela consulta de plano.
    voltarHref: assinatura ? '/agendar/plano' : null,
  });
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
    // "Qualquer disponível" só faz sentido com mais de 1 barbeiro ativo.
    mostrarQualquer: barbeiros.length > 1,
    assinatura,
    voltarHref: '/agendar' + (assinatura ? '?assinatura=' + assinatura.id : ''),
  });
}

// Junta os horários de todos os barbeiros ativos numa data (união): um
// horário aparece livre se PELO MENOS UM deles estiver livre — usado pela
// opção "Qualquer disponível" (não existia antes, pedido novo do dono).
async function todosHorariosQualquer(barbeiroIds, dataStr, duracaoServico) {
  const porBarbeiro = await Promise.all(barbeiroIds.map((id) => todosHorarios(id, dataStr, duracaoServico)));
  const mapa = new Map(); // hora -> livre
  porBarbeiro.forEach((lista) => {
    lista.forEach((s) => {
      mapa.set(s.hora, (mapa.get(s.hora) || false) || s.livre);
    });
  });
  return Array.from(mapa.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hora, livre]) => ({ hora, livre }));
}

// Resolve qual barbeiro de verdade atende quando o cliente escolheu
// "Qualquer disponível" — o primeiro (por id) que estiver livre no horário
// escolhido. Retorna null se, entre a escolha e a confirmação, ninguém mais
// estiver livre (ex.: alguém confirmou o mesmo horário antes).
async function resolverBarbeiroQualquer(barbeariaId, dataStr, hora, duracaoTotal) {
  const barbeiros = await prisma.usuario.findMany({ where: { barbeariaId, ativo: true }, orderBy: { id: 'asc' } });
  for (const b of barbeiros) {
    const livres = await horariosDisponiveis(b.id, dataStr, duracaoTotal);
    if (livres.includes(hora)) return b;
  }
  return null;
}

// Só os horários de UMA data, em JSON — usado pela troca de dia na tela de
// agendamento (passo 3).
//
// Antes, trocar de dia era uma navegação completa: o cliente pagava a transição
// de tela (~0,44s de fade), o download e re-render do HTML inteiro e as
// animações de entrada de tudo de novo — só para mudar a lista de horários.
// Era isso que o dono sentia como "lento ao trocar o dia" (as consultas em si
// levam poucos milissegundos). Aqui volta só o que muda.
//
// O escopo por barbearia continua vindo de `exigeBarbeariaPublica`
// (req.barbeariaId), então esta rota não enxerga outra barbearia.
async function horariosJson(req, res) {
  const dataSel = String(req.query.data || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataSel)) return res.status(400).json({ erro: 'data' });

  const ids = parseIds(req.query.servicoIds || req.query.servicoId);
  const servicos = await prisma.servico.findMany({
    where: { id: { in: ids }, barbeariaId: req.barbeariaId, ativo: true },
    select: { duracaoMin: true },
  });
  if (!servicos.length) return res.status(400).json({ erro: 'servico' });
  const duracaoTotal = servicos.reduce((s, x) => s + x.duracaoMin, 0);

  let todos;
  if (req.query.barbeiroId === 'any') {
    const barbeiros = await prisma.usuario.findMany({
      where: { barbeariaId: req.barbeariaId, ativo: true },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    todos = await todosHorariosQualquer(barbeiros.map((b) => b.id), dataSel, duracaoTotal);
  } else {
    const barbeiro = await prisma.usuario.findFirst({
      where: { id: idNum(req.query.barbeiroId), barbeariaId: req.barbeariaId, ativo: true },
      select: { id: true },
    });
    if (!barbeiro) return res.status(400).json({ erro: 'barbeiro' });
    todos = await todosHorarios(barbeiro.id, dataSel, duracaoTotal);
  }

  res.json({
    manha: todos.filter((h) => Number(h.hora.slice(0, 2)) < 12),
    tarde: todos.filter((h) => Number(h.hora.slice(0, 2)) >= 12),
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

  // "any" = qualquer barbeiro disponível (não existia antes, pedido novo do
  // dono) — junta a jornada/disponibilidade de todos os barbeiros ativos.
  const ehQualquer = req.query.barbeiroId === 'any';
  const barbeirosAtivos = await prisma.usuario.findMany({ where: { barbeariaId: req.barbeariaId, ativo: true }, orderBy: { id: 'asc' } });
  const barbeiro = ehQualquer
    ? { id: 'any', nome: 'Qualquer disponível' }
    : await prisma.usuario.findFirst({ where: { id: idNum(req.query.barbeiroId), barbeariaId: req.barbeariaId, ativo: true } });
  if (!servicos.length || !barbeiro) return res.redirect('/agendar');

  const servicoIdsStr = servicos.map((s) => s.id).join(',');
  const duracaoTotal = servicos.reduce((s, x) => s + x.duracaoMin, 0);
  const valorTotal = servicos.reduce((s, x) => s + x.valor, 0);
  const ilimitado = assinatura && assinatura.plano.tipo === 'ilimitado';
  // Dias em que o plano da assinatura pode ser usado (null = sem restrição de plano).
  const diasPlano = assinatura ? new Set(assinatura.plano.diasSemana.split(',').map(Number)) : null;

  // Dias em que trabalha: união de todos os barbeiros, se "qualquer".
  let diasQueTrabalha;
  if (ehQualquer) {
    const jornadasTodos = await prisma.horarioTrabalho.findMany({
      where: { usuarioId: { in: barbeirosAtivos.map((b) => b.id) }, trabalha: true },
    });
    diasQueTrabalha = new Set(jornadasTodos.map((j) => j.diaSemana));
  } else {
    const jornadas = await prisma.horarioTrabalho.findMany({ where: { usuarioId: barbeiro.id, trabalha: true } });
    diasQueTrabalha = new Set(jornadas.map((j) => j.diaSemana));
  }

  const janela = await lerJanelaAgendamento(req.barbeariaId);
  const janelaDias = JANELA_DIAS[janela] || JANELA_DIAS.sem_limite;

  const datas = [];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  for (let i = 0; i < janelaDias && datas.length < 30; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    const dow = d.getDay();
    if (diasPlano && !diasPlano.has(dow)) continue;
    if (diasQueTrabalha.has(dow)) {
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const linha1 = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : `${DIAS_SEMANA[dow].slice(0, 3)}, ${d.getDate()}`;
      datas.push({
        iso: iso(d),
        linha1,
        linha2: `${DIAS_SEMANA[dow].slice(0, 3)}, ${d.getDate()} ${MESES_ABREV[d.getMonth()]}`,
        // O ladrilho de dia tem duas linhas independentes: em cima o dia da
        // semana (ou "Hoje"), embaixo só o número, a 20px.
        dow: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : DIAS_SEMANA[dow].slice(0, 3),
        dia: d.getDate(),
      });
    }
  }

  let dataSel = req.query.data;
  if (!dataSel || !datas.find((x) => x.iso === dataSel)) dataSel = datas.length ? datas[0].iso : null;

  // Mostra o expediente inteiro (livres + ocupados riscados), separado em
  // Manhã/Tarde, igual ao mockup — não só os horários livres.
  let horariosManha = [];
  let horariosTarde = [];
  if (dataSel) {
    const todos = ehQualquer
      ? await todosHorariosQualquer(barbeirosAtivos.map((b) => b.id), dataSel, duracaoTotal)
      : await todosHorarios(barbeiro.id, dataSel, duracaoTotal);
    horariosManha = todos.filter((h) => Number(h.hora.slice(0, 2)) < 12);
    horariosTarde = todos.filter((h) => Number(h.hora.slice(0, 2)) >= 12);
  }

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
    horariosManha,
    horariosTarde,
    assinatura,
    ilimitado,
    diasPlanoLabel: assinatura && assinatura.plano.diasSemana !== '0,1,2,3,4,5,6' ? diasLabel(assinatura.plano.diasSemana) : null,
    voltarHref: `/agendar/barbeiro?servicoIds=${servicoIdsStr}` + (assinatura ? '&assinatura=' + assinatura.id : ''),
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
  const ehQualquer = barbeiroId === 'any';
  const barbeiro = ehQualquer
    ? { id: 'any', nome: 'Qualquer disponível' }
    : await prisma.usuario.findFirst({ where: { id: Number(barbeiroId), barbeariaId: req.barbeariaId, ativo: true } });
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
    voltarHref:
      `/agendar/horario?servicoIds=${servicoIdsStr}&barbeiroId=${barbeiro.id}&data=${data}` +
      (assinatura ? '&assinatura=' + assinatura.id : ''),
  });
}

// Confirmação — cria o agendamento (com validação no backend)
async function confirmar(req, res) {
  const b = req.barbeariaId;
  const assinatura = await carregarAssinatura(req.body.assinatura, b);
  let servicoIds = parseIds(req.body.servicoIds || req.body.servicoId);
  // Se o plano cobre um serviço específico, apenas esse serviço vale (segurança).
  if (assinatura && assinatura.plano.servicoId) servicoIds = [assinatura.plano.servicoId];
  const ehQualquer = req.body.barbeiroId === 'any';
  const data = req.body.data;
  const hora = req.body.hora;
  let nome = (req.body.cliente_nome || '').trim();
  let telefone = (req.body.cliente_telefone || '').trim();
  const nascimentoStr = (req.body.cliente_nascimento || '').trim();

  const servicos = await prisma.servico.findMany({ where: { id: { in: servicoIds }, barbeariaId: b, ativo: true } });
  const usaPlano = !!assinatura;
  const duracaoTotal = servicos.reduce((s, x) => s + x.duracaoMin, 0);

  // "Qualquer disponível": resolve agora, na confirmação, quem realmente
  // atende — o primeiro barbeiro (por id) livre nesse horário. Evita reservar
  // o mesmo barbeiro se dois clientes escolherem "qualquer" ao mesmo tempo.
  let barbeiro = null;
  if (ehQualquer) {
    if (data && hora && servicos.length) barbeiro = await resolverBarbeiroQualquer(b, data, hora, duracaoTotal);
  } else {
    barbeiro = await prisma.usuario.findFirst({ where: { id: idNum(req.body.barbeiroId), barbeariaId: b, ativo: true } });
  }

  // Agendamento via plano usa os dados do cliente do plano.
  if (assinatura) {
    nome = assinatura.cliente.nome;
    telefone = assinatura.cliente.telefone;
  }

  const valorTotal = usaPlano ? 0 : servicos.reduce((s, x) => s + x.valor, 0);

  const erros = [];
  if (!servicos.length) erros.push('Serviço inválido.');
  if (!barbeiro) erros.push(ehQualquer ? 'Nenhum barbeiro está mais disponível nesse horário. Escolha outro.' : 'Selecione um barbeiro.');
  if (!data || !hora) erros.push('Selecione data e horário.');
  if (!nome) erros.push('Informe seu nome.');
  if (!telefone) erros.push('Informe seu telefone.');
  if (!assinatura && req.body.assinatura) erros.push('Seu plano não está mais ativo.');
  if (assinatura && data) {
    const dow = dataLocal(data).getDay();
    const diasPermitidos = new Set(assinatura.plano.diasSemana.split(',').map(Number));
    if (!diasPermitidos.has(dow)) erros.push('Esse plano não pode ser usado nesse dia da semana.');
  }

  // Revalida a disponibilidade real (soma das durações de todos os serviços).
  // Pra "qualquer" já foi revalidado dentro de resolverBarbeiroQualquer.
  if (!ehQualquer && servicos.length && barbeiro && data && hora) {
    const livres = await horariosDisponiveis(barbeiro.id, data, duracaoTotal);
    if (!livres.includes(hora)) erros.push('Esse horário não está mais disponível. Escolha outro.');
  }

  if (erros.length) {
    req.session.flash = { tipo: 'erro', texto: erros.join(' ') };
    const qs = new URLSearchParams({
      servicoIds: servicoIds.join(','),
      barbeiroId: ehQualquer ? 'any' : (req.body.barbeiroId || ''),
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
        cliente = await prisma.cliente.create({
          data: { barbeariaId: b, nome, telefone: telNorm, dataNascimento: parseNascimento(nascimentoStr) },
        });
      }
      clienteId = cliente.id;
    }
  }

  const agendamento = await prisma.agendamento.create({
    data: {
      barbeariaId: b,
      usuarioId: barbeiro.id,
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

  // Avisa o barbeiro no aparelho dele. Sem `await`: o cliente não pode esperar
  // (nem levar erro) por causa de um push — o agendamento já está criado, e o
  // serviço engole as próprias falhas.
  notifServ.notificarNovoAgendamento(agendamento, servicos.map((s) => s.nome).join(' + '));

  res.redirect('/agendar/sucesso/' + agendamento.id);
}

// Tela de sucesso
async function sucesso(req, res) {
  const agendamento = await prisma.agendamento.findFirst({
    where: { id: idNum(req.params.id), barbeariaId: req.barbeariaId },
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

module.exports = { passoPlano, passoServico, passoBarbeiro, passoHorario, horariosJson, passoDados, confirmar, sucesso };

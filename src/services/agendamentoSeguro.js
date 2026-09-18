// Criação SEGURA de agendamento pela secretária de IA (Fase 3.4). É o limite que
// "não pode ser passado de jeito nenhum" TRAVADO NO CÓDIGO: nunca marca em cima
// de outro atendimento. Reproduz as mesmas regras do agendamento manual do painel
// (services/disponibilidade + conflito por sobreposição), mas:
//   - RE-CHECA o conflito DENTRO de uma transação (dois clientes pedindo o mesmo
//     horário ao mesmo tempo não conseguem marcar os dois);
//   - exige que o horário esteja REALMENTE livre (barra passado / fora do expediente);
//   - o barbeariaId e o telefone do cliente vêm do CHAMADOR (servidor), nunca da IA.
const prisma = require('../config/db');
const { dataLocal, paraMinutos, duracaoComEncaixe, horariosDisponiveis, todosHorarios } = require('./disponibilidade');
const { normalizarTelefone, variantesTelefone, telefoneCanonicoBR } = require('../utils/telefone');
const planoServ = require('./plano');

// Há sobreposição com algum atendimento ativo do barbeiro nessa data?
async function temConflito(tx, barbeariaId, usuarioId, dataDate, iniNovo, fimNovo) {
  const existentes = await tx.agendamento.findMany({
    where: { barbeariaId, usuarioId, data: dataDate, status: { not: 'cancelado' } },
    include: { itens: { include: { servico: true } } },
  });
  return existentes.some((ag) => {
    const ini = paraMinutos(ag.horaInicio);
    const dur = duracaoComEncaixe(
      ag.itens.map((it) => ({ duracaoMin: it.servico.duracaoMin, ehEncaixe: it.servico.ehEncaixe, quantidade: it.quantidade })),
      { efetiva: true }
    );
    return iniNovo < ini + dur && ini < fimNovo;
  });
}

// Cria o agendamento se — e só se — o horário estiver realmente livre.
// Retorna { ok, agendamentoId, ... } ou { erro, mensagem }.
async function criarAgendamento(barbeariaId, dados) {
  const { usuarioId, servicoIds, data, hora, clienteNome, clienteTelefone, clientePlanoId } = dados || {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) || !/^\d{2}:\d{2}$/.test(String(hora || ''))) {
    return { erro: 'entrada', mensagem: 'Data ou horário em formato inválido.' };
  }
  if (!clienteNome || !clienteTelefone) return { erro: 'cliente', mensagem: 'Falta o nome ou o telefone do cliente.' };

  const barbeiro = await prisma.usuario.findFirst({ where: { id: Number(usuarioId), barbeariaId, ativo: true } });
  if (!barbeiro) return { erro: 'barbeiro', mensagem: 'Barbeiro inválido.' };

  const ids = (servicoIds || []).map(Number).filter(Boolean);
  const servicos = await prisma.servico.findMany({ where: { id: { in: ids }, barbeariaId, ativo: true } });
  if (!servicos.length) return { erro: 'servico', mensagem: 'Serviço inválido.' };

  // USO DE PLANO (opcional). Mesmas regras do agendamento por plano no painel:
  // vigência, dia da semana permitido, cobertura de serviço e dono do plano. Se
  // usar plano: valor = 0 e consome 1 uso (limitado). Trava de segurança: o plano
  // tem que ser do MESMO número do cliente (não dá pra gastar o plano de outro).
  let assinatura = null;
  if (clientePlanoId) {
    assinatura = await prisma.clientePlano.findFirst({
      where: { id: Number(clientePlanoId), barbeariaId },
      include: { plano: true, cliente: true },
    });
    if (!assinatura) return { erro: 'plano', mensagem: 'Plano não encontrado.' };
    if (!planoServ.vigente(assinatura)) return { erro: 'plano_invalido', mensagem: 'Esse plano não está mais ativo (sem usos ou fora da validade).' };
    const donoOk = variantesTelefone(clienteTelefone).includes(normalizarTelefone(assinatura.cliente.telefone));
    if (!donoOk) return { erro: 'plano_dono', mensagem: 'Esse plano não é do número deste cliente.' };
    const dow = dataLocal(data).getDay();
    const diasPermitidos = new Set(String(assinatura.plano.diasSemana || '0,1,2,3,4,5,6').split(',').map(Number));
    if (!diasPermitidos.has(dow)) return { erro: 'plano_dia', mensagem: 'Esse plano não pode ser usado nesse dia da semana.' };
    if (ids.length !== 1) return { erro: 'plano_servico', mensagem: 'Pelo plano dá pra marcar um serviço por vez.' };
    if (assinatura.plano.servicoId && assinatura.plano.servicoId !== ids[0]) {
      return { erro: 'plano_servico', mensagem: 'Esse plano cobre outro serviço.' };
    }
  }
  const usaPlano = !!assinatura;

  const dur = duracaoComEncaixe(servicos.map((s) => ({ duracaoMin: s.duracaoMin, ehEncaixe: s.ehEncaixe })), { efetiva: true });

  // O horário tem que estar na lista de LIVRES (isso já barra passado, fora do
  // expediente e horários ocupados). Dupla proteção junto do conflito na transação.
  const livres = await horariosDisponiveis(barbeiro.id, data, dur);
  if (!livres.includes(hora)) {
    return { erro: 'indisponivel', mensagem: 'Esse horário não está disponível. Ofereça outro dos horários livres.' };
  }

  const dataDate = dataLocal(data);
  const iniNovo = paraMinutos(hora);
  const fimNovo = iniNovo + dur;
  // Plano cobre o atendimento -> valor 0 (igual ao painel).
  const valorTotal = usaPlano ? 0 : servicos.reduce((s, x) => s + x.valor, 0);
  const telNorm = normalizarTelefone(clienteTelefone) || String(clienteTelefone).trim();

  try {
    const ag = await prisma.$transaction(async (tx) => {
      // RE-CHECA dentro da transação: fecha a janela de corrida (dois pedidos
      // simultâneos para o mesmo horário).
      if (await temConflito(tx, barbeariaId, barbeiro.id, dataDate, iniNovo, fimNovo)) {
        const e = new Error('CONFLITO');
        e.conflito = true;
        throw e;
      }
      let clienteId = null;
      if (usaPlano) {
        clienteId = assinatura.clienteId; // o dono do plano
      } else if (telNorm) {
        // Procura por VARIANTES (com/sem 55, com/sem o 9) pra reaproveitar o
        // cadastro existente — não duplica o perfil por causa do 9º dígito. Só cria
        // se realmente não existir, salvando no formato correto (com o 9).
        let cliente = await tx.cliente.findFirst({ where: { barbeariaId, telefone: { in: variantesTelefone(telNorm) } } });
        if (!cliente) cliente = await tx.cliente.create({ data: { barbeariaId, nome: clienteNome, telefone: telefoneCanonicoBR(telNorm) || telNorm } });
        clienteId = cliente.id;
      }
      return tx.agendamento.create({
        data: {
          barbeariaId,
          usuarioId: barbeiro.id,
          clienteId,
          clientePlanoId: usaPlano ? assinatura.id : null,
          clienteNome,
          clienteTelefone,
          data: dataDate,
          horaInicio: hora,
          status: 'agendado',
          valorTotal,
          itens: { create: servicos.map((s) => ({ servicoId: s.id, valorUnitario: usaPlano ? 0 : s.valor, quantidade: 1 })) },
        },
      });
    });
    // Consome 1 uso (limitado; ilimitado não desconta). Fora da transação de
    // propósito, igual ao painel — não faz parte da corrida pelo horário.
    if (usaPlano) await planoServ.ajustarUso(assinatura.id, -1);
    return {
      ok: true,
      agendamentoId: ag.id,
      barbeiro: barbeiro.nome,
      servicos: servicos.map((s) => s.nome),
      data,
      hora,
      valorCentavos: valorTotal,
      usouPlano: usaPlano,
      plano: usaPlano ? assinatura.plano.nome : null,
      usosRestantes: usaPlano ? (assinatura.usosRestantes === null ? 'ilimitado' : Math.max(0, assinatura.usosRestantes - 1)) : null,
    };
  } catch (e) {
    if (e.conflito) return { erro: 'conflito', mensagem: 'Esse horário acabou de ser ocupado. Ofereça outro.' };
    console.error('[agendamentoSeguro] falha:', e.message);
    return { erro: 'falha', mensagem: 'Não consegui concluir a marcação agora.' };
  }
}

// Duração efetiva (em min) de um agendamento a partir dos itens já carregados.
function duracaoDoAgendamento(ag) {
  return duracaoComEncaixe(
    ag.itens.map((it) => ({ duracaoMin: it.servico.duracaoMin, ehEncaixe: it.servico.ehEncaixe, quantidade: it.quantidade })),
    { efetiva: true }
  );
}

// REAGENDA um atendimento para outra data/hora. Mesmas garantias do criar:
//  - barbeariaId vem do CHAMADOR (servidor), nunca da IA;
//  - `usuarioIdRestrito` (barbeiro não-admin) obriga que o agendamento seja DELE;
//  - re-checa conflito DENTRO de uma transação, EXCLUINDO o próprio agendamento;
//  - barra passado e horário fora do expediente.
async function reagendarAgendamento(barbeariaId, dados) {
  const { agendamentoId, novaData, novaHora, usuarioIdRestrito } = dados || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(novaData || '')) || !/^\d{2}:\d{2}$/.test(String(novaHora || ''))) {
    return { erro: 'entrada', mensagem: 'Data ou horário em formato inválido.' };
  }
  const where = { id: Number(agendamentoId), barbeariaId };
  if (usuarioIdRestrito) where.usuarioId = usuarioIdRestrito;
  const ag = await prisma.agendamento.findFirst({ where, include: { itens: { include: { servico: true } } } });
  if (!ag) return { erro: 'nao_encontrado', mensagem: 'Agendamento não encontrado (ou não é seu).' };
  if (ag.status === 'cancelado') return { erro: 'cancelado', mensagem: 'Esse agendamento está cancelado.' };
  if (ag.status === 'concluido') return { erro: 'concluido', mensagem: 'Esse atendimento já foi concluído.' };

  const dur = duracaoDoAgendamento(ag);
  const grade = await todosHorarios(ag.usuarioId, novaData, dur);
  const slot = grade.find((s) => s.hora === novaHora);
  if (!slot) return { erro: 'fora', mensagem: 'Esse horário está fora do expediente do barbeiro nesse dia.' };

  const dataDate = dataLocal(novaData);
  const iniNovo = paraMinutos(novaHora);
  const fimNovo = iniNovo + dur;
  const agora = new Date();
  if (dataDate.toDateString() === agora.toDateString() && iniNovo <= agora.getHours() * 60 + agora.getMinutes()) {
    return { erro: 'passado', mensagem: 'Esse horário já passou. Escolha um mais tarde.' };
  }

  try {
    const atualizado = await prisma.$transaction(async (tx) => {
      const existentes = await tx.agendamento.findMany({
        where: { barbeariaId, usuarioId: ag.usuarioId, data: dataDate, status: { not: 'cancelado' }, id: { not: ag.id } },
        include: { itens: { include: { servico: true } } },
      });
      const conflita = existentes.some((o) => {
        const ini = paraMinutos(o.horaInicio);
        const d = duracaoDoAgendamento(o);
        return iniNovo < ini + d && ini < fimNovo;
      });
      if (conflita) { const e = new Error('CONFLITO'); e.conflito = true; throw e; }
      return tx.agendamento.update({ where: { id: ag.id }, data: { data: dataDate, horaInicio: novaHora } });
    });
    return { ok: true, agendamentoId: atualizado.id, data: novaData, hora: novaHora, clienteNome: ag.clienteNome };
  } catch (e) {
    if (e.conflito) return { erro: 'conflito', mensagem: 'Esse horário já está ocupado. Ofereça outro.' };
    console.error('[agendamentoSeguro.reagendar] falha:', e.message);
    return { erro: 'falha', mensagem: 'Não consegui reagendar agora.' };
  }
}

// CANCELA um atendimento (status -> cancelado). Mesmo escopo de tenant/papel.
// Não apaga nada (mantém histórico); concluído não pode ser cancelado por aqui.
async function cancelarAgendamento(barbeariaId, dados) {
  const { agendamentoId, usuarioIdRestrito } = dados || {};
  const where = { id: Number(agendamentoId), barbeariaId };
  if (usuarioIdRestrito) where.usuarioId = usuarioIdRestrito;
  const ag = await prisma.agendamento.findFirst({ where });
  if (!ag) return { erro: 'nao_encontrado', mensagem: 'Agendamento não encontrado (ou não é seu).' };
  if (ag.status === 'cancelado') return { ok: true, jaCancelado: true, clienteNome: ag.clienteNome };
  if (ag.status === 'concluido') return { erro: 'concluido', mensagem: 'Esse atendimento já foi concluído; não dá pra cancelar por aqui.' };
  await prisma.agendamento.update({ where: { id: ag.id }, data: { status: 'cancelado' } });
  // Se foi agendado por PLANO, devolve 1 uso (limitado; ilimitado não muda) —
  // mesma regra do cancelamento pelo painel.
  if (ag.clientePlanoId) await planoServ.ajustarUso(ag.clientePlanoId, +1);
  return { ok: true, agendamentoId: ag.id, clienteNome: ag.clienteNome, usoDevolvido: !!ag.clientePlanoId };
}

module.exports = { criarAgendamento, reagendarAgendamento, cancelarAgendamento };

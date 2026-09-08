// Criação SEGURA de agendamento pela secretária de IA (Fase 3.4). É o limite que
// "não pode ser passado de jeito nenhum" TRAVADO NO CÓDIGO: nunca marca em cima
// de outro atendimento. Reproduz as mesmas regras do agendamento manual do painel
// (services/disponibilidade + conflito por sobreposição), mas:
//   - RE-CHECA o conflito DENTRO de uma transação (dois clientes pedindo o mesmo
//     horário ao mesmo tempo não conseguem marcar os dois);
//   - exige que o horário esteja REALMENTE livre (barra passado / fora do expediente);
//   - o barbeariaId e o telefone do cliente vêm do CHAMADOR (servidor), nunca da IA.
const prisma = require('../config/db');
const { dataLocal, paraMinutos, duracaoComEncaixe, horariosDisponiveis } = require('./disponibilidade');
const { normalizarTelefone } = require('../utils/telefone');

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
  const { usuarioId, servicoIds, data, hora, clienteNome, clienteTelefone } = dados || {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) || !/^\d{2}:\d{2}$/.test(String(hora || ''))) {
    return { erro: 'entrada', mensagem: 'Data ou horário em formato inválido.' };
  }
  if (!clienteNome || !clienteTelefone) return { erro: 'cliente', mensagem: 'Falta o nome ou o telefone do cliente.' };

  const barbeiro = await prisma.usuario.findFirst({ where: { id: Number(usuarioId), barbeariaId, ativo: true } });
  if (!barbeiro) return { erro: 'barbeiro', mensagem: 'Barbeiro inválido.' };

  const ids = (servicoIds || []).map(Number).filter(Boolean);
  const servicos = await prisma.servico.findMany({ where: { id: { in: ids }, barbeariaId, ativo: true } });
  if (!servicos.length) return { erro: 'servico', mensagem: 'Serviço inválido.' };

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
  const valorTotal = servicos.reduce((s, x) => s + x.valor, 0);
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
      if (telNorm) {
        let cliente = await tx.cliente.findUnique({ where: { barbeariaId_telefone: { barbeariaId, telefone: telNorm } } });
        if (!cliente) cliente = await tx.cliente.create({ data: { barbeariaId, nome: clienteNome, telefone: telNorm } });
        clienteId = cliente.id;
      }
      return tx.agendamento.create({
        data: {
          barbeariaId,
          usuarioId: barbeiro.id,
          clienteId,
          clienteNome,
          clienteTelefone,
          data: dataDate,
          horaInicio: hora,
          status: 'agendado',
          valorTotal,
          itens: { create: servicos.map((s) => ({ servicoId: s.id, valorUnitario: s.valor, quantidade: 1 })) },
        },
      });
    });
    return {
      ok: true,
      agendamentoId: ag.id,
      barbeiro: barbeiro.nome,
      servicos: servicos.map((s) => s.nome),
      data,
      hora,
      valorCentavos: valorTotal,
    };
  } catch (e) {
    if (e.conflito) return { erro: 'conflito', mensagem: 'Esse horário acabou de ser ocupado. Ofereça outro.' };
    console.error('[agendamentoSeguro] falha:', e.message);
    return { erro: 'falha', mensagem: 'Não consegui concluir a marcação agora.' };
  }
}

module.exports = { criarAgendamento };

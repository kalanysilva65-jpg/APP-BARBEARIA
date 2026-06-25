// Serviço de caixa: regras reutilizadas pelo controller de caixa e pela agenda.
// Centraliza o toggle "caixa automático" e a entrada gerada por agendamento concluído.
const prisma = require('../config/db');

// Lê o toggle de entrada automática (configuracoes.caixa_automatico).
async function caixaAutomaticoLigado() {
  const c = await prisma.configuracao.findUnique({ where: { chave: 'caixa_automatico' } });
  return c ? c.valor === 'true' : false;
}

// Liga/desliga o toggle.
async function definirCaixaAutomatico(ligado) {
  const valor = ligado ? 'true' : 'false';
  await prisma.configuracao.upsert({
    where: { chave: 'caixa_automatico' },
    update: { valor },
    create: { chave: 'caixa_automatico', valor },
  });
}

// Cria a entrada automática de um agendamento concluído (idempotente: não duplica).
async function registrarEntradaAgendamento(agendamento) {
  if (!agendamento || agendamento.valorTotal <= 0) return;
  const existente = await prisma.caixa.findFirst({ where: { agendamentoId: agendamento.id } });
  if (existente) return; // já lançado
  await prisma.caixa.create({
    data: {
      descricao: 'Atendimento — ' + agendamento.clienteNome,
      valor: agendamento.valorTotal,
      tipo: 'entrada',
      data: new Date(),
      agendamentoId: agendamento.id,
      categoriaId: null,
    },
  });
}

// Remove a entrada automática vinculada a um agendamento (ao cancelar/reabrir).
async function removerEntradaAgendamento(agendamentoId) {
  await prisma.caixa.deleteMany({ where: { agendamentoId } });
}

module.exports = {
  caixaAutomaticoLigado,
  definirCaixaAutomatico,
  registrarEntradaAgendamento,
  removerEntradaAgendamento,
};

// Serviço de caixa: regras reutilizadas pelo controller de caixa e pela agenda.
// Centraliza o toggle "caixa automático" e a entrada gerada por agendamento concluído.
// Tudo é escopado por barbearia (multi-tenant).
const prisma = require('../config/db');

// Lê o toggle de entrada automática (configuracoes.caixa_automatico) de uma barbearia.
async function caixaAutomaticoLigado(barbeariaId) {
  if (!barbeariaId) return false;
  const c = await prisma.configuracao.findUnique({
    where: { barbeariaId_chave: { barbeariaId, chave: 'caixa_automatico' } },
  });
  return c ? c.valor === 'true' : false;
}

// Liga/desliga o toggle de uma barbearia.
async function definirCaixaAutomatico(barbeariaId, ligado) {
  const valor = ligado ? 'true' : 'false';
  await prisma.configuracao.upsert({
    where: { barbeariaId_chave: { barbeariaId, chave: 'caixa_automatico' } },
    update: { valor },
    create: { barbeariaId, chave: 'caixa_automatico', valor },
  });
}

// Cria a entrada automática de um agendamento concluído (idempotente: não duplica).
// A barbearia vem do próprio agendamento.
async function registrarEntradaAgendamento(agendamento) {
  if (!agendamento || agendamento.valorTotal <= 0) return;
  const existente = await prisma.caixa.findFirst({ where: { agendamentoId: agendamento.id } });
  if (existente) return; // já lançado
  await prisma.caixa.create({
    data: {
      barbeariaId: agendamento.barbeariaId,
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

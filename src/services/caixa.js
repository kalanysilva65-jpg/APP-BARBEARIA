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
  // Sem configuracao gravada, LIGADO: e o comportamento esperado, e o
  // contrario fazia a barbearia parecer nao faturar nada.
  return c ? c.valor === 'true' : true;
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

// Cria a(s) entrada(s) automática(s) de um agendamento concluído.
//
// Quando a conta foi dividida (ex.: R$20 em dinheiro + R$25 no crédito), gera
// UMA entrada por forma de pagamento, e não uma só com o total. É isso que
// mantém o relatório "por forma de pagamento" correto — ele agrupa pela coluna
// `formaPagamento` do caixa, então um lançamento único com o total inteiro
// atribuiria toda a receita a uma forma só.
//
// Recria em vez de só ignorar quando já existe: reconcluir um atendimento com
// pagamento diferente precisa atualizar o caixa, senão fica valendo a divisão
// antiga.
async function registrarEntradaAgendamento(agendamento) {
  if (!agendamento) return;

  // Limpa ANTES de decidir se há o que lançar.
  //
  // A versão anterior saía cedo quando o total era zero, e nesse caminho o
  // `deleteMany` lá embaixo nunca rodava: zerar o total de um atendimento já
  // concluído (ou remover o último item) deixava a entrada ANTIGA pendurada no
  // caixa. A receita do dia ficava inflada por um lançamento que não
  // correspondia a nada, sem erro nenhum no log.
  await prisma.caixa.deleteMany({ where: { agendamentoId: agendamento.id } });
  if (agendamento.valorTotal <= 0) return;

  const partes = await prisma.pagamentoAgendamento.findMany({
    where: { agendamentoId: agendamento.id },
    orderBy: { id: 'asc' },
  });

  // Sem divisão registrada (fluxo antigo ou nenhuma forma escolhida): mantém o
  // comportamento de sempre — uma entrada com o total.
  const linhas = partes.length
    ? partes.map((p) => ({
        valor: p.valor,
        formaPagamento: p.formaPagamento,
        sufixo: p.parcelas > 1 ? ` (${p.parcelas}x)` : '',
      }))
    : [{ valor: agendamento.valorTotal, formaPagamento: agendamento.formaPagamento || null, sufixo: '' }];

  await prisma.caixa.deleteMany({ where: { agendamentoId: agendamento.id } });
  const agora = new Date();
  for (const l of linhas) {
    if (l.valor <= 0) continue;
    await prisma.caixa.create({
      data: {
        barbeariaId: agendamento.barbeariaId,
        descricao: 'Atendimento — ' + agendamento.clienteNome + l.sufixo,
        valor: l.valor,
        tipo: 'entrada',
        data: agora,
        agendamentoId: agendamento.id,
        categoriaId: null,
        formaPagamento: l.formaPagamento,
      },
    });
  }
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

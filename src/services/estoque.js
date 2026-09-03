// Baixa/devolução automática de estoque a partir da "receita" de consumo de
// cada serviço/produto (ServicoInsumo). Chamado pela conclusão do atendimento:
//  - concluir  -> aplicarConsumo(id, -1)  (baixa)
//  - reabrir/cancelar um concluído -> aplicarConsumo(id, +1) (devolve)
//
// A baixa é por item do atendimento: para cada item, cada insumo cai
// `insumo.quantidade * item.quantidade` unidades do estoque ligado. Um mesmo
// item de estoque usado por vários serviços do atendimento é somado uma vez só.
const prisma = require('./../config/db');

// sinal: -1 baixa (consome), +1 devolve.
async function aplicarConsumo(agendamentoId, sinal) {
  const itens = await prisma.agendamentoItem.findMany({
    where: { agendamentoId },
    include: { servico: { include: { insumos: true } } },
  });

  // Acumula o delta por item de estoque (evita duas escritas no mesmo item).
  const deltaPorEstoque = new Map();
  for (const it of itens) {
    for (const ins of it.servico.insumos) {
      const delta = sinal * ins.quantidade * (it.quantidade || 1);
      deltaPorEstoque.set(ins.estoqueId, (deltaPorEstoque.get(ins.estoqueId) || 0) + delta);
    }
  }
  if (!deltaPorEstoque.size) return;

  for (const [estoqueId, delta] of deltaPorEstoque) {
    if (!delta) continue;
    const item = await prisma.estoque.findUnique({ where: { id: estoqueId } });
    if (!item) continue; // item de estoque apagado no meio do caminho: ignora
    const nova = Math.max(0, item.quantidade + delta); // nunca deixa negativo
    if (nova !== item.quantidade) {
      await prisma.estoque.update({ where: { id: estoqueId }, data: { quantidade: nova } });
    }
  }
}

module.exports = { aplicarConsumo };

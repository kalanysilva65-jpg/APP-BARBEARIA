// Serviço de planos: regras de vigência, busca por telefone e ajuste de usos.
const prisma = require('../config/db');

// Uma assinatura está vigente se ativa, dentro da validade e (se limitada) com usos.
function vigente(assinatura, hoje = new Date()) {
  const h = new Date(hoje);
  h.setHours(0, 0, 0, 0);
  return (
    assinatura.ativo &&
    new Date(assinatura.dataFim) >= h &&
    (assinatura.usosRestantes === null || assinatura.usosRestantes > 0)
  );
}

// Busca o cliente pelo telefone normalizado (dentro de uma barbearia) e retorna
// suas assinaturas vigentes.
async function assinaturasVigentesPorTelefone(barbeariaId, telefoneNorm) {
  if (!telefoneNorm || !barbeariaId) return { cliente: null, assinaturas: [] };
  const cliente = await prisma.cliente.findUnique({
    where: { barbeariaId_telefone: { barbeariaId, telefone: telefoneNorm } },
    include: { planos: { include: { plano: { include: { servico: true } } }, orderBy: { dataFim: 'desc' } } },
  });
  if (!cliente) return { cliente: null, assinaturas: [] };
  return { cliente, assinaturas: cliente.planos.filter((a) => vigente(a)) };
}

// Soma/desconta usos de uma assinatura (ilimitada não é afetada). Não deixa negativo.
async function ajustarUso(clientePlanoId, delta) {
  if (!clientePlanoId) return;
  const a = await prisma.clientePlano.findUnique({ where: { id: clientePlanoId } });
  if (!a || a.usosRestantes === null) return; // ilimitado: não mexe nos usos
  await prisma.clientePlano.update({
    where: { id: clientePlanoId },
    data: { usosRestantes: Math.max(0, a.usosRestantes + delta) },
  });
}

module.exports = { vigente, assinaturasVigentesPorTelefone, ajustarUso };

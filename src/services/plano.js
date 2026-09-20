// Serviço de planos: regras de vigência, busca por telefone e ajuste de usos.
const prisma = require('../config/db');
const { normalizarTelefone, variantesTelefone } = require('../utils/telefone');

// "AAAA-MM-DD" -> Date à meia-noite local (sem depender de disponibilidade).
function _dataLocal(s) {
  const [a, m, d] = String(s).split('-').map(Number);
  return new Date(a, m - 1, d);
}

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

// Busca as assinaturas VIGENTES de um telefone por VARIANTES (com/sem 55, com/sem
// o 9). Igual à busca da secretária — não perde o plano por causa do 9º dígito.
async function assinaturasVigentesPorVariantes(barbeariaId, telefone) {
  const telNorm = normalizarTelefone(telefone);
  if (!telNorm || !barbeariaId) return [];
  const clientes = await prisma.cliente.findMany({
    where: { barbeariaId, telefone: { in: variantesTelefone(telNorm) } },
    include: { planos: { include: { plano: { include: { servico: true } } }, orderBy: { dataFim: 'desc' } } },
  });
  const out = [];
  for (const c of clientes) for (const a of c.planos) if (vigente(a)) out.push(a);
  return out;
}

// Valida um plano para um agendamento e diz QUAL serviço da seleção ele cobre
// (sai de graça, consome 1 uso). Mesmas regras nos dois caminhos (secretária e
// painel). `servicos`: [{ id, valor }]. Retorna { assinatura, cobertoId } ou
// { erro, mensagem }. Plano de serviço específico cobre esse serviço (tem que
// estar na seleção); plano "qualquer serviço" cobre o MAIS CARO da seleção.
async function avaliarCobertura({ clientePlanoId, barbeariaId, clienteTelefone, servicos, data }) {
  const ids = (servicos || []).map((s) => s.id);
  const assinatura = await prisma.clientePlano.findFirst({
    where: { id: Number(clientePlanoId), barbeariaId },
    include: { plano: true, cliente: true },
  });
  if (!assinatura) return { erro: 'plano', mensagem: 'Plano não encontrado.' };
  if (!vigente(assinatura)) return { erro: 'plano_invalido', mensagem: 'Esse plano não está mais ativo (sem usos ou fora da validade).' };
  const donoOk = variantesTelefone(clienteTelefone).includes(normalizarTelefone(assinatura.cliente.telefone));
  if (!donoOk) return { erro: 'plano_dono', mensagem: 'Esse plano não é do número deste cliente.' };
  const dow = _dataLocal(data).getDay();
  const diasPermitidos = new Set(String(assinatura.plano.diasSemana || '0,1,2,3,4,5,6').split(',').map(Number));
  if (!diasPermitidos.has(dow)) return { erro: 'plano_dia', mensagem: 'Esse plano não pode ser usado nesse dia da semana.' };
  let cobertoId;
  if (assinatura.plano.servicoId) {
    if (!ids.includes(assinatura.plano.servicoId)) return { erro: 'plano_servico', mensagem: 'Esse plano cobre outro serviço.' };
    cobertoId = assinatura.plano.servicoId;
  } else {
    cobertoId = servicos.slice().sort((a, b) => b.valor - a.valor)[0].id;
  }
  return { assinatura, cobertoId };
}

module.exports = { vigente, assinaturasVigentesPorTelefone, assinaturasVigentesPorVariantes, avaliarCobertura, ajustarUso };

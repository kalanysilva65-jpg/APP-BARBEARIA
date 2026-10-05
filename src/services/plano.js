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

// Cota por serviço: mapa {servicoId: restantes} da assinatura (null = plano sem
// cota por serviço, vale só o total `usosRestantes`).
function mapaUsos(a) {
  if (!a || !a.usosPorServico) return null;
  try { const m = JSON.parse(a.usosPorServico); return m && typeof m === 'object' ? m : null; } catch (_) { return null; }
}

// Mapa inicial de uma assinatura nova a partir do plano (precisa de `servicos`).
// Só existe se o plano é limitado e algum serviço tem cota própria.
function mapaInicial(plano) {
  if (!plano || plano.tipo !== 'limitado') return null;
  const com = (plano.servicos || []).filter((x) => x.usos);
  if (!com.length) return null;
  const m = {};
  for (const x of com) m[x.servicoId] = x.usos;
  return m;
}

// Ids de serviço com cota sobrando (null = assinatura sem cota por serviço).
function servicosComSaldo(a) {
  const m = mapaUsos(a);
  return m ? Object.keys(m).filter((k) => m[k] > 0).map(Number) : null;
}

// Saldo por serviço como lista [{ id, nome, restantes }] (vazio = sem cota por
// serviço). Precisa do plano com `servicos: { include: { servico: true } }`.
function usosPorServicoLista(a) {
  const m = mapaUsos(a);
  if (!m) return [];
  const nomes = {};
  for (const x of (a.plano && a.plano.servicos) || []) nomes[x.servicoId] = x.servico ? x.servico.nome : null;
  return Object.keys(m).map((k) => ({ id: Number(k), nome: nomes[k] || ('Serviço ' + k), restantes: m[k] }));
}

// Texto curto: "Corte: 1 · Barba: 3" (ou null sem cota por serviço).
function usosPorServicoTexto(a) {
  const l = usosPorServicoLista(a);
  return l.length ? l.map((x) => x.nome + ': ' + x.restantes).join(' · ') : null;
}

// Serviços (ids) que um agendamento por plano cobriu: os itens a R$ 0.
async function servicosCobertosDe(agendamentoId) {
  const itens = await prisma.agendamentoItem.findMany({ where: { agendamentoId, valorUnitario: 0 }, select: { servicoId: true } });
  return itens.map((i) => i.servicoId);
}

// Busca o cliente pelo telefone normalizado (dentro de uma barbearia) e retorna
// suas assinaturas vigentes.
async function assinaturasVigentesPorTelefone(barbeariaId, telefoneNorm) {
  if (!telefoneNorm || !barbeariaId) return { cliente: null, assinaturas: [] };
  const cliente = await prisma.cliente.findUnique({
    where: { barbeariaId_telefone: { barbeariaId, telefone: telefoneNorm } },
    include: { planos: { include: { plano: { include: { servicos: { include: { servico: true } } } } }, orderBy: { dataFim: 'desc' } } },
  });
  if (!cliente) return { cliente: null, assinaturas: [] };
  return { cliente, assinaturas: cliente.planos.filter((a) => vigente(a)) };
}

// Soma/desconta usos de uma assinatura (ilimitada não é afetada). Não deixa negativo.
// Com cota por serviço, `servicoIds` diz QUAIS serviços consomem/devolvem 1 uso
// cada; o total (`usosRestantes`) é sempre a soma das cotas.
async function ajustarUso(clientePlanoId, delta, servicoIds) {
  if (!clientePlanoId) return;
  const a = await prisma.clientePlano.findUnique({ where: { id: clientePlanoId } });
  if (!a || a.usosRestantes === null) return; // ilimitado: não mexe nos usos
  const mapa = mapaUsos(a);
  if (mapa && servicoIds && servicoIds.length) {
    for (const id of servicoIds) if (id in mapa) mapa[id] = Math.max(0, mapa[id] + delta);
    const total = Object.values(mapa).reduce((s, n) => s + n, 0);
    await prisma.clientePlano.update({ where: { id: clientePlanoId }, data: { usosPorServico: JSON.stringify(mapa), usosRestantes: total } });
    return;
  }
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
    include: { planos: { include: { plano: { include: { servicos: { include: { servico: true } } } } }, orderBy: { dataFim: 'desc' } } },
  });
  const out = [];
  for (const c of clientes) for (const a of c.planos) if (vigente(a)) out.push(a);
  return out;
}

// Serviços que o plano cobre, como [{ id, nome }] (vazio = qualquer serviço).
// Precisa do plano carregado com `servicos: { include: { servico: true } }`.
function servicosDoPlano(plano) {
  return ((plano && plano.servicos) || []).map((x) => ({ id: x.servicoId, nome: x.servico ? x.servico.nome : null }));
}

// Valida um plano para um agendamento e diz QUAIS serviços da seleção ele cobre
// (sai de graça, consome 1 uso). Mesmas regras nos dois caminhos (secretária e
// painel). `servicos`: [{ id, valor }]. Retorna { assinatura, cobertoId } ou
// { erro, mensagem }. Plano de serviço específico cobre esse serviço (tem que
// estar na seleção); plano "qualquer serviço" cobre o MAIS CARO da seleção.
async function avaliarCobertura({ clientePlanoId, barbeariaId, clienteTelefone, servicos, data }) {
  const ids = (servicos || []).map((s) => s.id);
  const assinatura = await prisma.clientePlano.findFirst({
    where: { id: Number(clientePlanoId), barbeariaId },
    include: { plano: { include: { servicos: true } }, cliente: true },
  });
  if (!assinatura) return { erro: 'plano', mensagem: 'Plano não encontrado.' };
  if (!vigente(assinatura)) return { erro: 'plano_invalido', mensagem: 'Esse plano não está mais ativo (sem usos ou fora da validade).' };
  const donoOk = variantesTelefone(clienteTelefone).includes(normalizarTelefone(assinatura.cliente.telefone));
  if (!donoOk) return { erro: 'plano_dono', mensagem: 'Esse plano não é do número deste cliente.' };
  const dow = _dataLocal(data).getDay();
  const diasPermitidos = new Set(String(assinatura.plano.diasSemana || '0,1,2,3,4,5,6').split(',').map(Number));
  if (!diasPermitidos.has(dow)) return { erro: 'plano_dia', mensagem: 'Esse plano não pode ser usado nesse dia da semana.' };
  // Plano com serviços escolhidos: TODOS os serviços da seleção que estão na
  // lista do plano saem de graça (os demais somam normal). Sem lista ("qualquer
  // serviço"): cobre só o MAIS CARO da seleção.
  const doPlano = (assinatura.plano.servicos || []).map((x) => x.servicoId);
  let cobertosIds;
  if (doPlano.length) {
    cobertosIds = ids.filter((id) => doPlano.includes(id));
    if (!cobertosIds.length) return { erro: 'plano_servico', mensagem: 'Esse plano não cobre esses serviços.' };
    const saldo = servicosComSaldo(assinatura);
    if (saldo) {
      const comSaldo = cobertosIds.filter((id) => saldo.includes(id));
      if (!comSaldo.length) return { erro: 'plano_servico', mensagem: 'Os usos do plano para esses serviços já acabaram.' };
      cobertosIds = comSaldo;
    }
  } else {
    cobertosIds = [servicos.slice().sort((a, b) => b.valor - a.valor)[0].id];
  }
  return { assinatura, cobertoId: cobertosIds[0], cobertosIds };
}

module.exports = { usosPorServicoLista, usosPorServicoTexto, mapaUsos, mapaInicial, servicosComSaldo, servicosCobertosDe, servicosDoPlano, vigente, assinaturasVigentesPorTelefone, assinaturasVigentesPorVariantes, avaliarCobertura, ajustarUso };

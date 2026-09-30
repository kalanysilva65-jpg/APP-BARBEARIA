// Preço de serviço POR BARBEIRO — regra ÚNICA de leitura.
//
// Cada serviço tem um preço padrão (Servico.valor). A barbearia pode definir um
// preço diferente para um barbeiro específico (ServicoPrecoBarbeiro). Sem essa
// linha, vale o padrão.
//
// TODO lugar que transforma serviço em preço (agendamento público, app do
// cliente, agenda manual, secretária, FAQ) passa por aqui — senão o WhatsApp
// cobraria um valor e o painel outro.
const prisma = require('../config/db');

// Mapa "servicoId:usuarioId" -> centavos, para os serviços pedidos.
async function mapaPrecos(servicoIds, usuarioId) {
  const ids = (servicoIds || []).map(Number).filter(Boolean);
  if (!ids.length) return new Map();
  const where = { servicoId: { in: ids } };
  if (usuarioId) where.usuarioId = Number(usuarioId);
  const linhas = await prisma.servicoPrecoBarbeiro.findMany({ where });
  return new Map(linhas.map((l) => [l.servicoId + ':' + l.usuarioId, l.valor]));
}

// Preço de UM serviço para UM barbeiro, dado um mapa já carregado.
function precoDe(servico, usuarioId, mapa) {
  const v = mapa && usuarioId ? mapa.get(servico.id + ':' + Number(usuarioId)) : undefined;
  return v !== undefined ? v : servico.valor;
}

// Devolve CÓPIAS dos serviços com `valor` = preço daquele barbeiro. Assim o
// código que já soma `s.valor` continua igual, só recebendo os serviços por aqui.
async function comPrecoDoBarbeiro(servicos, usuarioId) {
  if (!usuarioId || !servicos || !servicos.length) return servicos || [];
  const mapa = await mapaPrecos(servicos.map((s) => s.id), usuarioId);
  return servicos.map((s) => ({ ...s, valor: precoDe(s, usuarioId, mapa) }));
}

// Faixa de preço de cada serviço entre os barbeiros ATIVOS: { [servicoId]: {min, max} }.
// Usado onde o barbeiro ainda não foi escolhido ("a partir de R$ X").
async function faixasDePreco(barbeariaId, servicos) {
  const faixas = {};
  for (const s of servicos || []) faixas[s.id] = { min: s.valor, max: s.valor };
  if (!servicos || !servicos.length) return faixas;
  const ativos = await prisma.usuario.findMany({ where: { barbeariaId, ativo: true }, select: { id: true } });
  const ids = new Set(ativos.map((u) => u.id));
  const mapa = await mapaPrecos(servicos.map((s) => s.id));
  for (const s of servicos) {
    // Preço efetivo de cada barbeiro ativo (quem não tem linha usa o padrão).
    const valores = [...ids].map((uid) => precoDe(s, uid, mapa));
    if (valores.length) faixas[s.id] = { min: Math.min(...valores), max: Math.max(...valores) };
  }
  return faixas;
}

// Total dos serviços para CADA barbeiro: { [usuarioId]: centavos }.
async function totaisPorBarbeiro(servicos, barbeiroIds) {
  const mapa = await mapaPrecos(servicos.map((s) => s.id));
  const out = {};
  for (const uid of barbeiroIds) out[uid] = servicos.reduce((soma, s) => soma + precoDe(s, uid, mapa), 0);
  return out;
}

// Grava os preços por barbeiro vindos do formulário do serviço
// (campos `precoBarbeiro_<usuarioId>` em reais). Vazio = usa o padrão (apaga a linha).
async function salvarPrecosDoForm(barbeariaId, servicoId, body, reaisParaCentavos) {
  const barbeiros = await prisma.usuario.findMany({ where: { barbeariaId }, select: { id: true } });
  for (const { id: uid } of barbeiros) {
    const campo = body['precoBarbeiro_' + uid];
    if (campo === undefined) continue; // formulário não trouxe esse barbeiro
    const valor = String(campo).trim() === '' ? null : reaisParaCentavos(campo);
    const chave = { servicoId_usuarioId: { servicoId, usuarioId: uid } };
    if (valor === null) {
      await prisma.servicoPrecoBarbeiro.deleteMany({ where: { servicoId, usuarioId: uid } });
    } else {
      await prisma.servicoPrecoBarbeiro.upsert({
        where: chave,
        create: { barbeariaId, servicoId, usuarioId: uid, valor },
        update: { valor },
      });
    }
  }
}

module.exports = { mapaPrecos, precoDe, comPrecoDoBarbeiro, faixasDePreco, totaisPorBarbeiro, salvarPrecosDoForm };

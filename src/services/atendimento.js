// Atendimento / caixa de entrada (Fase 3.2). Persiste as conversas de WhatsApp e
// orquestra: mensagem do cliente entra -> grava -> se a IA estiver ativa naquela
// conversa, a secretária responde -> grava a resposta. Em 3.3 o webhook do
// WhatsApp chama `receberMensagemCliente` e o envio real sai por aqui também.
//
// Todo acesso é ESCOPADO por barbeariaId (multi-tenant). O `enviarWhatsApp` é um
// stub por enquanto (a integração real com a Cloud API entra na 3.3).
const prisma = require('../config/db');
const secretaria = require('./secretaria');
const { normalizarTelefone } = require('../utils/telefone');

const HIST_MAX = 30; // mensagens recentes enviadas à IA como contexto

function previa(texto) {
  return (texto || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// Modo da secretária por barbearia (config 'secretaria_modo'; padrão 'cortavo').
async function modoDaBarbearia(barbeariaId) {
  const c = await prisma.configuracao.findUnique({
    where: { barbeariaId_chave: { barbeariaId, chave: 'secretaria_modo' } },
  }).catch(() => null);
  return c && c.valor === 'terceiros' ? 'terceiros' : 'cortavo';
}

// Converte o histórico salvo no formato da API, unindo mensagens seguidas do
// mesmo lado (a API alterna user/assistant) e garantindo que começa em 'user'.
function historicoParaIA(mensagens) {
  const arr = [];
  for (const m of mensagens) {
    const role = m.autor === 'cliente' ? 'user' : 'assistant';
    if (arr.length && arr[arr.length - 1].role === role) {
      arr[arr.length - 1].content += '\n' + m.texto;
    } else {
      arr.push({ role, content: m.texto });
    }
  }
  while (arr.length && arr[0].role !== 'user') arr.shift();
  return arr;
}

// STUB da 3.3: aqui sairá a chamada real para a WhatsApp Cloud API.
async function enviarWhatsApp(conversa, texto) {
  // 3.3: POST para a Graph API com o número (conversa.clienteTelefone) e `texto`.
  return true;
}

// Mensagem RECEBIDA de um cliente. Cria/atualiza a conversa, grava, e deixa a IA
// responder se a conversa estiver com IA ativa. Ponto único chamado pelo webhook.
async function receberMensagemCliente(barbeariaId, { telefone, nome, texto }) {
  const tel = normalizarTelefone(telefone) || String(telefone || '').trim();
  if (!tel || !texto) return { erro: 'Dados insuficientes.' };

  let conversa = await prisma.conversa.findUnique({
    where: { barbeariaId_clienteTelefone: { barbeariaId, clienteTelefone: tel } },
  });
  if (!conversa) {
    conversa = await prisma.conversa.create({
      data: { barbeariaId, clienteTelefone: tel, clienteNome: nome || null },
    });
  } else if (nome && !conversa.clienteNome) {
    await prisma.conversa.update({ where: { id: conversa.id }, data: { clienteNome: nome } });
  }

  await prisma.mensagem.create({ data: { conversaId: conversa.id, autor: 'cliente', texto } });
  await prisma.conversa.update({
    where: { id: conversa.id },
    data: { ultimaPrevia: previa(texto), ultimaMensagemEm: new Date(), naoLidas: { increment: 1 }, status: 'aberta' },
  });

  // Só responde automaticamente se a IA estiver ativa NESTA conversa e configurada.
  if (!conversa.iaAtiva || !secretaria.habilitada()) {
    return { conversaId: conversa.id, respostaIA: null };
  }

  const msgs = await prisma.mensagem.findMany({
    where: { conversaId: conversa.id },
    orderBy: { criadoEm: 'asc' },
    take: HIST_MAX,
  });
  const b = await prisma.barbearia.findUnique({ where: { id: barbeariaId } });
  const ctx = {
    barbeariaId,
    modo: await modoDaBarbearia(barbeariaId),
    nomeBarbearia: b ? b.nome : 'a barbearia',
    config: { linkAgendamento: b && b.slug ? `https://agenda.exemplo.com/${b.slug}` : null },
  };

  let respostaIA = null;
  try {
    const { texto: resp } = await secretaria.responder(ctx, historicoParaIA(msgs));
    respostaIA = resp;
    await prisma.mensagem.create({ data: { conversaId: conversa.id, autor: 'ia', texto: resp } });
    await prisma.conversa.update({
      where: { id: conversa.id },
      data: { ultimaPrevia: previa(resp), ultimaMensagemEm: new Date() },
    });
    await enviarWhatsApp(conversa, resp);
  } catch (e) {
    console.error('[atendimento] IA falhou:', e.message);
  }
  return { conversaId: conversa.id, respostaIA };
}

// Lista de conversas da barbearia (mais recentes primeiro).
async function listarConversas(barbeariaId) {
  return prisma.conversa.findMany({
    where: { barbeariaId, status: 'aberta' },
    orderBy: { ultimaMensagemEm: 'desc' },
    take: 50,
  });
}

// Abre uma conversa (escopada), zera não-lidas e devolve as mensagens.
async function abrirConversa(barbeariaId, conversaId) {
  const conversa = await prisma.conversa.findFirst({ where: { id: Number(conversaId), barbeariaId } });
  if (!conversa) return null;
  if (conversa.naoLidas > 0) {
    await prisma.conversa.update({ where: { id: conversa.id }, data: { naoLidas: 0 } });
    conversa.naoLidas = 0;
  }
  const mensagens = await prisma.mensagem.findMany({ where: { conversaId: conversa.id }, orderBy: { criadoEm: 'asc' } });
  return { conversa, mensagens };
}

// A EQUIPE responde pela caixa de entrada (sai como autor 'humano').
async function responderComoHumano(barbeariaId, conversaId, texto) {
  const conversa = await prisma.conversa.findFirst({ where: { id: Number(conversaId), barbeariaId } });
  if (!conversa || !texto) return null;
  await prisma.mensagem.create({ data: { conversaId: conversa.id, autor: 'humano', texto } });
  await prisma.conversa.update({
    where: { id: conversa.id },
    data: { ultimaPrevia: previa(texto), ultimaMensagemEm: new Date() },
  });
  await enviarWhatsApp(conversa, texto);
  return conversa;
}

// Liga/desliga a IA numa conversa (assumir = desligar; devolver = ligar).
async function definirIA(barbeariaId, conversaId, ativa) {
  const conversa = await prisma.conversa.findFirst({ where: { id: Number(conversaId), barbeariaId } });
  if (!conversa) return null;
  return prisma.conversa.update({ where: { id: conversa.id }, data: { iaAtiva: !!ativa } });
}

module.exports = {
  receberMensagemCliente,
  listarConversas,
  abrirConversa,
  responderComoHumano,
  definirIA,
};

// Atendimento / caixa de entrada (Fase 3.2) + LGPD e tetos de custo (Fase 3.5).
// Orquestra: mensagem do cliente entra -> grava -> (se cabível) a secretária
// responde. Em 3.3 o webhook do WhatsApp chama `receberMensagemCliente` e o envio
// real sai por `enviarWhatsApp` (hoje stub).
//
// Camadas de proteção (3.5), na ordem em que agem antes de gastar IA:
//   1) OPT-OUT: "SAIR"/"PARAR" pausa a IA na conversa e chama um humano.
//   2) KILL SWITCH global (env SECRETARIA_DESLIGADA=1).
//   3) FREIO ANTI-ABUSO: flood de um mesmo número não roda a IA à toa.
//   4) TETO mensal por barbearia: ao estourar, a IA pausa no mês (humanos seguem).
// Tudo escopado por barbeariaId (multi-tenant).
const prisma = require('../config/db');
const secretaria = require('./secretaria');
const { normalizarTelefone } = require('../utils/telefone');

const HIST_MAX = 30; // mensagens recentes enviadas à IA como contexto
const TETO_PADRAO = 1500; // respostas de IA por mês por barbearia (config: secretaria_teto_mes)
const ABUSO_MAX_HORA = 20; // msgs do MESMO cliente numa 1h antes de a IA recuar
const RETENCAO_MESES = 12; // conversas mais antigas que isso são apagadas (LGPD)
const PALAVRAS_OPTOUT = ['SAIR', 'PARAR', 'STOP', 'CANCELAR'];

function previa(texto) {
  return (texto || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}
function competenciaAtual() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
// Opt-out só quando a mensagem INTEIRA é a palavra-chave (evita falso positivo
// tipo "quero sair do plano").
function ehOptOut(texto) {
  const limpo = (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  return PALAVRAS_OPTOUT.includes(limpo);
}

async function lerConfig(barbeariaId, chave, padrao) {
  const c = await prisma.configuracao
    .findUnique({ where: { barbeariaId_chave: { barbeariaId, chave } } })
    .catch(() => null);
  return c ? c.valor : padrao;
}
async function modoDaBarbearia(barbeariaId) {
  const v = await lerConfig(barbeariaId, 'secretaria_modo', 'cortavo');
  return v === 'terceiros' ? 'terceiros' : 'cortavo';
}

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
  return true;
}

// Grava uma mensagem de saída (IA ou sistema), atualiza a prévia e envia.
async function emitir(conversa, autor, texto) {
  await prisma.mensagem.create({ data: { conversaId: conversa.id, autor, texto } });
  await prisma.conversa.update({ where: { id: conversa.id }, data: { ultimaPrevia: previa(texto), ultimaMensagemEm: new Date() } });
  await enviarWhatsApp(conversa, texto);
}

// --- Teto de custo (uso mensal de IA por barbearia) ---
async function estadoTeto(barbeariaId) {
  const competencia = competenciaAtual();
  const teto = parseInt(await lerConfig(barbeariaId, 'secretaria_teto_mes', ''), 10) || TETO_PADRAO;
  const uso = await prisma.usoIA.findUnique({ where: { barbeariaId_competencia: { barbeariaId, competencia } } });
  const respostas = uso ? uso.respostas : 0;
  return { competencia, teto, respostas, atingido: respostas >= teto, avisado: uso ? uso.avisadoTeto : false };
}
async function registrarUso(barbeariaId, competencia, usage) {
  await prisma.usoIA.upsert({
    where: { barbeariaId_competencia: { barbeariaId, competencia } },
    create: { barbeariaId, competencia, respostas: 1, tokensEntrada: usage?.input || 0, tokensSaida: usage?.output || 0 },
    update: { respostas: { increment: 1 }, tokensEntrada: { increment: usage?.input || 0 }, tokensSaida: { increment: usage?.output || 0 } },
  });
}
async function marcarAvisadoTeto(barbeariaId, competencia) {
  await prisma.usoIA.upsert({
    where: { barbeariaId_competencia: { barbeariaId, competencia } },
    create: { barbeariaId, competencia, respostas: 0, avisadoTeto: true },
    update: { avisadoTeto: true },
  });
}

// Freio anti-abuso: quantas mensagens do cliente nesta conversa na última 1h.
async function floodNaConversa(conversaId) {
  const umaHora = new Date(Date.now() - 60 * 60 * 1000);
  return prisma.mensagem.count({ where: { conversaId, autor: 'cliente', criadoEm: { gte: umaHora } } });
}

// Mensagem RECEBIDA de um cliente. Ponto único chamado pelo webhook (3.3).
async function receberMensagemCliente(barbeariaId, { telefone, nome, texto }) {
  const tel = normalizarTelefone(telefone) || String(telefone || '').trim();
  if (!tel || !texto) return { erro: 'Dados insuficientes.' };

  // Cria/atualiza a conversa e grava a mensagem do cliente.
  let conversa = await prisma.conversa.findUnique({
    where: { barbeariaId_clienteTelefone: { barbeariaId, clienteTelefone: tel } },
  });
  const nova = !conversa;
  if (!conversa) {
    conversa = await prisma.conversa.create({ data: { barbeariaId, clienteTelefone: tel, clienteNome: nome || null } });
  } else if (nome && !conversa.clienteNome) {
    await prisma.conversa.update({ where: { id: conversa.id }, data: { clienteNome: nome } });
  }
  await prisma.mensagem.create({ data: { conversaId: conversa.id, autor: 'cliente', texto } });
  await prisma.conversa.update({
    where: { id: conversa.id },
    data: { ultimaPrevia: previa(texto), ultimaMensagemEm: new Date(), naoLidas: { increment: 1 }, status: 'aberta' },
  });

  // (1) OPT-OUT: pausa a IA nesta conversa e chama um humano.
  if (ehOptOut(texto)) {
    await prisma.conversa.update({ where: { id: conversa.id }, data: { iaAtiva: false } });
    await emitir(conversa, 'ia', 'Tudo bem! 🙂 Vou avisar a equipe para continuar seu atendimento por aqui.');
    return { conversaId: conversa.id, optOut: true };
  }

  // Portões que impedem a IA de responder automaticamente.
  const ligada = secretaria.habilitada() && process.env.SECRETARIA_DESLIGADA !== '1';
  if (!conversa.iaAtiva || !ligada) return { conversaId: conversa.id, respostaIA: null };

  // Aviso de privacidade (LGPD) — só na PRIMEIRA mensagem da conversa.
  if (nova) {
    const b0 = await prisma.barbearia.findUnique({ where: { id: barbeariaId } });
    const link = await lerConfig(barbeariaId, 'secretaria_privacidade_link', null);
    let aviso = `Você fala com o atendimento virtual 🤖 da ${b0 ? b0.nome : 'nossa barbearia'}. Usamos seus dados apenas para te atender e agendar.`;
    if (link) aviso += ` Política de privacidade: ${link}`;
    aviso += ` (Se preferir um atendente, é só escrever SAIR.)`;
    await emitir(conversa, 'ia', aviso);
  }

  // (3) Freio anti-abuso.
  if ((await floodNaConversa(conversa.id)) > ABUSO_MAX_HORA) {
    return { conversaId: conversa.id, respostaIA: null, freado: true };
  }

  // (4) Teto mensal por barbearia.
  const teto = await estadoTeto(barbeariaId);
  if (teto.atingido) {
    if (!teto.avisado) await marcarAvisadoTeto(barbeariaId, teto.competencia);
    return { conversaId: conversa.id, respostaIA: null, tetoAtingido: true };
  }

  // Monta contexto e responde.
  const msgs = await prisma.mensagem.findMany({ where: { conversaId: conversa.id }, orderBy: { criadoEm: 'asc' }, take: HIST_MAX });
  const b = await prisma.barbearia.findUnique({ where: { id: barbeariaId } });
  const ctx = {
    barbeariaId,
    modo: await modoDaBarbearia(barbeariaId),
    nomeBarbearia: b ? b.nome : 'a barbearia',
    permitirAgendar: true,
    clienteTelefone: conversa.clienteTelefone,
    clienteNome: conversa.clienteNome || null,
    regrasExtras: await lerConfig(barbeariaId, 'secretaria_regras', null),
    config: { linkAgendamento: (await lerConfig(barbeariaId, 'secretaria_link', null)) || (b && b.slug ? `https://agenda.exemplo.com/${b.slug}` : null) },
  };

  let respostaIA = null;
  try {
    const { texto: resp, usage } = await secretaria.responder(ctx, historicoParaIA(msgs));
    respostaIA = resp;
    await emitir(conversa, 'ia', resp);
    await registrarUso(barbeariaId, teto.competencia, usage);
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

async function responderComoHumano(barbeariaId, conversaId, texto) {
  const conversa = await prisma.conversa.findFirst({ where: { id: Number(conversaId), barbeariaId } });
  if (!conversa || !texto) return null;
  await emitir(conversa, 'humano', texto);
  return conversa;
}

async function definirIA(barbeariaId, conversaId, ativa) {
  const conversa = await prisma.conversa.findFirst({ where: { id: Number(conversaId), barbeariaId } });
  if (!conversa) return null;
  return prisma.conversa.update({ where: { id: conversa.id }, data: { iaAtiva: !!ativa } });
}

// LGPD: exclui uma conversa e todas as suas mensagens (direito de exclusão).
// Escopado por barbearia — nunca apaga de outro tenant.
async function excluirConversa(barbeariaId, conversaId) {
  const r = await prisma.conversa.deleteMany({ where: { id: Number(conversaId), barbeariaId } });
  return r.count > 0;
}

// LGPD: retenção. Apaga conversas sem atividade há mais de RETENCAO_MESES.
// Roda por um cron (scripts/retencao-conversas.js). Retorna quantas apagou.
async function expirarConversasAntigas() {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - RETENCAO_MESES);
  const r = await prisma.conversa.deleteMany({ where: { ultimaMensagemEm: { lt: limite } } });
  return r.count;
}

module.exports = {
  receberMensagemCliente,
  listarConversas,
  abrirConversa,
  responderComoHumano,
  definirIA,
  excluirConversa,
  expirarConversasAntigas,
  estadoTeto,
};

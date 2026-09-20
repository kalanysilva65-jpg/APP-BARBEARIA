// Webhook da WhatsApp Cloud API (Meta) — Fase 3.3.
//  - GET  /webhooks/whatsapp : handshake de verificação (Meta confere o token).
//  - POST /webhooks/whatsapp : recebe as mensagens dos clientes.
// É rota PÚBLICA (a Meta chama de fora, sem sessão). A autenticidade do POST é
// garantida pela assinatura X-Hub-Signature-256 (HMAC com o App Secret).
const crypto = require('crypto');
const atendimento = require('../services/atendimento');
const whatsapp = require('../services/whatsapp');
const transcricao = require('../services/transcricao');

// GET: a Meta manda hub.mode/hub.verify_token/hub.challenge. Se o token bate com
// o nosso WHATSAPP_VERIFY_TOKEN, devolvemos o challenge (texto puro) e ela ativa.
function verificar(req, res) {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (modo === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(String(challenge || ''));
  }
  return res.sendStatus(403);
}

// Confere a assinatura do corpo (garante que o POST veio mesmo da Meta).
// Sem META_APP_SECRET: em DEV liberamos (facilita testar no localhost); em
// PRODUÇÃO é FAIL-CLOSED — rejeitamos e logamos alto. Aceitar sem conferir
// deixaria qualquer um injetar mensagem forjada em nome de um cliente, então é
// melhor o webhook recusar (erro visível no log) do que passar inseguro em
// silêncio — mesma lógica do guard do SESSION_SECRET no server.js.
function assinaturaValida(req) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    const ehProducao = process.env.NODE_ENV === 'production' || !!process.env.APP_DOMAIN;
    if (ehProducao) {
      console.log('[SEGURANÇA] META_APP_SECRET ausente em produção — webhook do WhatsApp REJEITADO (fail-closed). Defina o segredo no .env do VPS e reinicie.');
      return false;
    }
    return true; // dev: sem segredo, não bloqueia
  }
  const assinatura = req.get('x-hub-signature-256') || '';
  if (!req.rawBody) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado));
  } catch (e) {
    return false;
  }
}

// POST: a Meta exige um 200 RÁPIDO, senão reenvia. Então respondemos na hora e
// processamos em segundo plano (a mensagem é persistida logo no início do
// receberMensagemCliente, então nada se perde mesmo se a IA demorar/falhar).
async function receber(req, res) {
  if (!assinaturaValida(req)) return res.sendStatus(403);
  res.sendStatus(200);

  try {
    const body = req.body || {};
    if (body.object !== 'whatsapp_business_account') return;
    for (const entry of body.entry || []) {
      for (const ch of entry.changes || []) {
        if (ch.field !== 'messages') continue; // ignora 'statuses' (entregue/lido) etc.
        const value = ch.value || {};
        const pnid = value.metadata && value.metadata.phone_number_id;
        const barbeariaId = await whatsapp.barbeariaPorPhoneNumberId(pnid);
        if (!barbeariaId) {
          console.log('[webhook] phone_number_id sem barbearia vinculada:', pnid);
          continue;
        }
        const nomeContato =
          (value.contacts && value.contacts[0] && value.contacts[0].profile && value.contacts[0].profile.name) || null;
        for (const msg of value.messages || []) {
          if (msg.type === 'text' && msg.text) {
            atendimento
              .receberMensagemCliente(barbeariaId, { telefone: msg.from, nome: nomeContato, texto: msg.text.body })
              .catch((e) => console.error('[webhook] processar mensagem:', e.message));
          } else if (msg.type === 'audio' && msg.audio && msg.audio.id) {
            // Áudio de voz: baixa, transcreve (Groq/Whisper) e trata como texto.
            // Feito em segundo plano pra não segurar o 200 pra Meta.
            processarAudio(barbeariaId, msg, nomeContato)
              .catch((e) => console.error('[webhook] processar áudio:', e.message));
          }
          // outros tipos (imagem, documento, etc.) por ora são ignorados
        }
        // Status de entrega (sent/delivered/read/failed). Logamos só as FALHAS,
        // que trazem o motivo (ex.: número inválido, fora da janela de 24h).
        for (const st of value.statuses || []) {
          if (st.status === 'failed') {
            console.log('[webhook] entrega FALHOU para', st.recipient_id, '-', JSON.stringify(st.errors || []));
          }
        }
      }
    }
  } catch (e) {
    console.error('[webhook] erro ao processar:', e.message);
  }
}

// Baixa o áudio de voz, transcreve e manda o TEXTO pro fluxo normal. Se não der
// (sem chave, falha de download/transcrição), pede educadamente o texto — sem IA.
async function processarAudio(barbeariaId, msg, nomeContato) {
  const midia = await whatsapp.baixarMidia(barbeariaId, msg.audio.id);
  const texto = midia ? await transcricao.transcrever(midia.buffer, midia.mimeType) : null;
  if (!texto) {
    await whatsapp.enviarTexto(
      barbeariaId,
      msg.from,
      'Recebi seu áudio 🎧 mas não consegui entender direito agora. Pode me mandar por texto, por favor?'
    ).catch(() => {});
    return;
  }
  console.log('[webhook] áudio transcrito:', JSON.stringify(texto.slice(0, 80)));
  await atendimento.receberMensagemCliente(barbeariaId, { telefone: msg.from, nome: nomeContato, texto });
}

module.exports = { verificar, receber };

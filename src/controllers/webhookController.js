// Webhook da WhatsApp Cloud API (Meta) — Fase 3.3.
//  - GET  /webhooks/whatsapp : handshake de verificação (Meta confere o token).
//  - POST /webhooks/whatsapp : recebe as mensagens dos clientes.
// É rota PÚBLICA (a Meta chama de fora, sem sessão). A autenticidade do POST é
// garantida pela assinatura X-Hub-Signature-256 (HMAC com o App Secret).
const crypto = require('crypto');
const atendimento = require('../services/atendimento');
const whatsapp = require('../services/whatsapp');

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
// Sem META_APP_SECRET configurado (ambiente de dev), não bloqueia — mas em
// produção o segredo DEVE estar setado.
function assinaturaValida(req) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true;
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
          if (msg.type !== 'text' || !msg.text) continue; // por ora, só texto
          atendimento
            .receberMensagemCliente(barbeariaId, { telefone: msg.from, nome: nomeContato, texto: msg.text.body })
            .catch((e) => console.error('[webhook] processar mensagem:', e.message));
        }
      }
    }
  } catch (e) {
    console.error('[webhook] erro ao processar:', e.message);
  }
}

module.exports = { verificar, receber };

// Cliente da WhatsApp Cloud API (Meta) — envio real de mensagens da secretária.
//
// As credenciais são POR BARBEARIA (multi-tenant), guardadas em `Configuracao`:
//   whatsapp_phone_number_id  -> id do número na Meta (identifica a barbearia no webhook)
//   whatsapp_token            -> token de acesso (System User; permanente)
// Assim cada barbearia tem o seu próprio número. A versão da API é global (env).
const prisma = require('../config/db');

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

// Número para ENVIO: responde SEMPRE ao `wa_id`/`from` exatamente como a Meta
// entregou (só tira símbolos). No Brasil o WhatsApp normaliza o número (às vezes
// sem o 9º dígito); esse valor é o ID canônico da conta e é o único que entrega.
// NÃO adicione/remova o 9 — fazer isso faz a Meta ACEITAR e não ENTREGAR.
function numeroParaEnvio(valor) {
  return String(valor || '').replace(/\D/g, '');
}

// Credenciais de uma barbearia (ou nulos se ainda não configurou).
async function credenciais(barbeariaId) {
  const cfgs = await prisma.configuracao.findMany({
    where: { barbeariaId, chave: { in: ['whatsapp_phone_number_id', 'whatsapp_token'] } },
  });
  const mapa = {};
  cfgs.forEach((c) => { mapa[c.chave] = c.valor; });
  return { phoneNumberId: mapa.whatsapp_phone_number_id || null, token: mapa.whatsapp_token || null };
}

// Descobre de qual barbearia é um phone_number_id recebido no webhook.
// (É a chave que liga a mensagem recebida ao tenant certo.)
async function barbeariaPorPhoneNumberId(pnid) {
  if (!pnid) return null;
  const c = await prisma.configuracao.findFirst({ where: { chave: 'whatsapp_phone_number_id', valor: String(pnid) } });
  return c ? c.barbeariaId : null;
}

// Envia uma mensagem de TEXTO para um número (formato internacional, só dígitos).
// Engole as próprias falhas (loga) — um erro de envio não pode derrubar o fluxo.
async function enviarTexto(barbeariaId, para, texto) {
  const { phoneNumberId, token } = await credenciais(barbeariaId);
  if (!phoneNumberId || !token) {
    console.log('[whatsapp] barbearia', barbeariaId, 'sem credenciais — envio ignorado.');
    return { ok: false, motivo: 'sem_credenciais' };
  }
  const url = `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numeroParaEnvio(para),
        type: 'text',
        text: { body: String(texto).slice(0, 4096), preview_url: false },
      }),
    });
    if (!r.ok) {
      const errTxt = await r.text().catch(() => '');
      console.log('[whatsapp] envio falhou', r.status, errTxt.slice(0, 300));
      return { ok: false, status: r.status };
    }
    return { ok: true };
  } catch (e) {
    console.log('[whatsapp] erro de rede no envio:', e.message);
    return { ok: false, erro: e.message };
  }
}

// Envia um TEMPLATE aprovado (mensagem que a barbearia INICIA — ex.: lembrete).
// Diferente do texto livre: fora da janela de 24h só template aprovado passa, e
// ele TEM custo (utilidade). `params` são os valores do corpo ({{1}},{{2}},...),
// na ordem. Engole as próprias falhas (loga).
async function enviarTemplate(barbeariaId, para, nomeTemplate, idioma, params) {
  const { phoneNumberId, token } = await credenciais(barbeariaId);
  if (!phoneNumberId || !token) {
    console.log('[whatsapp] barbearia', barbeariaId, 'sem credenciais — template ignorado.');
    return { ok: false, motivo: 'sem_credenciais' };
  }
  const componentes = [];
  const lista = (params || []).filter((p) => p != null && String(p) !== '');
  if (lista.length) {
    componentes.push({ type: 'body', parameters: lista.map((p) => ({ type: 'text', text: String(p) })) });
  }
  const url = `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numeroParaEnvio(para),
        type: 'template',
        template: {
          name: nomeTemplate,
          language: { code: idioma || 'pt_BR' },
          ...(componentes.length ? { components: componentes } : {}),
        },
      }),
    });
    if (!r.ok) {
      const errTxt = await r.text().catch(() => '');
      console.log('[whatsapp] template falhou', r.status, errTxt.slice(0, 300));
      return { ok: false, status: r.status };
    }
    return { ok: true };
  } catch (e) {
    console.log('[whatsapp] erro de rede no template:', e.message);
    return { ok: false, erro: e.message };
  }
}

module.exports = { credenciais, barbeariaPorPhoneNumberId, enviarTexto, enviarTemplate };

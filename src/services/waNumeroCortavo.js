// Conexão de número PELA CONTA DE WHATSAPP DA CORTAVO (a WABA dela) — caminho
// em que a cobrança da Meta cai TODA no cartão da Cortavo (pedido do dono,
// 2026-10-04). O cliente informa o número, recebe o código de SMS/ligação e o
// digita DENTRO do Cortavo: ninguém precisa mandar código pra ninguém.
//
// Fluxo (Graph API, token do System User da Cortavo):
//   1) POST /{WABA}/phone_numbers  {cc, phone_number, verified_name}  -> id do número
//   2) POST /{id}/request_code     {code_method, language}            -> SMS/ligação
//   3) POST /{id}/verify_code      {code}
//   4) POST /{id}/register         {messaging_product, pin}           -> ativa na Cloud API
//   5) POST /{WABA}/subscribed_apps                                    -> webhook (idempotente)
//   6) grava phone_number_id + modo na Configuracao da barbearia.
//
// ATENÇÃO: o número NÃO pode estar ativo num app do WhatsApp (mesma regra do
// "número novo"): registrar na API tira o número do app. Limites da Meta: 2
// números por portfólio (20 com a empresa verificada; até 50 por chamado).
//
// .env: WHATSAPP_WABA_ID (a WABA da Cortavo) e WHATSAPP_SYSTEM_TOKEN (token do
// System User com whatsapp_business_management + whatsapp_business_messaging).
const crypto = require('crypto');
const prisma = require('../config/db');

const GRAPH = 'https://graph.facebook.com';
const versao = () => process.env.WHATSAPP_API_VERSION || 'v21.0';

function disponivel() {
  return !!(process.env.WHATSAPP_WABA_ID && process.env.WHATSAPP_SYSTEM_TOKEN);
}

// "(11) 99999-8888", "+55 11 99999-8888", "5511999998888" -> { cc: '55', nacional: '11999998888' }
function separarNumero(entrada) {
  let d = String(entrada || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return { cc: '55', nacional: d.slice(2) };
  if (d.length === 10 || d.length === 11) return { cc: '55', nacional: d };
  return null; // outros países: por ora só Brasil
}

// Traduz os erros mais comuns da Meta para algo que o barbeiro entende.
function traduzirErro(j, status) {
  const e = (j && j.error) || {};
  const m = String(e.error_user_msg || e.message || '');
  if (/already (registered|exists|in use)|already.*linked/i.test(m)) {
    return 'Este número já está registrado em outra conta de WhatsApp (ou ainda ativo no app). Apague a conta no WhatsApp Business do celular e tente de novo.';
  }
  if (/maximum.*phone numbers|limit.*phone numbers/i.test(m)) {
    return 'Limite de números da conta da Cortavo atingido. Fale com o suporte da Cortavo.';
  }
  if (/display name|verified_name/i.test(m)) {
    return 'O nome de exibição foi recusado pela Meta. Use o nome real da barbearia, sem emojis e sem termos genéricos.';
  }
  if (/code.*(incorrect|invalid|wrong)|incorrect.*code/i.test(m)) return 'Código incorreto. Confira e tente de novo.';
  if (/too many|rate limit|try again/i.test(m)) return 'Muitas tentativas. Espere alguns minutos antes de pedir outro código.';
  return (m || 'erro ' + status).slice(0, 200);
}

async function chamar(caminho, corpo) {
  const r = await fetch(GRAPH + '/' + versao() + '/' + caminho, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_SYSTEM_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(traduzirErro(j, r.status));
    err.meta = j;
    throw err;
  }
  return j;
}

// Passos 1 e 2: cadastra o número na WABA da Cortavo e pede o código.
async function solicitarCodigo({ numero, nomeExibicao, metodo }) {
  if (!disponivel()) throw new Error('Conexão pela Cortavo não configurada no servidor.');
  const n = separarNumero(numero);
  if (!n) throw new Error('Número inválido. Use o formato (DDD) 99999-9999.');
  const nome = String(nomeExibicao || '').trim().slice(0, 60);
  if (nome.length < 3) throw new Error('Informe o nome de exibição da barbearia (como aparece para os clientes).');

  const waba = process.env.WHATSAPP_WABA_ID;
  const criado = await chamar(waba + '/phone_numbers', { cc: n.cc, phone_number: n.nacional, verified_name: nome });
  const phoneNumberId = criado.id;
  if (!phoneNumberId) throw new Error('A Meta não devolveu o id do número.');
  await chamar(phoneNumberId + '/request_code', { code_method: metodo === 'VOICE' ? 'VOICE' : 'SMS', language: 'pt_BR' });
  return { phoneNumberId, exibicao: '+' + n.cc + ' ' + n.nacional };
}

// Reenvio do código (outro método) para um número já cadastrado.
async function reenviarCodigo(phoneNumberId, metodo) {
  await chamar(phoneNumberId + '/request_code', { code_method: metodo === 'VOICE' ? 'VOICE' : 'SMS', language: 'pt_BR' });
}

// Passos 3 a 6: confere o código, ativa o número e liga na barbearia.
async function verificarEAtivar(barbeariaId, phoneNumberId, codigo, exibicao) {
  const c = String(codigo || '').replace(/\D/g, '');
  if (c.length !== 6) throw new Error('O código tem 6 dígitos.');
  await chamar(phoneNumberId + '/verify_code', { code: c });
  const pin = String(crypto.randomInt(100000, 1000000));
  await chamar(phoneNumberId + '/register', { messaging_product: 'whatsapp', pin });
  // Inscreve o app na WABA (já deve estar; é idempotente e garante o webhook).
  await fetch(GRAPH + '/' + versao() + '/' + process.env.WHATSAPP_WABA_ID + '/subscribed_apps', {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_SYSTEM_TOKEN },
  }).catch(() => {});

  const gravar = (chave, valor) => prisma.configuracao.upsert({
    where: { barbeariaId_chave: { barbeariaId, chave } },
    create: { barbeariaId, chave, valor: String(valor) },
    update: { valor: String(valor) },
  });
  await gravar('whatsapp_phone_number_id', phoneNumberId);
  await gravar('whatsapp_waba_id', process.env.WHATSAPP_WABA_ID);
  await gravar('whatsapp_pin', pin);
  await gravar('whatsapp_numero', exibicao || '');
  // Modo "cortavo": o token NÃO é copiado — whatsapp.credenciais() usa o do .env
  // (rotacionar o token no servidor vale pra todas as barbearias de uma vez).
  await gravar('whatsapp_modo', 'cortavo');
  await prisma.configuracao.deleteMany({ where: { barbeariaId, chave: 'whatsapp_token' } });
  return { numero: exibicao };
}

module.exports = { disponivel, separarNumero, solicitarCodigo, reenviarCodigo, verificarEAtivar };

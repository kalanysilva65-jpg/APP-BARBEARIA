// Transporte de avisos para o app iOS da App Store (APNs).
//
// Só o TRANSPORTE mora aqui. Quem recebe, o que é escrito e quando disparar
// continuam em services/notificacoes.js — este arquivo existe porque o iPhone
// não aceita Web Push dentro do app: o Capacitor roda em WKWebView, que não
// implementa a API de push do navegador. No Safari com o site na tela de
// início o Web Push funciona; dentro do app, não. Daí a necessidade do APNs.
//
// Configuração (tudo por variável de ambiente, nada versionado):
//   APNS_KEY_PATH   caminho do .p8 baixado do Apple Developer
//   APNS_KEY_ID     id da chave (aparece no nome do arquivo e no painel)
//   APNS_TEAM_ID    Team ID da conta de desenvolvedor
//   APNS_BUNDLE_ID  br.com.cortavo.app (o mesmo do capacitor.config.json)
//   APNS_PRODUCTION "true" na App Store; ausente/false em build de teste
//
// Sem essas variáveis o módulo fica inerte e diz que não está configurado — é
// o que permite o servidor rodar normalmente antes de a conta Apple existir.
const fs = require('fs');
const apn = require('@parse/node-apn');

const KEY_PATH = process.env.APNS_KEY_PATH || '';
const KEY_ID = process.env.APNS_KEY_ID || '';
const TEAM_ID = process.env.APNS_TEAM_ID || '';
const BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'br.com.cortavo.app';
const PRODUCAO = String(process.env.APNS_PRODUCTION || '').toLowerCase() === 'true';

let provedor = null;
let motivoInativo = 'APNs não configurado (faltam APNS_KEY_PATH/KEY_ID/TEAM_ID).';

if (KEY_PATH && KEY_ID && TEAM_ID) {
  if (!fs.existsSync(KEY_PATH)) {
    // Falhar alto aqui seria pior: derrubaria o app inteiro por causa de um
    // caminho errado numa funcionalidade acessória. Fica inativo e explicado.
    motivoInativo = 'APNs: arquivo da chave não encontrado em ' + KEY_PATH;
    console.error('[apns] ' + motivoInativo);
  } else {
    try {
      provedor = new apn.Provider({
        token: { key: KEY_PATH, keyId: KEY_ID, teamId: TEAM_ID },
        production: PRODUCAO,
      });
      motivoInativo = '';
    } catch (e) {
      motivoInativo = 'APNs: falha ao iniciar o provedor — ' + e.message;
      console.error('[apns] ' + motivoInativo);
    }
  }
}

function estaConfigurado() {
  return Boolean(provedor);
}

function porQueInativo() {
  return motivoInativo;
}

// Envia para UM token de aparelho iOS.
// Retorna { ok, removerToken } — `removerToken` avisa quem chamou que o
// aparelho não existe mais (app desinstalado), para a inscrição ser apagada,
// mesma regra do Web Push.
async function enviar(token, aviso) {
  if (!provedor) return { ok: false, removerToken: false };

  const nota = new apn.Notification();
  nota.topic = BUNDLE_ID;
  nota.alert = { title: aviso.titulo, body: aviso.corpo };
  nota.sound = 'default';
  // `threadId` agrupa os avisos do mesmo atendimento na central de
  // notificações, em vez de empilhar cópias — equivale ao `tag` do Web Push.
  nota.threadId = aviso.tag || 'cortavo';
  // O app lê isto ao ser aberto pelo aviso para saber que tela abrir.
  nota.payload = { url: aviso.url || '/painel/agenda' };
  // Sem prazo curto: um agendamento novo continua valendo se o celular estava
  // desligado por uma hora.
  nota.expiry = Math.floor(Date.now() / 1000) + 3600;

  try {
    const r = await provedor.send(nota, token);
    if (r.sent && r.sent.length) return { ok: true, removerToken: false };

    const falha = r.failed && r.failed[0];
    // 410 = token não é mais válido; "BadDeviceToken" idem.
    const morto =
      falha &&
      (String(falha.status) === '410' ||
        (falha.response && falha.response.reason === 'BadDeviceToken') ||
        (falha.response && falha.response.reason === 'Unregistered'));

    if (!morto && falha) {
      console.error('[apns] falha ao enviar:', falha.status, falha.response && falha.response.reason);
    }
    return { ok: false, removerToken: Boolean(morto) };
  } catch (e) {
    console.error('[apns] erro inesperado:', e.message);
    return { ok: false, removerToken: false };
  }
}

module.exports = { estaConfigurado, porQueInativo, enviar };

// Envio de avisos para os aparelhos da equipe (agendamento novo, cancelamento).
//
// Hoje funciona por Web Push (padrão do navegador, chaves VAPID). O app nativo
// da loja usará APNs/FCM, que muda só o TRANSPORTE: o resto — quem recebe, o
// que é escrito, quando disparar — já vive aqui e é reaproveitado. Por isso
// `enviarParaUsuario` decide pelo campo `plataforma` de cada aparelho em vez de
// assumir web.
//
// Regra de ouro deste arquivo: falha de notificação NUNCA derruba a ação que a
// disparou. Um push que não sai não pode impedir um agendamento de ser criado.
const webpush = require('web-push');
const prisma = require('../config/db');

const PUBLICA = process.env.VAPID_PUBLIC_KEY || '';
const PRIVADA = process.env.VAPID_PRIVATE_KEY || '';
const CONTATO = process.env.VAPID_SUBJECT || 'mailto:kalanysilva65@gmail.com';

const configurado = Boolean(PUBLICA && PRIVADA);
if (configurado) {
  webpush.setVapidDetails(CONTATO, PUBLICA, PRIVADA);
}

// A tela precisa saber se vale a pena oferecer o botão de ativar avisos.
function estaConfigurado() {
  return configurado;
}

function chavePublica() {
  return PUBLICA;
}

// Guarda (ou atualiza) a inscrição de um aparelho.
// O endpoint é único: reinscrever o mesmo aparelho atualiza em vez de duplicar.
async function registrarDispositivo(usuarioId, inscricao, plataforma) {
  const endpoint = String(inscricao && inscricao.endpoint ? inscricao.endpoint : '').trim();
  if (!endpoint) return null;

  const chaves = inscricao.keys || {};
  return prisma.dispositivoPush.upsert({
    where: { endpoint },
    update: { usuarioId, p256dh: chaves.p256dh || null, auth: chaves.auth || null, plataforma: plataforma || 'web' },
    create: {
      usuarioId,
      endpoint,
      p256dh: chaves.p256dh || null,
      auth: chaves.auth || null,
      plataforma: plataforma || 'web',
    },
  });
}

async function removerDispositivo(endpoint) {
  if (!endpoint) return;
  await prisma.dispositivoPush.deleteMany({ where: { endpoint: String(endpoint) } });
}

async function contarDispositivos(usuarioId) {
  return prisma.dispositivoPush.count({ where: { usuarioId } });
}

// Envia um aviso para todos os aparelhos de um usuário.
// Retorna quantos receberam — útil para testar e para o log.
async function enviarParaUsuario(usuarioId, aviso) {
  if (!configurado || !usuarioId) return 0;

  const aparelhos = await prisma.dispositivoPush.findMany({ where: { usuarioId } });
  if (!aparelhos.length) return 0;

  const carga = JSON.stringify({
    titulo: aviso.titulo,
    corpo: aviso.corpo,
    url: aviso.url || '/painel/agenda',
    tag: aviso.tag || 'cortavo',
  });

  let entregues = 0;
  for (const ap of aparelhos) {
    if (ap.plataforma !== 'web') continue; // APNs/FCM entram aqui quando existirem

    try {
      await webpush.sendNotification(
        { endpoint: ap.endpoint, keys: { p256dh: ap.p256dh, auth: ap.auth } },
        carga
      );
      entregues++;
    } catch (e) {
      // 404/410 = inscrição morta (app desinstalado, permissão revogada).
      // Limpar é o certo: insistir nela só gera erro para sempre.
      const status = e && e.statusCode;
      if (status === 404 || status === 410) {
        await prisma.dispositivoPush.deleteMany({ where: { endpoint: ap.endpoint } });
      } else {
        console.error('[push] falha ao enviar para o aparelho', ap.id, status || e.message);
      }
    }
  }
  return entregues;
}

// "2026-08-20" + "14:30" -> "20/08 às 14:30"
function quando(data, hora) {
  const d = data instanceof Date ? data : new Date(data);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes} às ${hora}`;
}

// Avisa o barbeiro que caiu um agendamento na agenda dele.
//
// Envolvido em try/catch porque é chamado no meio da confirmação do
// agendamento: se o push falhar, o cliente não pode receber um erro de um
// agendamento que na verdade foi criado.
async function notificarNovoAgendamento(agendamento, servicosLabel) {
  try {
    return await enviarParaUsuario(agendamento.usuarioId, {
      titulo: 'Novo agendamento',
      corpo: `${agendamento.clienteNome} — ${servicosLabel} · ${quando(agendamento.data, agendamento.horaInicio)}`,
      url: '/painel/agenda',
      tag: 'agendamento-' + agendamento.id,
    });
  } catch (e) {
    console.error('[push] erro ao notificar agendamento', agendamento.id, e.message);
    return 0;
  }
}

module.exports = {
  estaConfigurado,
  chavePublica,
  registrarDispositivo,
  removerDispositivo,
  contarDispositivos,
  enviarParaUsuario,
  notificarNovoAgendamento,
};

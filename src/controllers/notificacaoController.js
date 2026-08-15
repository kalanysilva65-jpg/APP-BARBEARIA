// Inscrição de aparelhos para receber avisos (agendamento novo).
//
// Tudo aqui age sobre o USUÁRIO LOGADO (req.session.usuario.id) e nunca sobre
// um id vindo do corpo da requisição — senão daria para inscrever o aparelho de
// um barbeiro na conta de outro, ou cancelar os avisos alheios.
const notif = require('../services/notificacoes');

// GET /painel/notificacoes/chave
// A chave pública VAPID, que o navegador precisa para criar a inscrição.
async function chave(req, res) {
  res.json({
    configurado: notif.estaConfigurado(),
    chave: notif.chavePublica(),
    aparelhos: await notif.contarDispositivos(req.session.usuario.id),
  });
}

// POST /painel/notificacoes/inscrever
async function inscrever(req, res) {
  if (!notif.estaConfigurado()) {
    return res.status(503).json({ erro: 'Avisos não configurados no servidor.' });
  }
  const inscricao = req.body && req.body.inscricao;
  if (!inscricao || !inscricao.endpoint) {
    return res.status(400).json({ erro: 'Inscrição inválida.' });
  }

  await notif.registrarDispositivo(req.session.usuario.id, inscricao, req.body.plataforma || 'web');
  res.json({ ok: true, aparelhos: await notif.contarDispositivos(req.session.usuario.id) });
}

// POST /painel/notificacoes/cancelar
async function cancelar(req, res) {
  await notif.removerDispositivo(req.body && req.body.endpoint);
  res.json({ ok: true, aparelhos: await notif.contarDispositivos(req.session.usuario.id) });
}

// POST /painel/notificacoes/testar — manda um aviso para os próprios aparelhos.
// Existe porque "ativei e não sei se funciona" é o estado normal de quem acabou
// de ligar avisos: sem isto, só um agendamento real provaria que está de pé.
async function testar(req, res) {
  const entregues = await notif.enviarParaUsuario(req.session.usuario.id, {
    titulo: 'Avisos ligados',
    corpo: 'É assim que um agendamento novo vai chegar aqui.',
    url: '/painel/agenda',
    tag: 'teste',
  });
  res.json({ ok: true, entregues });
}

module.exports = { chave, inscrever, cancelar, testar };

// Registro de avisos NATIVOS (APNs no iPhone, FCM no Android).
//
// Só faz alguma coisa quando a página está rodando DENTRO do app da loja
// (Capacitor). No navegador comum este arquivo não faz nada: lá quem cuida dos
// avisos é o Web Push, na tela de Perfil.
//
// Por que existe um caminho separado: o Capacitor roda a página num WKWebView,
// e o WKWebView não implementa a API de Web Push do navegador. O mesmo aviso
// que chega no Safari com o site na tela de início ficaria mudo dentro do app.
// O token nativo vai para a MESMA rota de inscrição, só que com
// `plataforma: 'ios'` — o servidor decide o transporte por esse campo.
(function () {
  var cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;

  var Push = cap.Plugins && cap.Plugins.PushNotifications;
  if (!Push) return;

  var plataforma = (cap.getPlatform && cap.getPlatform()) || 'ios';

  function registrarNoServidor(token) {
    return fetch('/painel/notificacoes/inscrever', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ inscricao: { endpoint: token }, plataforma: plataforma }),
    });
  }

  // O token chega por evento, não como retorno de `register()` — é assíncrono
  // do lado do sistema operacional.
  Push.addListener('registration', function (t) {
    if (t && t.value) registrarNoServidor(t.value);
  });

  Push.addListener('registrationError', function (e) {
    console.error('[push-nativo] falha ao registrar:', e && e.error);
  });

  // Tocar no aviso com o app fechado abre o app: leva para a tela combinada.
  Push.addListener('pushNotificationActionPerformed', function (acao) {
    var url =
      acao && acao.notification && acao.notification.data && acao.notification.data.url;
    if (url) window.location.href = url;
  });

  // A permissão é pedida uma vez; se já foi concedida antes, `register()` só
  // devolve o token de novo (tokens mudam, então re-registrar a cada abertura
  // é o comportamento correto, não desperdício).
  Push.checkPermissions()
    .then(function (p) {
      if (p.receive === 'granted') return { receive: 'granted' };
      return Push.requestPermissions();
    })
    .then(function (p) {
      if (p.receive === 'granted') return Push.register();
    })
    .catch(function (e) {
      console.error('[push-nativo] erro:', e && e.message);
    });
})();

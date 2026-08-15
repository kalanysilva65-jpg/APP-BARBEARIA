// Service worker — habilita a instalação como app (PWA) e recebe os avisos.
// O app precisa de conexão (network-first, sem cache offline).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Deixa o navegador tratar a requisição normalmente.
});

// --- Avisos (Web Push) -----------------------------------------------------
// Este handler roda com o app FECHADO — é o service worker, não a página. Por
// isso o texto do aviso vem pronto do servidor: aqui não há sessão nem acesso
// ao banco para montar nada.
self.addEventListener('push', (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch (e) {
    dados = {};
  }

  const titulo = dados.titulo || 'Cortavo';
  const opcoes = {
    body: dados.corpo || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // `tag` faz o aviso do MESMO agendamento substituir o anterior em vez de
    // empilhar — sem isso, reenvios viram uma pilha de avisos repetidos.
    tag: dados.tag || 'cortavo',
    data: { url: dados.url || '/painel/agenda' },
  };

  evento.waitUntil(self.registration.showNotification(titulo, opcoes));
});

// Tocar no aviso leva para a tela certa. Se o app já estiver aberto numa aba,
// reaproveita essa aba em vez de abrir outra.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || '/painel/agenda';

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.indexOf(self.location.origin) === 0 && 'focus' in j) {
          j.navigate(destino);
          return j.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});

// Service worker mínimo — habilita a instalação como app (PWA).
// O app precisa de conexão (network-first, sem cache offline).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Deixa o navegador tratar a requisição normalmente.
});

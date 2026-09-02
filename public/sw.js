const CACHE = 'controle-financeiro-shell-v1';
const URL_OFFLINE = '/offline.html';

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.add(URL_OFFLINE)));
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(self.clients.claim());
});

// Nenhum dado é cacheado — só a página de aviso. O app precisa de conexão
// real para mostrar números que fazem sentido (spec, seção 11: "sem
// sincronização offline... o app exibe aviso claro em vez de aparentar ter
// salvo algo").
self.addEventListener('fetch', (evento) => {
  if (evento.request.mode !== 'navigate') return;

  evento.respondWith(fetch(evento.request).catch(() => caches.match(URL_OFFLINE)));
});

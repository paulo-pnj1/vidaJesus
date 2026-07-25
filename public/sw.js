// Service Worker — Desafio Bíblico: Vida de Jesus
// Objetivo: permitir instalação como app (PWA) e um shell rápido/offline.
// Importante: os dados do jogo vêm do Firebase em tempo real, por isso
// NUNCA interceptamos pedidos ao Firebase/Firestore — esses vão sempre
// direto à rede, para que o placar e as perguntas fiquem sempre atualizados.

const VERSION = 'v1';
const CACHE_NAME = `desafio-biblico-${VERSION}`;

const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
];

// Domínios que nunca devem ser cacheados/interceptados (dados ao vivo)
const NEVER_INTERCEPT = [
  'firestore.googleapis.com',
  'firebaseio.com',
  'googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebase.googleapis.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {
        // Se algum recurso do shell falhar (ex: sem rede na 1ª instalação),
        // não bloqueia a instalação do service worker.
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('desafio-biblico-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Só tratamos pedidos GET do mesmo tipo de esquema (http/https)
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca interceptar chamadas em tempo real ao Firebase/Firestore/Auth
  if (NEVER_INTERCEPT.some((domain) => url.hostname.includes(domain))) {
    return;
  }

  // Navegação (abrir a app / trocar de painel): network-first,
  // com fallback para o cache/shell quando offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Recursos estáticos (JS, CSS, imagens, áudio, fontes locais):
  // stale-while-revalidate — responde rápido do cache e atualiza em segundo plano.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
  }
});

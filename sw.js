// sw.js — service worker: cache di lettura, online-first.
// Strategia v1 (da design): l'app carica dalla rete quando c'e; offline
// serve l'ultima versione in cache. Le modifiche richiedono rete.

const CACHE = 'mealprep-v14';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/ui/style.css',
  './src/ui/app.js',
  './src/ui/dom.js',
  './src/ui/icons.js',
  './src/ui/tracker.js',
  './src/ui/format.js',
  './src/ui/modal.js',
  './src/ui/screens/oggi.js',
  './src/ui/screens/piani.js',
  './src/ui/screens/banco.js',
  './src/ui/screens/repertorio.js',
  './src/ui/screens/storico.js',
  './src/core/solver.js',
  './src/core/day.js',
  './src/core/optimize.js',
  './src/data/store.js',
  './src/data/gasStore.js',
  './src/data/config.js',
  './src/data/seed.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Solo richieste allo stesso origine (l'app). GAS, Google Fonts ecc. vanno
  // dritte alla rete senza passare dal SW: mai servire dati backend dalla cache.
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});

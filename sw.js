// MealBlock service worker
const CACHE = "mealblock-v7";
const ASSETS = [
  "./", "./index.html", "./style.css", "./data.js", "./engine.js", "./app.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// NETWORK-FIRST per gli asset locali: se online prendi sempre la versione
// fresca (e aggiorna la cache); offline -> fallback alla cache. Così gli
// aggiornamenti del codice arrivano subito, senza dover svuotare la cache.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // font ecc.: lascia al browser
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});

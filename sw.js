// MealBlock v2 — service worker "kill-switch".
// La v2 NON usa cache offline (scelta di progetto: DB reale su GAS).
// Questo SW esiste solo per DISINSTALLARE il vecchio service worker v1
// (che serviva asset cachati e nascondeva gli aggiornamenti) e svuotare
// tutte le cache. Si auto-rimuove e ricarica i client una volta sola.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // svuota ogni cache lasciata dalla v1
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    // disattiva questo stesso SW
    await self.registration.unregister();
    // ricarica le pagine aperte così ripartono dalla rete, senza SW
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((c) => c.navigate(c.url));
  })());
});

// non intercetta nulla: tutte le richieste vanno in rete

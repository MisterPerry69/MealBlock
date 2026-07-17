// ============================================================
//  api.js — layer dati (astrae il trasporto verso GAS)
//  Nomi di dominio, non HTTP: api.bootstrap(), api.saveDay()...
//  In sviluppo/offline: MB_CONFIG.useMock -> dati da data.seed.js.
//  POST con text/plain (evita il preflight CORS di GAS); GET query string.
// ============================================================
(function () {
  "use strict";
  const CFG = window.MB_CONFIG || {};
  const SEED = window.MB_SEED;

  class ApiError extends Error {
    constructor(message, code) { super(message); this.code = code || "err"; }
  }

  // ---- trasporto reale (GAS) ----
  async function gasGet(action, params) {
    const url = new URL(CFG.gasUrl);
    url.searchParams.set("action", action);
    for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
    const res = await fetch(url.toString(), { method: "GET" });
    return unwrap(res);
  }
  async function gasPost(action, payload) {
    const res = await fetch(CFG.gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, payload }),
    });
    return unwrap(res);
  }
  async function unwrap(res) {
    let json;
    try { json = await res.json(); }
    catch { throw new ApiError("Risposta non valida dal server", "badjson"); }
    if (!json || json.ok !== true) {
      const e = (json && json.error) || {};
      throw new ApiError(e.message || "Errore server", e.code || "server");
    }
    return json.data;
  }

  // ---- coda scritture: coalescing + retry; stato -> store (badge sync) ----
  const sendWrite = (action, payload) =>
    CFG.useMock ? mockDelay() : gasPost(action, payload);
  const queue = window.MB_SYNC.createSyncQueue({
    send: sendWrite,
    // lo store è caricato dopo api.js: lookup pigro a runtime
    onState: (sync) => window.MB_STORE && window.MB_STORE.set({ sync }),
  });

  // ---- mock locale (design/dev senza GAS) ----
  const mockDelay = () => new Promise((r) => setTimeout(r, 120));
  function mockBootstrap() {
    return {
      foods: JSON.parse(JSON.stringify(SEED.FOODS)),
      blocks: JSON.parse(JSON.stringify(SEED.BLOCKS)),
      prefs: JSON.parse(JSON.stringify(SEED.PREFS)),
      currentWeek: null, // la genera il client (fase 3); per ora giornata al volo
    };
  }

  const api = {
    ApiError,
    async bootstrap() {
      if (CFG.useMock) { await mockDelay(); return mockBootstrap(); }
      let boot = await gasGet("getBootstrap");
      // primo avvio: foglio vuoto -> seed una-tantum dai dati locali, poi ri-leggo
      if (!boot.foods || Object.keys(boot.foods).length === 0) {
        await gasPost("seed", { foods: SEED.FOODS, blocks: SEED.BLOCKS, prefs: SEED.PREFS });
        boot = await gasGet("getBootstrap");
      }
      return boot;
    },
    async getWeek(id) {
      if (CFG.useMock) { await mockDelay(); return null; }
      return gasGet("getWeek", { id });
    },
    saveDay(day) { queue.enqueue("saveDay", day); },
    saveWeek(week) { queue.enqueue("saveWeek", week); },
    savePrefs(prefs) { queue.enqueue("savePrefs", prefs); },
    saveFood(food) { queue.enqueue("saveFood", food); },
    saveBlock(block) { queue.enqueue("saveBlock", block); },
    sync: queue,
    async logEvent(type, payload) {
      if (CFG.useMock) { return { ok: true }; }
      return gasPost("logEvent", { type, payload });
    },
    // AI (fase 4) — placeholder finché GAS non è pronto
    async aiCompose(scope, notes, context) {
      if (CFG.useMock) { await mockDelay(); return null; }
      return gasPost("aiCompose", { scope, notes, context });
    },
  };

  window.MB_API = api;
})();

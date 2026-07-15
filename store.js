// ============================================================
//  store.js — stato centralizzato (unico punto di verità)
//  Fix strutturale della v1: niente più render manuale sparso.
//  - un solo oggetto stato
//  - le AZIONI sono l'unico punto di mutazione
//  - render idempotente sottoscritto allo store
//  - il solver è chiamato dalle azioni, MAI dal render
// ============================================================
(function () {
  "use strict";

  function createStore(initial) {
    let state = initial;
    const subs = new Set();
    return {
      get: () => state,
      set(patch) {
        // sia oggetto sia funzione ritornano un PATCH, sempre mergiato sullo stato
        const delta = typeof patch === "function" ? patch(state) : patch;
        state = { ...state, ...delta };
        subs.forEach((fn) => fn(state));
      },
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    };
  }

  const store = createStore({
    route: "oggi",          // oggi | settimana | lista | profilo
    booted: false,
    loading: {},            // { [key]: true }
    error: null,            // { code, message } | null
    foods: {},              // { id: food }
    blocks: {},             // { id: block }
    prefs: {},              // targets, onDays, limits, learner
    week: null,             // { weekStart, days:[...] }
    today: null,            // giorno corrente (riferimento a un giorno di week)
    sheet: null,            // modale aperto: { type, ...payload } | null
    toast: null,            // messaggio effimero
  });

  // helper per gestire loading/errore attorno a un'azione async
  async function withStatus(key, fn) {
    store.set((s) => ({ loading: { ...s.loading, [key]: true }, error: null }));
    try {
      const r = await fn();
      return r;
    } catch (e) {
      store.set({ error: { code: e.code || "err", message: e.message || String(e) } });
      throw e;
    } finally {
      store.set((s) => { const l = { ...s.loading }; delete l[key]; return { loading: l }; });
    }
  }

  window.MB_STORE = store;
  window.MB_withStatus = withStatus;
})();

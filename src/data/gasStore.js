// gasStore.js — store che parla col backend Google Apps Script.
// Stessa interfaccia di createMockStore: l'app non sa quale dei due usa.
//
// Strategia (da design): online-first. Al boot carica tutto con getAll().
// I log si caricano su richiesta. Le scritture vanno subito al backend.

// orario LOCALE leggibile 'YYYY-MM-DD HH:MM' (non UTC come toISOString)
export function localStamp() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ritorna il log con savedAt come PRIMA chiave (comodo per leggerlo dal DB)
export function stampFirst(log) {
  const { savedAt, ...rest } = log; // rimuove un eventuale savedAt vecchio
  return { savedAt: localStamp(), ...rest };
}

export function createGasStore(url) {
  const TIMEOUT_MS = 15000; // GAS puo essere lento, ma non all'infinito

  async function call(action, payload = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // niente preflight CORS
        body: JSON.stringify({ action, ...payload }),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new Error(ctrl.signal.aborted ? 'Il server non risponde (timeout).' : 'Connessione assente.');
    } finally {
      clearTimeout(t);
    }
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'errore backend');
    return out.data;
  }

  // Cache del boot: foods/templates/schedule arrivano insieme.
  let cache = null;
  async function ensure() {
    if (!cache) cache = await call('getAll');
    return cache;
  }

  const dvar = (cat) => {
    const inCat = (cache.variants || []).filter((v) => v.categoria === cat);
    return inCat.find((v) => v.isDefault) || inCat[0];
  };

  return {
    async getFoods() { return (await ensure()).foods; },
    async getLogs() { return (await ensure()).logs || []; },
    async saveFood(food) {
      const saved = await call('saveFood', { food });
      if (cache) cache.foods[saved.id] = saved;
      return saved;
    },

    async getVariants() { return (await ensure()).variants || []; },
    async saveVariant(v) {
      const saved = await call('saveVariant', { variant: v });
      if (cache) {
        cache.variants = cache.variants || [];
        const i = cache.variants.findIndex((x) => x.id === saved.id);
        if (i >= 0) cache.variants[i] = saved; else cache.variants.push(saved);
        if (saved.isDefault) cache.variants.forEach((x) => { if (x.categoria === saved.categoria && x.id !== saved.id) x.isDefault = false; });
      }
      return saved;
    },
    async deleteVariant(id) {
      await call('deleteVariant', { id });
      if (cache) cache.variants = (cache.variants || []).filter((x) => x.id !== id);
    },
    async getDefaultVariant(cat) { await ensure(); return dvar(cat); },
    // compat
    async getTemplate(cat) { await ensure(); return dvar(cat); },
    async saveTemplate(t) { return this.saveVariant(t); },

    async getSchedule() { return (await ensure()).schedule; },
    async saveSchedule(schedule) {
      const saved = await call('saveSchedule', { schedule });
      if (cache) cache.schedule = saved;
      return saved;
    },
    async getLog(dateISO) { return call('getLog', { data: dateISO }); },
    async saveLog(log) {
      const stamped = stampFirst(log); // savedAt in cima, orario locale
      const saved = await call('saveLog', { log: stamped });
      if (cache) {
        cache.logs = cache.logs || [];
        const i = cache.logs.findIndex((l) => l.data === stamped.data);
        if (i >= 0) cache.logs[i] = stamped; else cache.logs.unshift(stamped);
      }
      return saved;
    },
  };
}

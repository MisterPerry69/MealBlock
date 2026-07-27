// gasStore.js — store che parla col backend Google Apps Script.
// Stessa interfaccia di createMockStore: l'app non sa quale dei due usa.
//
// Strategia (da design): online-first. Al boot carica tutto con getAll().
// I log si caricano su richiesta. Le scritture vanno subito al backend.

export function createGasStore(url) {
  async function call(action, payload = {}) {
    const res = await fetch(url, {
      method: 'POST',
      // text/plain evita il preflight CORS che GAS non gestisce bene.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
    });
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
    async saveLog(log) { return call('saveLog', { log }); },
  };
}

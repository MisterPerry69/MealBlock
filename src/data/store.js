// store.js — livello dati con interfaccia unica (mock in memoria).
//
// Modello varianti: ON e OFF sono due CATEGORIE; dentro ognuna vivono piu
// "varianti" (piani), ciascuna con id, nome, categoria, isDefault. La variante
// default guida la giornata quando parte in automatico.
//
// Interfaccia (async):
//   getFoods() / saveFood(food)
//   getVariants()                    -> Variant[]  (tutte, ON e OFF)
//   saveVariant(variant)             -> Variant    (upsert per id)
//   deleteVariant(id)
//   getDefaultVariant(categoria)     -> Variant    (la default di ON/OFF)
//   getSchedule() / saveSchedule()
//   getLog(dateISO) / saveLog(log)
//
// Compatibilita: getTemplate(categoria) resta e ritorna la variante default.

import { seedFoods, seedTemplates, seedSchedule } from './seed.js';
import { stampFirst } from './gasStore.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

// costruisce le varianti iniziali dai due template seed (uno default per categoria)
function seedVariants() {
  return [
    { id: 'on-standard', nome: 'Standard', categoria: 'ON', isDefault: true, ...clone(seedTemplates.ON) },
    { id: 'off-standard', nome: 'Standard', categoria: 'OFF', isDefault: true, ...clone(seedTemplates.OFF) },
  ];
}

export function createMockStore(seed = {}) {
  const foods = clone(seed.foods ?? seedFoods);
  let variants = clone(seed.variants ?? seedVariants());
  let schedule = clone(seed.schedule ?? seedSchedule);
  const logs = clone(seed.logs ?? {});

  return {
    async getFoods() { return clone(foods); },
    async saveFood(food) { foods[food.id] = clone(food); return clone(food); },

    async getVariants() { return clone(variants); },
    async saveVariant(v) {
      const i = variants.findIndex((x) => x.id === v.id);
      if (i >= 0) variants[i] = clone(v); else variants.push(clone(v));
      // garantisce una sola default per categoria
      if (v.isDefault) variants.forEach((x) => { if (x.categoria === v.categoria && x.id !== v.id) x.isDefault = false; });
      return clone(v);
    },
    async deleteVariant(id) { variants = variants.filter((x) => x.id !== id); },

    async getDefaultVariant(categoria) {
      const inCat = variants.filter((x) => x.categoria === categoria);
      return clone(inCat.find((x) => x.isDefault) || inCat[0]);
    },
    // compat
    async getTemplate(categoria) { return this.getDefaultVariant(categoria); },
    async saveTemplate(t) { return this.saveVariant(t); },

    async getSchedule() { return clone(schedule); },
    async saveSchedule(next) { schedule = clone(next); return clone(schedule); },

    async getLog(dateISO) { return logs[dateISO] ? clone(logs[dateISO]) : null; },
    async saveLog(log) { const s = stampFirst(log); logs[s.data] = clone(s); return clone(s); },
    async getLogs() { return Object.values(clone(logs)).sort((a, b) => (a.data < b.data ? 1 : -1)); },
  };
}

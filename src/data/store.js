// store.js — livello dati con interfaccia unica (mock in memoria).
//
// Modello piani: ON e OFF sono due CATEGORIE; dentro ognuna vivono piu piani,
// ciascuno con id, nome, categoria. Nessun piano ha priorita sugli altri.
//
// Interfaccia (async):
//   getFoods() / saveFood(food)
//   getVariants()                    -> Variant[]  (tutti i piani, ON e OFF)
//   saveVariant(variant)             -> Variant    (upsert per id)
//   deleteVariant(id)
//   getSchedule() / saveSchedule()
//   getLog(dateISO) / saveLog(log)

import { seedFoods, seedTemplates, seedSchedule } from './seed.js';
import { stampFirst } from './gasStore.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

function seedVariants() {
  return [
    { id: 'on-standard', nome: 'Giorno ON', categoria: 'ON', ...clone(seedTemplates.ON) },
    { id: 'off-standard', nome: 'Giorno OFF', categoria: 'OFF', ...clone(seedTemplates.OFF) },
  ];
}

export function createMockStore(seed = {}) {
  const foods = clone(seed.foods ?? seedFoods);
  let variants = clone(seed.variants ?? seedVariants());
  let schedule = clone(seed.schedule ?? seedSchedule);
  const logs = clone(seed.logs ?? {});
  const extras = clone(seed.extras ?? {}); // { weekKey: [{nome}, ...] }

  return {
    async getFoods() { return clone(foods); },
    async saveFood(food) { foods[food.id] = clone(food); return clone(food); },

    async getVariants() { return clone(variants); },
    async saveVariant(v) {
      const i = variants.findIndex((x) => x.id === v.id);
      if (i >= 0) variants[i] = clone(v); else variants.push(clone(v));
      return clone(v);
    },
    async deleteVariant(id) { variants = variants.filter((x) => x.id !== id); },

    async getSchedule() { return clone(schedule); },
    async saveSchedule(next) { schedule = clone(next); return clone(schedule); },

    async getLog(dateISO) { return logs[dateISO] ? clone(logs[dateISO]) : null; },
    async saveLog(log) { const s = stampFirst(log); logs[s.data] = clone(s); return clone(s); },
    async getLogs() { return Object.values(clone(logs)).sort((a, b) => (a.data < b.data ? 1 : -1)); },

    async getExtras(weekKey) { return clone(extras[weekKey] ?? []); },
    async saveExtras(weekKey, items) { extras[weekKey] = clone(items); return clone(items); },
  };
}

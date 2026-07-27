// format.js — helper di presentazione condivisi.

import { macrosOfRows } from '../core/solver.js';

const MACROS = ['kcal', 'carbo', 'prot', 'fat'];

// foods dello store hanno .per100g; il solver vuole valori piatti.
export function flatFoods(foods) {
  const out = {};
  for (const id of Object.keys(foods)) {
    out[id] = { ...foods[id].per100g };
    if (foods[id].rangeGrammatura) out[id].rangeGrammatura = foods[id].rangeGrammatura;
  }
  return out;
}

// Somma i macro di tutte le righe di un log.
export function logMacros(log, foods) {
  const flat = flatFoods(foods);
  const rows = [];
  for (const meal of log.meals) for (const r of meal.righe) rows.push(r);
  return macrosOfRows(rows, flat);
}

export function mealMacros(meal, foods) {
  return macrosOfRows(meal.righe, flatFoods(foods));
}

// Macro delle sole righe gia MANGIATE (spuntate). Le barre mostrano questo:
// la progressione reale del consumo, da 0 al target.
export function eatenMacros(log, foods) {
  const flat = flatFoods(foods);
  const rows = [];
  for (const meal of log.meals) for (const r of meal.righe) if (r.eaten) rows.push(r);
  return macrosOfRows(rows, flat);
}

export const round = (n) => Math.round(n);

export const macroLabels = { kcal: 'kcal', carbo: 'C', prot: 'P', fat: 'F' };
export const macroUnit = { kcal: '', carbo: 'g', prot: 'g', fat: 'g' };
export { MACROS };

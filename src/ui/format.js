// format.js — helper di presentazione condivisi.

import { macrosOfRows } from '../core/solver.js';
import { weekdayKey } from '../core/day.js';

// foods dello store hanno .per100g; il solver vuole valori piatti.
export function flatFoods(foods) {
  const out = {};
  for (const id of Object.keys(foods)) {
    // include id e nome: il motore proposte li usa per le aggiunte
    out[id] = { id, nome: foods[id].nome, ...foods[id].per100g };
    if (foods[id].rangeGrammatura) out[id].rangeGrammatura = foods[id].rangeGrammatura;
    if (foods[id].accessorio) out[id].accessorio = true;
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

const DOW = { lun: 'Lunedì', mar: 'Martedì', mer: 'Mercoledì', gio: 'Giovedì', ven: 'Venerdì', sab: 'Sabato', dom: 'Domenica' };
const MON = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
/** 'Lunedì 19 Ottobre' da una data ISO. */
export function fmtDate(iso) { const [, m, d] = iso.split('-').map(Number); return `${DOW[weekdayKey(iso)]} ${d} ${MON[m - 1]}`; }

/** Testo di un macro per la riga ('120 kcal', '30C'...) o per l'intestazione pasto. */
export function macroText(k, v, head = false) {
  const n = round(v);
  if (k === 'kcal') return head ? `${n} ` : `${n} kcal`;
  const l = { carbo: 'C', prot: 'P', fat: 'F' }[k];
  return head ? `${n}${l} ` : `${n}${l}`;
}

/** Tipi di pasto (id usati nei piani e nei blocchi). */
export const MEAL_TYPES = [
  { id: 'colazione', nome: 'Colazione' }, { id: 'pranzo', nome: 'Pranzo' },
  { id: 'spuntino', nome: 'Spuntino' }, { id: 'cena', nome: 'Cena' },
];

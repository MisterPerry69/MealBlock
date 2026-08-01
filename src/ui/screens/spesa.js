// spesa.js — lista della spesa aggregata dai piani scelti, spuntabile.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { clearTracker } from '../tracker.js';
import { round } from '../format.js';

// stato locale della schermata: quali piani includere, cosa e gia comprato
let included = null;          // Set di variantId inclusi (null = default: le due Standard)
const bought = new Set();     // foodId spuntati come comprati

export function renderSpesa(root, ctx) {
  clearTracker();
  const variants = [...ctx.variantsOf('ON'), ...ctx.variantsOf('OFF')];

  // default: includi le varianti "default" (Standard) di ON e OFF
  if (included === null) {
    included = new Set(variants.filter((v) => v.isDefault).map((v) => v.id));
  }

  root.append(el('div', { class: 'hdr' }, [
    el('div', {}, [el('div', { class: 'hdr__title', text: 'Spesa' })]),
  ]));

  // selettore piani da includere (chip)
  root.append(el('div', { class: 'section-label', text: 'Piani inclusi' }));
  const chips = el('div', { class: 'shop-plans' });
  for (const v of variants) {
    const on = included.has(v.id);
    chips.append(el('button', {
      class: `shop-chip ${on ? 'is-on' : ''}`,
      onClick: () => { on ? included.delete(v.id) : included.add(v.id); ctx.rerender(); },
    }, [
      el('span', { class: `chip chip--${v.categoria === 'ON' ? 'on' : 'off'}`, text: v.categoria }),
      ` ${v.nome}`,
    ]));
  }
  root.append(chips);

  // aggrega gli ingredienti dei piani inclusi: somma grammature per foodId
  const agg = {};
  for (const v of variants) {
    if (!included.has(v.id)) continue;
    for (const meal of v.meals) for (const r of meal.righe) {
      agg[r.foodId] = (agg[r.foodId] || 0) + (r.grammatura || 0);
    }
  }
  const voci = Object.keys(agg)
    .map((foodId) => ({ foodId, grammi: agg[foodId], nome: ctx.foods[foodId]?.nome || foodId }))
    .sort((a, b) => (a.bought === b.bought ? a.nome.localeCompare(b.nome) : 0));

  if (voci.length === 0) {
    root.append(el('div', { class: 'empty', text: 'Seleziona almeno un piano per vedere la lista.' }));
    return;
  }

  root.append(el('div', { class: 'section-label', text: `${voci.length} cibi da comprare` }));
  const stack = el('div', { class: 'stack' });
  // non comprati prima, comprati (barrati) in fondo
  voci.sort((a, b) => (bought.has(a.foodId) === bought.has(b.foodId) ? a.nome.localeCompare(b.nome) : (bought.has(a.foodId) ? 1 : -1)));
  for (const voce of voci) {
    const isBought = bought.has(voce.foodId);
    stack.append(el('button', {
      class: `shop-item ${isBought ? 'is-bought' : ''}`,
      onClick: () => { isBought ? bought.delete(voce.foodId) : bought.add(voce.foodId); ctx.rerender(); },
    }, [
      el('span', { class: `shop-check ${isBought ? 'on' : ''}`, html: icon.check(14) }),
      el('span', { class: 'shop-name', text: voce.nome }),
      el('span', { class: 'shop-qty', text: `${round(voce.grammi)} g` }),
    ]));
  }
  root.append(stack);
}

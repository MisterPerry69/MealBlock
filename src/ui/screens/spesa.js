// spesa.js — lista della spesa della SETTIMANA visualizzata, spuntabile.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { clearTracker } from '../tracker.js';
import { round } from '../format.js';
import { weekDays } from '../../core/day.js';

const MON = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
function dLabel(iso){ const [,m,d]=iso.split('-').map(Number); return `${d} ${MON[m-1]}`; }

const bought = new Set(); // foodId gia comprati (sessione)

export function renderSpesa(root, ctx) {
  clearTracker();
  const days = weekDays(ctx.weekRef);

  root.append(el('div', { class: 'hdr' }, [
    el('div', {}, [el('div', { class: 'hdr__title', text: 'Spesa' })]),
  ]));

  root.append(el('div', { class: 'cal-nav' }, [
    el('button', { class: 'cal-arrow', 'aria-label': 'Settimana precedente', html: icon.back(20), onClick: () => ctx.shiftWeek(-7) }),
    el('div', { class: 'cal-title', text: `${dLabel(days[0])} – ${dLabel(days[6])}` }),
    el('button', { class: 'cal-arrow', 'aria-label': 'Settimana successiva', html: icon.back(20).replace('m15 18-6-6 6-6','m9 18 6-6-6-6'), onClick: () => ctx.shiftWeek(7) }),
  ]));

  // aggrega gli ingredienti di TUTTI i giorni assegnati della settimana
  const agg = {};
  for (const iso of days) {
    const log = ctx.logForDate(iso);
    if (!log || !log.meals) continue;
    for (const meal of log.meals) for (const r of (meal.righe || [])) {
      agg[r.foodId] = (agg[r.foodId] || 0) + (r.grammatura || 0);
    }
  }

  const voci = Object.keys(agg).map((foodId) => ({ foodId, grammi: agg[foodId], nome: ctx.foods[foodId]?.nome || foodId }));
  if (voci.length === 0) {
    root.append(el('div', { class: 'empty', text: 'Nessun giorno pianificato questa settimana. Assegna i piani dalla tab Settimana.' }));
    return;
  }

  root.append(el('div', { class: 'section-label', text: `${voci.length} cibi da comprare` }));
  voci.sort((a, b) => (bought.has(a.foodId) === bought.has(b.foodId) ? a.nome.localeCompare(b.nome) : (bought.has(a.foodId) ? 1 : -1)));

  const stack = el('div', { class: 'stack' });
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

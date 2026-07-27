// storico.js — i giorni passati. Nessun giudizio, solo dati.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { clearTracker } from '../tracker.js';
import { logMacros, round } from '../format.js';

const MON = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
function shortDate(iso){ const [,m,d]=iso.split('-').map(Number); return `${d} ${MON[m-1]}`; }

export function renderStorico(root, ctx) {
  clearTracker();
  root.append(el('div', { class: 'hdr' }, [
    el('div', {}, [el('div', { class: 'hdr__title', text: 'Storico' })]),
  ]));

  const logs = ctx.history;
  if (logs.length === 0) {
    root.append(el('div', { class: 'empty', text: 'I giorni compaiono qui man mano che li vivi.' }));
    return;
  }

  const stack = el('div', { class: 'stack' });
  for (const log of logs) {
    const m = logMacros(log, ctx.foods);
    const sgarri = log.meals.reduce((n, meal) => n + meal.righe.filter((r) => r.isSgarro).length, 0);
    stack.append(el('div', { class: 'item' }, [
      el('div', { style: 'display:flex;align-items:center;gap:10px' }, [
        el('span', { class: `chip chip--${log.tipo === 'ON' ? 'on' : 'off'}`, text: log.tipo }),
        el('span', { class: 'item__meta', text: shortDate(log.data) }),
        sgarri > 0 ? el('span', { class: 'row__sgarro', html: icon.offplan(14), title: `${sgarri} fuori piano` }) : null,
      ]),
      el('span', { class: 'item__meta', text: `${round(m.kcal)} kcal` }),
    ]));
  }
  root.append(stack);
}

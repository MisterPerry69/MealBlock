// spesa.js — lista della spesa della SETTIMANA visualizzata, spuntabile.
// Aggrega gli ingredienti dei piani + voci extra libere (es. detersivo).

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { clearTracker } from '../tracker.js';
import { round } from '../format.js';
import { weekDays } from '../../core/day.js';

const MON = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
function dLabel(iso){ const [,m,d]=iso.split('-').map(Number); return `${d} ${MON[m-1]}`; }

const bought = new Set(); // chiavi gia comprate (sessione): foodId o `extra:i`

export function renderSpesa(root, ctx) {
  clearTracker();
  const days = weekDays(ctx.weekRef);
  const weekKey = days[0];

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
  const voci = Object.keys(agg).map((foodId) => ({ key: foodId, foodId, grammi: agg[foodId], nome: ctx.foods[foodId]?.nome || foodId }));

  const extras = ctx.extrasOf(weekKey);
  const vociExtra = extras.map((e, i) => ({ key: `extra:${i}`, index: i, nome: e.nome, extra: true }));

  const tutte = [...voci, ...vociExtra];

  if (tutte.length === 0) {
    root.append(el('div', { class: 'empty', text: 'Nessun giorno pianificato questa settimana. Assegna i piani dalla tab Settimana.' }));
  } else {
    root.append(el('div', { class: 'section-label', text: `${tutte.length} cose da comprare` }));
    tutte.sort((a, b) => (bought.has(a.key) === bought.has(b.key) ? a.nome.localeCompare(b.nome) : (bought.has(a.key) ? 1 : -1)));

    const stack = el('div', { class: 'stack' });
    for (const voce of tutte) {
      const isBought = bought.has(voce.key);
      stack.append(el('div', { class: `shop-item ${isBought ? 'is-bought' : ''}` }, [
        el('button', {
          class: 'shop-item__main',
          onClick: () => { isBought ? bought.delete(voce.key) : bought.add(voce.key); ctx.rerender(); },
        }, [
          el('span', { class: `shop-check ${isBought ? 'on' : ''}`, html: icon.check(14) }),
          el('span', { class: 'shop-name', text: voce.nome }),
          voce.extra ? null : el('span', { class: 'shop-qty', text: `${round(voce.grammi)} g` }),
        ]),
        voce.extra ? el('button', {
          class: 'shop-item__del', 'aria-label': `Rimuovi ${voce.nome}`, html: icon.close(14),
          onClick: () => ctx.removeExtra(weekKey, voce.index),
        }) : null,
      ]));
    }
    root.append(stack);
  }

  root.append(extraAdder(weekKey, ctx));
}

// campo "aggiungi extra" in fondo: testo libero + invio/bottone
function extraAdder(weekKey, ctx) {
  const input = el('input', { class: 'f__input', type: 'text', placeholder: 'Aggiungi altro (es. detersivo)…', 'aria-label': 'Nuova voce extra' });
  const add = () => {
    const nome = input.value.trim();
    if (!nome) return;
    ctx.addExtra(weekKey, nome);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  const btn = el('button', { class: 'iconbtn', 'aria-label': 'Aggiungi voce', html: icon.plus(18), onClick: add });
  return el('div', { class: 'shop-adder' }, [input, btn]);
}

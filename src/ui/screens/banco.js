// banco.js — editor "banco da lavoro" di una giornata. Pineapple-plus.

import { el, gramInput } from '../dom.js';
import { icon } from '../icons.js';
import { renderTracker } from '../tracker.js';
import { round, flatFoods, mealMacros } from '../format.js';
import { macrosOfRows } from '../../core/solver.js';

const MEAL_IC = { colazione:'colazione', pranzo:'pranzo', cena:'cena', spuntino:'spuntino' };
const mealIconKey = (id) => MEAL_IC[id] || 'spuntino';

// parse grammi accettando sia virgola sia punto (bug: prima ignorava i decimali)
function parseG(v) {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
// mostra la grammatura senza arrotondare (127.5 resta 127.5, non 128)
function fmtG(g) {
  const n = Number(g) || 0;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

export function renderBanco(root, ctx) {
  const { plan, foods } = ctx.banco;
  const flat = flatFoods(foods);

  // header: indietro + nome piano (rinominabile) a sx, Ricalcola icona a dx
  root.append(el('div', { class: 'banco-hdr' }, [
    el('button', { class: 'banco-back', 'aria-label': 'Indietro', html: icon.back(20), onClick: () => ctx.bancoClose() }),
    el('button', { class: 'banco-name', onClick: () => ctx.bancoRename() }, [
      el('span', { text: plan.nome || 'Piano' }),
      el('span', { class: 'banco-name__cat', text: plan.tipo }),
      el('span', { class: 'banco-name__edit', html: icon.pencil(14) }),
    ]),
    el('button', { class: 'ico-tool', 'aria-label': 'Ricalcola', html: icon.refresh(18), onClick: () => ctx.bancoAuto() }),
  ]));

  const t = plan.target;
  root.append(el('div', { class: 'banco-target' }, [
    'target ', el('b', { text: `${t.kcal}` }), ' kcal · ',
    el('b', { text: `${t.carbo}` }), 'C ', el('b', { text: `${t.prot}` }), 'P ', el('b', { text: `${t.fat}` }), 'F',
  ]));

  for (const meal of plan.meals) root.append(mealBlock(meal, foods, flat, ctx));

  // tracker = totale reale del piano (cosi come sta) vs target
  const allRows = [];
  for (const meal of plan.meals) for (const r of meal.righe) allRows.push(r);
  renderTracker(macrosOfRows(allRows, flat), plan.target);
}

function mealBlock(meal, foods, flat, ctx) {
  const m = mealMacros(meal, foods);
  const head = el('div', { class: 'meal__head' }, [
    el('span', { class: `meal__ic meal__ic--${mealIconKey(meal.id)}`, html: icon[mealIconKey(meal.id)](18) }),
    el('span', { class: 'meal__name', text: meal.nome }),
    // totale macro del pasto (distribuzione)
    el('span', { class: 'meal__macros' }, [
      `${round(m.kcal)} `,
      el('span', { class: 'mc mc--c', text: `${round(m.carbo)}C ` }),
      el('span', { class: 'mc mc--p', text: `${round(m.prot)}P ` }),
      el('span', { class: 'mc mc--f', text: `${round(m.fat)}F` }),
    ]),
  ]);
  const rows = meal.righe.map((r, i) => editRow(meal.id, r, i, foods, flat, ctx));
  const addBtn = el('button', { class: 'add-food', onClick: () => ctx.bancoAddFood(meal.id) }, [
    el('span', { html: icon.plus(15) }), 'Aggiungi cibo',
  ]);
  return el('div', { class: 'meal' }, [head, ...rows, addBtn]);
}

function editRow(mealId, r, index, foods, flat, ctx) {
  const nome = foods[r.foodId]?.nome || r.foodId;
  const mm = macrosOfRows([r], flat); // valori di questa riga a questa grammatura

  return el('div', { class: 'erow erow--rich' }, [
    el('div', { class: 'erow__info' }, [
      el('div', { class: 'erow__name', text: nome }),
      el('div', { class: 'row__info' }, [
        el('span', { text: `${round(mm.kcal)} kcal` }),
        el('span', { class: 'mc mc--c', text: `${round(mm.carbo)}C` }),
        el('span', { class: 'mc mc--p', text: `${round(mm.prot)}P` }),
        el('span', { class: 'mc mc--f', text: `${round(mm.fat)}F` }),
      ]),
    ]),
    gramInput({
      value: r.grammatura, disabled: r.locked, extraClass: r.locked ? 'is-locked' : '',
      ariaLabel: `Grammi di ${nome}`,
      onCommit: (g) => ctx.bancoSetGram(mealId, index, g),
    }),
    el('button', {
      class: 'erow__lock', 'aria-pressed': String(!!r.locked),
      'aria-label': r.locked ? `${nome} bloccato, il ricalcolo non lo tocca` : `Blocca ${nome}`,
      html: icon[r.locked ? 'lockClosed' : 'lockOpen'](16),
      onClick: () => ctx.bancoToggleLock(mealId, index),
    }),
    el('button', {
      class: 'erow__del', 'aria-label': `Rimuovi ${nome}`,
      html: icon.trash(16), onClick: () => ctx.bancoRemove(mealId, index),
    }),
  ]);
}

// banco.js — editor "banco da lavoro" di una giornata. Pineapple-plus.

import { el } from '../dom.js';
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

export function renderBanco(root, ctx) {
  const { plan, foods } = ctx.banco;
  const flat = flatFoods(foods);

  root.append(el('button', { class: 'banco-back', onClick: () => ctx.bancoClose() }, [
    el('span', { html: icon.back(18) }), `Piano ${plan.tipo}`,
  ]));

  const t = plan.target;
  root.append(el('div', { class: 'banco-target' }, [
    'target ', el('b', { text: `${t.kcal}` }), ' kcal · ',
    el('b', { text: `${t.carbo}` }), 'C ', el('b', { text: `${t.prot}` }), 'P ', el('b', { text: `${t.fat}` }), 'F',
  ]));

  for (const meal of plan.meals) root.append(mealBlock(meal, foods, flat, ctx));

  root.append(el('div', { class: 'banco-actions' }, [
    el('button', { class: 'banco-btn', onClick: () => ctx.bancoAuto() }, [
      el('span', { html: icon.wand(17) }), 'Ricalcola',
    ]),
    el('button', { class: 'banco-btn banco-btn--primary', onClick: () => ctx.bancoSave() }, 'Salva'),
  ]));

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
    el('input', {
      class: 'erow__g', type: 'text', inputmode: 'decimal',
      value: String(round(r.grammatura)), disabled: r.auto,
      'aria-label': `Grammi di ${nome}`,
      onChange: (e) => ctx.bancoSetGram(mealId, index, parseG(e.target.value)),
    }),
    el('button', {
      class: 'erow__auto', 'aria-pressed': String(!!r.auto),
      text: 'AUTO', title: r.auto ? 'Grammatura automatica' : 'Grammatura manuale',
      onClick: () => ctx.bancoToggleAuto(mealId, index),
    }),
    el('button', {
      class: 'erow__del', 'aria-label': `Rimuovi ${nome}`,
      html: icon.trash(16), onClick: () => ctx.bancoRemove(mealId, index),
    }),
  ]);
}

// banco.js — editor "banco da lavoro" di una giornata (ON o OFF). Pineapple-plus.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { renderTracker } from '../tracker.js';
import { round } from '../format.js';
import { recalcPlan } from '../../core/day.js';

const MEAL_IC = { colazione:'colazione', pranzo:'pranzo', cena:'cena', spuntino:'spuntino' };
function mealIconKey(id){ return MEAL_IC[id] || 'spuntino'; }

export function renderBanco(root, ctx) {
  const { plan, foods } = ctx.banco;
  const { totals } = recalcPlan(plan, foods);

  root.append(el('button', { class: 'banco-back', onClick: () => ctx.bancoClose() }, [
    el('span', { html: icon.back(18) }), `Piano ${plan.tipo}`,
  ]));

  const t = plan.target;
  root.append(el('div', { class: 'banco-target' }, [
    'target ', el('b', { text: `${t.kcal}` }), ' kcal · ',
    el('b', { text: `${t.carbo}` }), 'C ', el('b', { text: `${t.prot}` }), 'P ', el('b', { text: `${t.fat}` }), 'F',
  ]));

  for (const meal of plan.meals) root.append(mealBlock(meal, foods, ctx));

  root.append(el('div', { class: 'banco-actions' }, [
    el('button', { class: 'banco-btn', onClick: () => ctx.bancoAuto() }, [
      el('span', { html: icon.wand(17) }), 'Ricalcola',
    ]),
    el('button', { class: 'banco-btn banco-btn--primary', onClick: () => ctx.bancoSave() }, 'Salva'),
  ]));

  // tracker = totale del piano vs target
  renderTracker(totals, plan.target);
}

function mealBlock(meal, foods, ctx) {
  const head = el('div', { class: 'meal__head' }, [
    el('span', { class: `meal__ic meal__ic--${mealIconKey(meal.id)}`, html: icon[mealIconKey(meal.id)](18) }),
    el('span', { class: 'meal__name', text: meal.nome }),
  ]);
  const rows = meal.righe.map((r, i) => editRow(meal.id, r, i, foods, ctx));
  const addBtn = el('button', { class: 'add-food', onClick: () => ctx.bancoAddFood(meal.id) }, [
    el('span', { html: icon.plus(15) }), 'Aggiungi cibo',
  ]);
  return el('div', { class: 'meal' }, [head, ...rows, addBtn]);
}

function editRow(mealId, r, index, foods, ctx) {
  const nome = foods[r.foodId]?.nome || r.foodId;
  return el('div', { class: 'erow' }, [
    el('span', { class: 'erow__name', text: nome }),
    el('input', {
      class: 'erow__g', type: 'number', inputmode: 'numeric', min: '0',
      value: String(round(r.grammatura)), disabled: r.auto,
      'aria-label': `Grammi di ${nome}`,
      onChange: (e) => ctx.bancoSetGram(mealId, index, Number(e.target.value)),
    }),
    // solo AUTO, selezionabile/deselezionabile (attivo = grammatura decisa dal motore)
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

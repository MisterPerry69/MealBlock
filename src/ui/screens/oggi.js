// oggi.js — la schermata principale. Pineapple-plus.

import { el, gramInput } from '../dom.js';
import { icon, mealIcon } from '../icons.js';
import { renderTracker } from '../tracker.js';
import { eatenMacros, logMacros, mealMacros, flatFoods, round, fmtDate } from '../format.js';
import { isSgarroDay, todayISO } from '../../core/day.js';
import { macrosOfRows } from '../../core/solver.js';

export function renderOggi(root, ctx) {
  const { log } = ctx.today;
  if (!log) { renderEmptyToday(root, ctx); return; }
  const { foods } = ctx.today;
  const sgarro = isSgarroDay(log);
  const on = (sgarro ? (log.tipoBase || 'ON') : log.tipo) === 'ON';

  // header: data completa a sinistra; a destra ✏️ | ON/OFF ▼
  root.append(el('div', { class: 'ohdr' }, [
    el('div', { class: 'ohdr__date', text: fmtDate(log.data) }),
    el('div', { class: 'ohdr__ctrl' }, [
      el('button', { class: `ico-tool ${ctx.editMode ? 'is-active' : ''}`, 'aria-label': ctx.editMode ? 'Fine modifica' : 'Modifica', html: icon.pencil(18), onClick: () => ctx.toggleEditMode() }),
      dayControl(sgarro, on, ctx),
    ]),
  ]));

  const flat = flatFoods(foods);
  for (const meal of log.meals) root.append(mealCard(meal, foods, flat, ctx, sgarro));

  // "Fuori piano" ha senso solo quando NON sei gia in giornata sgarro
  if (!sgarro) root.append(el('button', { class: 'addf', onClick: () => ctx.addSgarro() }, [
    el('span', { html: icon.plus(16) }), 'Fuori piano',
  ]));

  const target = sgarro ? sgarroTarget(log, foods) : (log.target || { kcal: 0, carbo: 0, prot: 0, fat: 0 });
  // in modalita modifica mostro il TOTALE della giornata (come nei piani), cosi
  // vedo dove arriva il piano mentre modifico; altrimenti mostro il MANGIATO.
  const shown = ctx.editMode ? logMacros(log, foods) : eatenMacros(log, foods);
  renderTracker(shown, target);
}

// giornata SGARRO: il "target" e il totale stesso (barre piene, no colpa)
function sgarroTarget(log, foods) {
  const flat = flatFoods(foods);
  const rows = [];
  for (const meal of log.meals) for (const r of meal.righe) rows.push(r);
  const t = macrosOfRows(rows, flat);
  return { kcal: t.kcal || 1, carbo: t.carbo || 1, prot: t.prot || 1, fat: t.fat || 1 };
}

// pill ON/OFF/SGARRO + chevron che apre il menu (solo ON/OFF/SGARRO, azioni giorno)
function dayControl(sgarro, on, ctx) {
  const cls = sgarro ? 'daybtn--sgarro' : (on ? '' : 'daybtn--off');
  const label = sgarro ? 'SGARRO' : (on ? 'ON' : 'OFF');
  const ic = sgarro ? 'offplan' : (on ? 'on' : 'off');

  const btn = el('button', {
    class: `daybtn ${cls}`,
    'aria-label': `Giornata ${label}. Apri opzioni giorno.`,
    html: icon[ic](16) + `<span>${label}</span>` + icon.chevronDown(15),
    onClick: () => openDayMenu(sgarro, on, ctx),
  });
  return btn;
}

function openDayMenu(sgarro, on, ctx) {
  const items = [];

  // switch ON<->OFF: cambia solo il target, poi entra subito in modifica
  // (i macro cambiano, quasi certamente ci sara qualcosa da aggiustare a mano).
  items.push({ label: on ? 'Passa a OFF' : 'Passa a ON', icon: on ? 'off' : 'on', act: () => ctx.toggleDayType(true) });

  // sgarro on/off
  items.push({ label: sgarro ? 'Annulla sgarro' : 'Segna come sgarro', icon: 'offplan', danger: !sgarro, act: () => ctx.toggleSgarroDay() });

  const menu = el('div', { class: 'daymenu' }, items.map((it) => el('button', {
    class: `daymenu__i ${it.danger ? 'is-danger' : ''}`,
    html: icon[it.icon](16) + `<span>${it.label}</span>`,
    onClick: () => { close(); it.act(); },
  })));

  const back = el('div', { class: 'daymenu-backdrop', onClick: (e) => { if (e.target === back) close(); } }, [menu]);
  function close() { back.remove(); }
  document.body.append(back);
}

function mealCard(meal, foods, flat, ctx, sgarro) {
  const m = mealMacros(meal, foods);
  const editable = ctx.editMode || sgarro; // in SGARRO si aggiunge sempre

  const head = el('div', { class: 'meal__head' }, [
    el('span', { class: `meal__ic meal__ic--${mealIcon(meal.id)}`, html: icon[mealIcon(meal.id)](18) }),
    el('span', { class: 'meal__name', text: meal.nome }),
    el('span', { class: 'meal__tot', 'data-m': 'kcal', text: `${round(m.kcal)} kcal` }),
  ]);

  const rows = meal.righe.map((r, i) => editable ? editFoodRow(meal.id, r, i, foods, ctx) : foodRow(meal.id, r, foods, flat, ctx));
  const kids = [head, ...rows];
  if (meal.righe.length === 0 && !editable) kids.push(el('div', { class: 'meal-empty', text: '—' }));
  if (editable) kids.push(el('button', { class: 'add-food', onClick: () => ctx.addRowToMeal(meal.id) }, [
    el('span', { html: icon.plus(15) }), 'Aggiungi',
  ]));
  return el('div', { class: 'meal', 'data-meal': meal.id }, kids);
}

function foodRow(mealId, r, foods, flat, ctx) {
  const food = foods[r.foodId];
  const nome = food ? food.nome : r.foodId;
  const mm = macrosOfRows([r], flat);

  return el('div', { class: `row ${r.eaten ? 'row--eaten' : ''}` }, [
    el('button', {
      class: 'chk', 'aria-pressed': String(!!r.eaten),
      'aria-label': r.eaten ? `${nome} mangiato` : `Segna ${nome}`,
      html: icon.check(13), onClick: () => ctx.toggleEaten(mealId, r),
    }),
    el('div', { class: 'row__mid' }, [
      el('div', { class: 'row__name' }, [
        nome, r.isSgarro ? el('span', { class: 'row__sgarro', html: icon.offplan(14), title: 'fuori piano' }) : null,
      ]),
      el('div', { class: 'row__info' }, [
        el('span', { text: `${round(mm.kcal)} kcal` }),
        el('span', { class: 'mc mc--c', text: `${round(mm.carbo)}C` }),
        el('span', { class: 'mc mc--p', text: `${round(mm.prot)}P` }),
        el('span', { class: 'mc mc--f', text: `${round(mm.fat)}F` }),
      ]),
    ]),
    el('span', { class: 'row__g' }, [String(round(r.grammatura)), el('span', { class: 'u', text: 'g' })]),
  ]);
}

// riga in modalita modifica: blocca, cambia grammatura, sostituisci cibo, rimuovi
function editFoodRow(mealId, r, index, foods, ctx) {
  const nome = foods[r.foodId]?.nome || r.foodId;
  return el('div', { class: 'erow' }, [
    el('button', { class: 'erow__swap', 'aria-label': `Sostituisci ${nome}`, text: nome,
      onClick: () => ctx.replaceFood(mealId, index) }),
    gramInput({
      value: r.grammatura,
      ariaLabel: `Grammi di ${nome}`,
      onCommit: (g) => ctx.setRowGram(mealId, index, g),
    }),
    el('button', { class: 'erow__del', 'aria-label': `Rimuovi ${nome}`, html: icon.trash(16),
      onClick: () => ctx.removeRow(mealId, index) }),
  ]);
}

// Oggi senza piano assegnato: selettore rapido ON/OFF invece del contenuto normale.
function renderEmptyToday(root, ctx) {
  root.append(el('div', { class: 'ohdr' }, [
    el('div', { class: 'ohdr__date', text: fmtDate(todayISO()) }),
  ]));
  root.append(el('div', { class: 'empty-today' }, [
    el('div', { class: 'empty-today__hint', text: 'Nessun piano assegnato a oggi. Scegli da dove partire:' }),
    el('div', { class: 'empty-today__choices' }, [
      el('button', { class: 'daybtn', html: icon.on(18) + '<span>ON</span>', onClick: () => ctx.quickAssignToday('ON') }),
      el('button', { class: 'daybtn daybtn--off', html: icon.off(18) + '<span>OFF</span>', onClick: () => ctx.quickAssignToday('OFF') }),
    ]),
  ]));
}

// aggiorna SOLO i totali kcal dei pasti, senza ricostruire le righe (la tastiera
// resta aperta mentre si digita)
export function refreshOggiNumbers(log, foods) {
  for (const meal of log.meals) {
    const node = document.querySelector(`.meal[data-meal="${meal.id}"] .meal__tot`);
    if (node) node.textContent = `${round(mealMacros(meal, foods).kcal)} kcal`;
  }
}

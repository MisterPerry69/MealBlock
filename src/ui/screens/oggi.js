// oggi.js — la schermata principale. Pineapple-plus.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { renderTracker } from '../tracker.js';
import { eatenMacros, logMacros, mealMacros, flatFoods, round } from '../format.js';
import { weekdayKey, isSgarroDay } from '../../core/day.js';
import { macrosOfRows } from '../../core/solver.js';

const DOW = { lun:'Lunedì', mar:'Martedì', mer:'Mercoledì', gio:'Giovedì', ven:'Venerdì', sab:'Sabato', dom:'Domenica' };
const MON = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
function fmtDate(iso){ const [,m,d]=iso.split('-').map(Number); return `${DOW[weekdayKey(iso)]} ${d} ${MON[m-1]}`; }

const MEAL_IC = { colazione:'colazione', pranzo:'pranzo', cena:'cena', spuntino:'spuntino' };
const mealIconKey = (id) => MEAL_IC[id] || 'spuntino';

export function renderOggi(root, ctx) {
  const { log, foods, template } = ctx.today;
  const sgarro = isSgarroDay(log);
  const on = (sgarro ? (log.tipoBase || 'ON') : log.tipo) === 'ON';
  const cat = sgarro ? (log.tipoBase || 'ON') : log.tipo;
  const varianti = ctx.variantsOf(cat);

  // header: data completa a sinistra; a destra 🔄 ✏️ | ON/OFF ▼
  root.append(el('div', { class: 'ohdr' }, [
    el('div', { class: 'ohdr__date', text: fmtDate(log.data) }),
    el('div', { class: 'ohdr__ctrl' }, [
      el('button', { class: 'ico-tool', 'aria-label': 'Ricalcola', html: icon.refresh(18), onClick: () => ctx.recalcNow() }),
      el('button', { class: `ico-tool ${ctx.editMode ? 'is-active' : ''}`, 'aria-label': ctx.editMode ? 'Fine modifica' : 'Modifica', html: icon.pencil(18), onClick: () => ctx.toggleEditMode() }),
      dayControl(sgarro, on, varianti, log, ctx),
    ]),
  ]));

  for (const meal of log.meals) root.append(mealCard(meal, foods, ctx, sgarro));

  // "Fuori piano" ha senso solo quando NON sei gia in giornata sgarro
  if (!sgarro) root.append(el('button', { class: 'addf', onClick: () => ctx.addSgarro() }, [
    el('span', { html: icon.plus(16) }), 'Fuori piano',
  ]));

  const target = sgarro ? sgarroTarget(log, foods) : template.target;
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

// pill ON/OFF/SGARRO + chevron che apre il menu (varianti + azioni giorno)
function dayControl(sgarro, on, varianti, log, ctx) {
  const cls = sgarro ? 'daybtn--sgarro' : (on ? '' : 'daybtn--off');
  const label = sgarro ? 'SGARRO' : (on ? 'ON' : 'OFF');
  const ic = sgarro ? 'offplan' : (on ? 'on' : 'off');

  const btn = el('button', {
    class: `daybtn ${cls}`,
    'aria-label': `Giornata ${label}. Apri opzioni giorno.`,
    html: icon[ic](16) + `<span>${label}</span>` + icon.chevronDown(15),
    onClick: () => openDayMenu(btn, sgarro, on, varianti, log, ctx),
  });
  return btn;
}

function openDayMenu(anchor, sgarro, on, varianti, log, ctx) {
  const items = [];

  // switch categoria ON/OFF
  items.push({ label: on ? 'Passa a OFF' : 'Passa a ON', icon: on ? 'off' : 'on', act: () => ctx.toggleDayType() });

  // varianti della categoria corrente
  if (!sgarro && varianti.length > 0) {
    for (const v of varianti) {
      items.push({ label: v.nome, icon: 'check', muted: v.id !== log.variantId, act: () => ctx.applyVariant(v.id) });
    }
  }

  // sgarro on/off
  items.push({ label: sgarro ? 'Annulla sgarro' : 'Segna come sgarro', icon: 'offplan', danger: !sgarro, act: () => ctx.toggleSgarroDay() });

  const menu = el('div', { class: 'daymenu' }, items.map((it) => el('button', {
    class: `daymenu__i ${it.muted ? 'is-muted' : ''} ${it.danger ? 'is-danger' : ''}`,
    html: icon[it.icon](16) + `<span>${it.label}</span>`,
    onClick: () => { close(); it.act(); },
  })));

  const back = el('div', { class: 'daymenu-backdrop', onClick: (e) => { if (e.target === back) close(); } }, [menu]);
  function close() { back.remove(); }
  document.body.append(back);
}

function mealCard(meal, foods, ctx, sgarro) {
  const locked = meal.righe.length > 0 && meal.righe.every((r) => r.stato === 'bloccata');
  const m = mealMacros(meal, foods);
  const editable = ctx.editMode || sgarro; // in SGARRO si aggiunge sempre

  const head = el('div', { class: 'meal__head' }, [
    el('span', { class: `meal__ic meal__ic--${mealIconKey(meal.id)}`, html: icon[mealIconKey(meal.id)](18) }),
    el('span', { class: 'meal__name', text: meal.nome }),
    // niente lucchetto in giornata sgarro (non ha target/blocchi)
    sgarro ? null : el('button', {
      class: 'meal__lock', 'aria-pressed': String(locked),
      'aria-label': locked ? `${meal.nome} bloccato` : `${meal.nome} aperto`,
      html: icon[locked ? 'lockClosed' : 'lockOpen'](16),
      onClick: () => ctx.toggleMealLock(meal.id),
    }),
    el('span', { class: 'meal__tot', text: `${round(m.kcal)} kcal` }),
  ]);

  const rows = meal.righe.map((r, i) => (ctx.editMode || sgarro) ? editFoodRow(meal.id, r, i, foods, ctx) : foodRow(meal.id, r, foods, ctx));
  const kids = [head, ...rows];
  if (meal.righe.length === 0 && !editable) kids.push(el('div', { class: 'meal-empty', text: '—' }));
  if (editable) kids.push(el('button', { class: 'add-food', onClick: () => ctx.addRowToMeal(meal.id) }, [
    el('span', { html: icon.plus(15) }), 'Aggiungi',
  ]));
  return el('div', { class: `meal ${locked ? 'meal--locked' : ''}` }, kids);
}

function foodRow(mealId, r, foods, ctx) {
  const food = foods[r.foodId];
  const nome = food ? food.nome : r.foodId;
  const mm = macrosOfRows([r], flatFoods(foods));

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
    el('input', {
      class: `erow__g ${r.locked ? 'is-locked' : ''}`, type: 'text', inputmode: 'decimal',
      value: fmtG(r.grammatura), disabled: r.locked, 'aria-label': `Grammi di ${nome}`,
      onChange: (e) => ctx.setRowGram(mealId, index, parseFloat(String(e.target.value).replace(',', '.')) || 0),
    }),
    el('button', { class: 'erow__lock', 'aria-pressed': String(!!r.locked),
      'aria-label': r.locked ? `${nome} bloccato` : `Blocca ${nome}`,
      html: icon[r.locked ? 'lockClosed' : 'lockOpen'](16),
      onClick: () => ctx.toggleRowLock(mealId, index) }),
    el('button', { class: 'erow__del', 'aria-label': `Rimuovi ${nome}`, html: icon.trash(16),
      onClick: () => ctx.removeRow(mealId, index) }),
  ]);
}

// mostra grammi senza arrotondare
function fmtG(g) { const n = Number(g) || 0; return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10); }

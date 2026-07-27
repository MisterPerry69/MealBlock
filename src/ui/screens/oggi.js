// oggi.js — la schermata principale. Pineapple-plus.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { renderTracker } from '../tracker.js';
import { eatenMacros, mealMacros, flatFoods, round } from '../format.js';
import { weekdayKey, isSgarroDay } from '../../core/day.js';
import { macrosOfRows } from '../../core/solver.js';

const DOW = { lun:'lun', mar:'mar', mer:'mer', gio:'gio', ven:'ven', sab:'sab', dom:'dom' };
const MON = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
function fmtDate(iso){ const [,m,d]=iso.split('-').map(Number); return `${DOW[weekdayKey(iso)]} ${d} ${MON[m-1]}`; }

const MEAL_IC = { colazione:'colazione', pranzo:'pranzo', cena:'cena', spuntino:'spuntino' };
const mealIconKey = (id) => MEAL_IC[id] || 'spuntino';

export function renderOggi(root, ctx) {
  const { log, foods, template } = ctx.today;
  const sgarro = isSgarroDay(log);
  const on = (sgarro ? (log.tipoBase || 'ON') : log.tipo) === 'ON';

  // header con day toggle: tap = ON/OFF, hold = SGARRO
  root.append(el('div', { class: 'hdr' }, [
    el('div', {}, [
      el('div', { class: 'hdr__eyebrow', text: 'Ciao' }),
      el('div', { class: 'hdr__title', text: fmtDate(log.data) }),
    ]),
    dayToggle(sgarro, on, ctx),
  ]));

  // selettore variante (se la categoria ha piu di un piano)
  const cat = sgarro ? (log.tipoBase || 'ON') : log.tipo;
  const varianti = ctx.variantsOf(cat);
  if (!sgarro && varianti.length > 1) root.append(variantPicker(varianti, log.variantId, ctx));

  // strumenti: ricalcola + modifica
  root.append(el('div', { class: 'oggi-tools' }, [
    el('button', { class: 'tool', onClick: () => ctx.recalcNow() }, [
      el('span', { html: icon.refresh(16) }), 'Ricalcola',
    ]),
    el('button', { class: `tool ${ctx.editMode ? 'tool--attention' : ''}`, onClick: () => ctx.toggleEditMode() }, [
      el('span', { html: icon.pencil(16) }), ctx.editMode ? 'Fine' : 'Modifica',
    ]),
  ]));

  for (const meal of log.meals) root.append(mealCard(meal, foods, ctx));

  root.append(el('button', { class: 'addf', onClick: () => ctx.addSgarro() }, [
    el('span', { html: icon.plus(16) }), 'Fuori piano',
  ]));

  // tracker: se SGARRO non c'e target rigido -> mostra consumo senza "sforare"
  const target = sgarro ? sgarroTarget(log, foods) : template.target;
  renderTracker(eatenMacros(log, foods), target);
}

// giornata SGARRO: il "target" e il totale stesso della giornata (barre piene, no colpa)
function sgarroTarget(log, foods) {
  const flat = flatFoods(foods);
  const rows = [];
  for (const meal of log.meals) for (const r of meal.righe) rows.push(r);
  const t = macrosOfRows(rows, flat);
  return { kcal: t.kcal || 1, carbo: t.carbo || 1, prot: t.prot || 1, fat: t.fat || 1 };
}

function dayToggle(sgarro, on, ctx) {
  const cls = sgarro ? 'daybtn--sgarro' : (on ? '' : 'daybtn--off');
  const label = sgarro ? 'SGARRO' : (on ? 'ON' : 'OFF');
  const ic = sgarro ? 'offplan' : (on ? 'on' : 'off');

  const btn = el('button', {
    class: `daybtn ${cls}`,
    'aria-label': `Giornata ${label}. Tocca per ON/OFF, tieni premuto per sgarro.`,
    html: icon[ic](17) + `<span>${label}</span>`,
  });

  // tap = toggle ON/OFF ; hold (500ms) = toggle SGARRO
  let held = false, timer = null;
  const start = () => { held = false; timer = setTimeout(() => { held = true; ctx.toggleSgarroDay(); }, 500); };
  const end = (e) => { clearTimeout(timer); if (!held) { e.preventDefault(); ctx.toggleDayType(); } };
  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointerleave', () => clearTimeout(timer));
  return btn;
}

function variantPicker(varianti, currentId, ctx) {
  const wrap = el('div', { class: 'vpick' });
  for (const v of varianti) {
    wrap.append(el('button', {
      class: `vpick__b ${v.id === currentId ? 'is-active' : ''}`,
      text: v.nome,
      onClick: () => ctx.applyVariant(v.id),
    }));
  }
  return wrap;
}

function mealCard(meal, foods, ctx) {
  const locked = meal.righe.length > 0 && meal.righe.every((r) => r.stato === 'bloccata');
  const m = mealMacros(meal, foods);

  const head = el('div', { class: 'meal__head' }, [
    el('span', { class: `meal__ic meal__ic--${mealIconKey(meal.id)}`, html: icon[mealIconKey(meal.id)](18) }),
    el('span', { class: 'meal__name', text: meal.nome }),
    el('button', {
      class: 'meal__lock', 'aria-pressed': String(locked),
      'aria-label': locked ? `${meal.nome} bloccato` : `${meal.nome} aperto`,
      html: icon[locked ? 'lockClosed' : 'lockOpen'](16),
      onClick: () => ctx.toggleMealLock(meal.id),
    }),
    el('span', { class: 'meal__tot', text: `${round(m.kcal)} kcal` }),
  ]);

  const rows = meal.righe.map((r, i) => ctx.editMode ? editFoodRow(meal.id, r, i, foods, ctx) : foodRow(meal.id, r, foods, ctx));
  const kids = [head, ...rows];
  if (ctx.editMode) kids.push(el('button', { class: 'add-food', onClick: () => ctx.addRowToMeal(meal.id) }, [
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

// riga in modalita modifica: cambia grammatura, sostituisci cibo, rimuovi
function editFoodRow(mealId, r, index, foods, ctx) {
  const nome = foods[r.foodId]?.nome || r.foodId;
  return el('div', { class: 'erow' }, [
    el('button', { class: 'erow__swap', 'aria-label': `Sostituisci ${nome}`, text: nome,
      onClick: () => ctx.replaceFood(mealId, index) }),
    el('input', {
      class: 'erow__g', type: 'number', inputmode: 'numeric', min: '0',
      value: String(round(r.grammatura)), 'aria-label': `Grammi di ${nome}`,
      onChange: (e) => ctx.setRowGram(mealId, index, Number(e.target.value)),
    }),
    el('button', { class: 'erow__del', 'aria-label': `Rimuovi ${nome}`, html: icon.trash(16),
      onClick: () => ctx.removeRow(mealId, index) }),
  ]);
}

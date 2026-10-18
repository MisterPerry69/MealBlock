// banco.js — editor "banco da lavoro" di una giornata. Pineapple-plus.

import { el, gramInput } from '../dom.js';
import { icon, mealIcon } from '../icons.js';
import { renderTracker, clearTracker } from '../tracker.js';
import { round, flatFoods, mealMacros, fmtDate, macroText } from '../format.js';
import { macrosOfRows } from '../../core/solver.js';

export function renderBanco(root, ctx) {
  const { plan, foods, target } = ctx.banco;
  const flat = flatFoods(foods);

  // header: indietro + nome del piano (rinominabile) a sx, azioni icona a dx.
  // Banco di un GIORNO: sotto al nome c'e la data; il chip ON/OFF cambia tipo e
  // target del giorno; il floppy salva le modifiche nel piano (se il nome e
  // cambiato crea invece un piano nuovo). Niente di tutto cio per SGARRO.
  const isDay = !!ctx.banco.dayISO;
  const isBlock = !!ctx.banco.blockId;
  const isSgarroPlan = plan.tipo === 'SGARRO';
  const cat = isBlock
    ? el('button', { class: 'banco-name__cat banco-name__cat--btn', 'aria-label': 'Tipo di pasto: tocca per cambiare', text: plan.meals[0].nome, onClick: () => ctx.bancoCycleBlockMeal() })
    : (isDay && !isSgarroPlan)
    ? el('button', { class: `banco-name__cat banco-name__cat--btn ${plan.tipo === 'OFF' ? 'is-off' : ''}`, 'aria-label': `Giornata ${plan.tipo}: tocca per cambiare tipo e target`, text: plan.tipo, onClick: () => ctx.bancoToggleType() })
    : el('span', { class: `banco-name__cat ${plan.tipo === 'OFF' ? 'is-off' : ''}`, text: plan.tipo });
  root.append(el('div', { class: 'banco-hdr' }, [
    el('button', { class: 'banco-back', 'aria-label': 'Indietro', html: icon.back(20), onClick: () => ctx.bancoClose() }),
    el('button', { class: 'banco-name', onClick: () => ctx.bancoRename() }, [
      el('span', { text: plan.nome || 'Piano' }),
      el('span', { class: 'banco-name__edit', html: icon.pencil(14) }),
    ]),
    cat,
    (isDay && !isSgarroPlan) ? el('button', { class: 'ico-tool', 'aria-label': 'Salva le modifiche nel piano', html: icon.save(18), onClick: () => ctx.bancoSave() }) : null,
  ]));
  if (isDay) root.append(el('div', { class: 'banco-date', text: fmtDate(ctx.banco.dayISO) }));

  if (isBlock) {
    for (const meal of plan.meals) root.append(mealBlock(meal, foods, flat, ctx));
    root.append(el('button', { class: 'banco-del', text: 'Elimina blocco', onClick: () => ctx.bancoDeleteBlock() }));
    clearTracker();
    return;
  }

  root.append(el('div', { class: 'banco-target' }, [
    'target ', el('b', { text: `${target.kcal}` }), ' kcal · ',
    el('b', { text: `${target.carbo}` }), 'C ', el('b', { text: `${target.prot}` }), 'P ', el('b', { text: `${target.fat}` }), 'F',
  ]));

  for (const meal of plan.meals) root.append(mealBlock(meal, foods, flat, ctx));

  // tracker = totale reale del piano (cosi come sta) vs target
  const allRows = [];
  for (const meal of plan.meals) for (const r of meal.righe) allRows.push(r);
  renderTracker(macrosOfRows(allRows, flat), target);
}

function mealBlock(meal, foods, flat, ctx) {
  const m = mealMacros(meal, foods);
  const head = el('div', { class: 'meal__head' }, [
    el('span', { class: `meal__ic meal__ic--${mealIcon(meal.id)}`, html: icon[mealIcon(meal.id)](18) }),
    el('span', { class: 'meal__name', text: meal.nome }),
    // totale macro del pasto (distribuzione)
    el('span', { class: 'meal__macros' }, [
      el('span', { 'data-m': 'kcal', text: macroText('kcal', m.kcal, true) }),
      el('span', { class: 'mc mc--c', 'data-m': 'carbo', text: macroText('carbo', m.carbo, true) }),
      el('span', { class: 'mc mc--p', 'data-m': 'prot', text: macroText('prot', m.prot, true) }),
      el('span', { class: 'mc mc--f', 'data-m': 'fat', text: macroText('fat', m.fat, true) }),
    ]),
  ]);
  const rows = meal.righe.map((r, i) => editRow(meal.id, r, i, foods, flat, ctx));
  const addBtn = el('button', { class: 'add-food', onClick: () => ctx.bancoAddFood(meal.id) }, [
    el('span', { html: icon.plus(15) }), 'Aggiungi cibo',
  ]);
  return el('div', { class: 'meal', 'data-meal': meal.id }, [head, ...rows, addBtn]);
}

function editRow(mealId, r, index, foods, flat, ctx) {
  const nome = foods[r.foodId]?.nome || r.foodId;
  const mm = macrosOfRows([r], flat); // valori di questa riga a questa grammatura

  return el('div', { class: 'erow erow--rich', 'data-row': String(index) }, [
    el('div', { class: 'erow__info' }, [
      el('div', { class: 'erow__name', text: nome }),
      el('div', { class: 'row__info' }, [
        el('span', { 'data-m': 'kcal', text: macroText('kcal', mm.kcal) }),
        el('span', { class: 'mc mc--c', 'data-m': 'carbo', text: macroText('carbo', mm.carbo) }),
        el('span', { class: 'mc mc--p', 'data-m': 'prot', text: macroText('prot', mm.prot) }),
        el('span', { class: 'mc mc--f', 'data-m': 'fat', text: macroText('fat', mm.fat) }),
      ]),
    ]),
    gramInput({
      value: r.grammatura,
      ariaLabel: `Grammi di ${nome}`,
      onCommit: (g) => ctx.bancoSetGram(mealId, index, g),
    }),
    el('button', {
      class: 'erow__del', 'aria-label': `Rimuovi ${nome}`,
      html: icon.trash(16), onClick: () => ctx.bancoRemove(mealId, index),
    }),
  ]);
}

// Aggiorna i numeri (riga e totale pasto) senza ricostruire il DOM: serve dopo
// aver cambiato una grammatura, quando un render completo toglierebbe il focus
// al campo successivo.
export function refreshBancoNumbers(plan, foods) {
  const flat = flatFoods(foods);
  const paint = (node, m, head) => {
    if (!node) return;
    for (const k of ['kcal', 'carbo', 'prot', 'fat']) {
      const n = node.querySelector(`[data-m="${k}"]`);
      if (n) n.textContent = macroText(k, m[k], head);
    }
  };
  for (const meal of plan.meals) {
    const box = document.querySelector(`.meal[data-meal="${meal.id}"]`);
    if (!box) continue;
    paint(box.querySelector('.meal__macros'), macrosOfRows(meal.righe, flat), true);
    meal.righe.forEach((r, i) => paint(box.querySelector(`.erow[data-row="${i}"] .row__info`), macrosOfRows([r], flat), false));
  }
}

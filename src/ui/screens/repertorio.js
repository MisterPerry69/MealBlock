// repertorio.js — sezione Cibi: due sottosezioni, BLOCCHI (pasti prefatti) e CIBI.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { clearTracker } from '../tracker.js';
import { guessEmoji } from '../modal.js';
import { flatFoods, round, MEAL_TYPES } from '../format.js';
import { macrosOfRows } from '../../core/solver.js';

const MEAL_EMOJI = { colazione: '🥣', pranzo: '🍝', spuntino: '🍎', cena: '🌙' };
let sub = 'blocchi'; // 'blocchi' | 'cibi'

export function renderRepertorio(root, ctx) {
  clearTracker();

  root.append(el('div', { class: 'hdr' }, [
    el('div', {}, [el('div', { class: 'hdr__title', text: 'Cibi' })]),
    el('button', {
      class: 'iconbtn', 'aria-label': sub === 'blocchi' ? 'Nuovo blocco' : 'Aggiungi cibo', html: icon.plus(20),
      onClick: () => (sub === 'blocchi' ? ctx.createBlock() : ctx.addFood()),
    }),
  ]));

  root.append(el('div', { class: 'subtabs' }, [
    el('button', { class: `subtab ${sub === 'blocchi' ? 'is-on' : ''}`, text: 'BLOCCHI', onClick: () => { sub = 'blocchi'; ctx.rerender(); } }),
    el('button', { class: `subtab ${sub === 'cibi' ? 'is-on' : ''}`, text: 'CIBI', onClick: () => { sub = 'cibi'; ctx.rerender(); } }),
  ]));

  if (sub === 'blocchi') renderBlocchi(root, ctx); else renderCibi(root, ctx);
}

function macroSpans(m, r = round) {
  return [
    el('span', { class: 'mc mc--c', text: `${r(m.carbo)}C ` }),
    el('span', { class: 'mc mc--p', text: `${r(m.prot)}P ` }),
    el('span', { class: 'mc mc--f', text: `${r(m.fat)}F` }),
  ];
}

function renderBlocchi(root, ctx) {
  const blocks = [...ctx.blocks];
  if (blocks.length === 0) {
    root.append(el('div', { class: 'empty', text: 'Crea i pasti che ripeti spesso (es. "Colazione proteica"): poi li inserisci in un pasto con un tocco, scomposti nei loro cibi.' }));
    return;
  }
  const order = (b) => MEAL_TYPES.findIndex((t) => t.id === b.mealId);
  blocks.sort((a, b) => order(a) - order(b) || a.nome.localeCompare(b.nome));
  const flat = flatFoods(ctx.foods);

  const grid = el('div', { class: 'food-grid' });
  for (const b of blocks) {
    const m = macrosOfRows(b.righe, flat);
    const tipo = MEAL_TYPES.find((t) => t.id === b.mealId)?.nome || b.mealId;
    grid.append(el('button', { class: 'food-card', onClick: () => ctx.openBlockBanco(b.id) }, [
      el('div', { class: 'food-card__emoji', text: MEAL_EMOJI[b.mealId] || '🍽️' }),
      el('div', { class: 'food-card__name', text: b.nome }),
      el('div', { class: 'food-card__meta', text: `${tipo} · ${b.righe.length} ${b.righe.length === 1 ? 'cibo' : 'cibi'}` }),
      el('div', { class: 'food-card__meta' }, [`${round(m.kcal)} kcal · `, ...macroSpans(m)]),
    ]));
  }
  root.append(grid);
}

function renderCibi(root, ctx) {
  const foods = Object.values(ctx.foods);
  if (foods.length === 0) {
    root.append(el('div', { class: 'empty', text: 'Aggiungi i cibi che mangi davvero. Bastano quelli.' }));
    return;
  }

  const grid = el('div', { class: 'food-grid' });
  for (const f of foods) {
    const p = f.per100g;
    grid.append(el('button', { class: 'food-card', onClick: () => ctx.editFood(f.id) }, [
      el('div', { class: 'food-card__emoji', text: f.emoji || guessEmoji(f.nome) }),
      el('div', { class: 'food-card__name', text: f.nome }),
      el('div', { class: 'food-card__meta' }, [`${p.kcal} kcal · `, ...macroSpans(p, (n) => n)]),
    ]));
  }
  root.append(grid);
}

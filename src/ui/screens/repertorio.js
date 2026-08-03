// repertorio.js — i cibi. Griglia con emoji.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { clearTracker } from '../tracker.js';
import { guessEmoji } from '../modal.js';

export function renderRepertorio(root, ctx) {
  clearTracker();
  const foods = Object.values(ctx.foods);

  root.append(el('div', { class: 'hdr' }, [
    el('div', {}, [el('div', { class: 'hdr__title', text: 'Cibi' })]),
    el('button', { class: 'iconbtn', 'aria-label': 'Aggiungi cibo', html: icon.plus(20), onClick: () => ctx.addFood() }),
  ]));

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
      el('div', { class: 'food-card__meta' }, [
        `${p.kcal} kcal · `,
        el('span', { class: 'mc mc--c', text: `${p.carbo}C ` }),
        el('span', { class: 'mc mc--p', text: `${p.prot}P ` }),
        el('span', { class: 'mc mc--f', text: `${p.fat}F` }),
      ]),
    ]));
  }
  root.append(grid);
}

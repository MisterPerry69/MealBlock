// piani.js — categorie ON/OFF, ognuna con le sue varianti (piani).

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { clearTracker } from '../tracker.js';
import { logMacros, round } from '../format.js';

export function renderPiani(root, ctx) {
  clearTracker();
  root.append(el('div', { class: 'hdr' }, [
    el('div', {}, [el('div', { class: 'hdr__title', text: 'Piani' })]),
  ]));

  for (const cat of ['ON', 'OFF']) root.append(categoryBlock(cat, ctx));
}

function categoryBlock(cat, ctx) {
  const varianti = ctx.variantsOf(cat);

  const header = el('div', { class: 'cat-head' }, [
    el('span', { class: `chip chip--${cat === 'ON' ? 'on' : 'off'}`, text: cat }),
    el('button', { class: 'cat-add', 'aria-label': `Nuova variante ${cat}`, html: icon.plus(16), onClick: () => ctx.createVariant(cat) }),
  ]);

  const stack = el('div', { class: 'stack' });
  for (const v of varianti) {
    const m = logMacros({ meals: v.meals }, ctx.foods);
    stack.append(el('div', { class: 'item item--variant' }, [
      el('button', { class: 'variant-open', onClick: () => ctx.openBanco(v.id) }, [
        el('div', {}, [
          el('div', { class: 'item__title' }, [
            v.nome,
            v.isDefault ? el('span', { class: 'variant-default', text: 'default' }) : null,
          ]),
          el('div', { class: 'item__meta', text: `${round(m.kcal)} / ${v.target.kcal} kcal` }),
        ]),
      ]),
      el('div', { class: 'variant-tools' }, [
        el('button', { class: 'vt', 'aria-label': 'Rinomina', html: icon.pencil(15), onClick: () => ctx.renameVariant(v.id) }),
        !v.isDefault ? el('button', { class: 'vt', 'aria-label': 'Imposta come default', html: icon.check(15), onClick: () => ctx.setDefaultVariant(v.id) }) : null,
        !v.isDefault ? el('button', { class: 'vt', 'aria-label': 'Elimina', html: icon.trash(15), onClick: () => ctx.deleteVariant(v.id) }) : null,
      ]),
    ]));
  }

  return el('div', { style: 'margin-bottom:24px' }, [header, stack]);
}

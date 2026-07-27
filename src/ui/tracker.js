// tracker.js — le 4 barre macro (kcal/carbo/prot/fat) nel dock.
// Layout verticale: etichetta sopra, numero X/Y, barra sotto. Ogni macro col
// suo colore. Usato sia da Oggi (mangiato) sia dal Banco (totale piano).

import { el, clear } from './dom.js';
import { round } from './format.js';

const DEFS = [
  { k: 'kcal',  label: 'kcal',    color: 'var(--kcal)', unit: '' },
  { k: 'carbo', label: 'carbo',   color: 'var(--c)',    unit: 'g' },
  { k: 'prot',  label: 'protein', color: 'var(--p)',    unit: 'g' },
  { k: 'fat',   label: 'fat',     color: 'var(--f)',    unit: 'g' },
];

export function renderTracker(values, target) {
  const host = document.getElementById('tracker');
  clear(host);
  const trk = el('div', { class: 'trk' });

  for (const d of DEFS) {
    const val = values[d.k] || 0;
    const tgt = target[d.k] || 1;
    const pct = Math.max(0, Math.min(100, (val / tgt) * 100));

    trk.append(el('div', { class: 'gauge' }, [
      el('span', { class: 'gauge__k', style: `color:${d.color}`, text: d.label }),
      el('span', { class: 'gauge__n' }, [
        `${round(val)}`, el('span', { class: 'gt', text: `/${round(tgt)}${d.unit}` }),
      ]),
      el('div', { class: 'gauge__track' }, [
        el('div', { class: 'gauge__fill', style: `width:${pct}%;background:${d.color}` }),
      ]),
    ]));
  }
  host.append(trk);
}

export function clearTracker() {
  clear(document.getElementById('tracker'));
}

// storico.js — calendario mensile. Ogni giorno: ok / sgarro / non tracciato.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { clearTracker } from '../tracker.js';
import { dayStatus } from '../../core/day.js';

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const DOW = ['L','M','M','G','V','S','D']; // lun..dom

function iso(y, m, d) { return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

// stato di navigazione del calendario (mese visualizzato), persistente tra render
let viewY = null, viewM = null;

export function renderStorico(root, ctx) {
  clearTracker();
  const today = new Date();
  if (viewY === null) { viewY = today.getFullYear(); viewM = today.getMonth(); }

  // indicizza i log per data
  const byDate = {};
  for (const log of ctx.history) byDate[log.data] = log;

  // header con navigazione mese
  root.append(el('div', { class: 'hdr' }, [
    el('div', {}, [el('div', { class: 'hdr__title', text: 'Storico' })]),
  ]));

  root.append(el('div', { class: 'cal-nav' }, [
    el('button', { class: 'cal-arrow', 'aria-label': 'Mese precedente', html: icon.back(20), onClick: () => { shiftMonth(-1); ctx.rerender(); } }),
    el('div', { class: 'cal-title', text: `${MESI[viewM]} ${viewY}` }),
    el('button', { class: 'cal-arrow', 'aria-label': 'Mese successivo', html: icon.back(20).replace('m15 18-6-6 6-6','m9 18 6-6-6-6'), onClick: () => { shiftMonth(1); ctx.rerender(); } }),
  ]));

  // intestazione giorni settimana
  const grid = el('div', { class: 'cal-grid' });
  for (const d of DOW) grid.append(el('div', { class: 'cal-dow', text: d }));

  // celle vuote prima del giorno 1 (lun=0)
  const first = new Date(viewY, viewM, 1);
  const offset = (first.getDay() + 6) % 7; // getDay: dom=0 -> vogliamo lun=0
  for (let i = 0; i < offset; i++) grid.append(el('div', { class: 'cal-cell cal-cell--empty' }));

  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const todayISO = iso(today.getFullYear(), today.getMonth(), today.getDate());

  for (let d = 1; d <= daysInMonth; d++) {
    const dISO = iso(viewY, viewM, d);
    const log = byDate[dISO];
    const st = dayStatus(log).stato; // 'ok' | 'sgarro' | 'vuoto'
    const isToday = dISO === todayISO;
    grid.append(el('div', { class: `cal-cell cal-cell--${st} ${isToday ? 'is-today' : ''}` }, [
      el('span', { class: 'cal-day', text: String(d) }),
      st === 'ok' ? el('span', { class: 'cal-mark cal-mark--ok', html: icon.check(12) })
        : st === 'sgarro' ? el('span', { class: 'cal-mark cal-mark--ko', html: icon.offplan(12) })
        : el('span', { class: 'cal-mark cal-mark--none' }),
    ]));
  }
  root.append(grid);

  // legenda
  root.append(el('div', { class: 'cal-legend' }, [
    el('span', {}, [el('span', { class: 'lg lg--ok', html: icon.check(11) }), 'in linea']),
    el('span', {}, [el('span', { class: 'lg lg--ko', html: icon.offplan(11) }), 'sgarro']),
    el('span', {}, [el('span', { class: 'lg lg--none' }), 'non tracciato']),
  ]));
}

function shiftMonth(delta) {
  viewM += delta;
  if (viewM < 0) { viewM = 11; viewY--; }
  else if (viewM > 11) { viewM = 0; viewY++; }
}

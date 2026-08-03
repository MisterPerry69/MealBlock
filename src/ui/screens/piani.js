// piani.js — tab "Settimana": 2 sotto-tab, SETTIMANA (griglia 7 giorni con
// date reali) e TARGET (griglia varianti ON/OFF con macro editabili).

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { clearTracker } from '../tracker.js';
import { logMacros, round } from '../format.js';
import { weekDays, weekdayKey, isSgarroDay } from '../../core/day.js';
import { openPlanPicker } from '../modal.js';

const DOW_FULL = { lun: 'LUNEDÌ', mar: 'MARTEDÌ', mer: 'MERCOLEDÌ', gio: 'GIOVEDÌ', ven: 'VENERDÌ', sab: 'SABATO', dom: 'DOMENICA' };
const MON = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const MON_SHORT = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
function dLabelFull(iso) { const [,m,d] = iso.split('-').map(Number); return `${d} ${MON[m-1]}`; }
function dLabelShort(iso) { const [,m,d] = iso.split('-').map(Number); return `${d} ${MON_SHORT[m-1]}`; }

let subTab = 'settimana';   // 'settimana' | 'target'
let targetCat = 'ON';       // 'ON' | 'OFF'

export function renderPiani(root, ctx) {
  clearTracker();

  root.append(el('div', { class: 'hdr' }, [
    el('div', {}, [el('div', { class: 'hdr__title', text: 'Settimana' })]),
  ]));

  root.append(el('div', { class: 'subtabs' }, [
    el('button', { class: `subtab ${subTab === 'settimana' ? 'is-on' : ''}`, text: 'SETTIMANA', onClick: () => { subTab = 'settimana'; ctx.rerender(); } }),
    el('button', { class: `subtab ${subTab === 'target' ? 'is-on' : ''}`, text: 'TARGET', onClick: () => { subTab = 'target'; ctx.rerender(); } }),
  ]));

  if (subTab === 'settimana') renderSettimana(root, ctx);
  else renderTarget(root, ctx);
}

// =================== SETTIMANA ===================

function renderSettimana(root, ctx) {
  const days = weekDays(ctx.weekRef);
  const oggi = new Date(); const p = (n) => String(n).padStart(2, '0');
  const todayISO = `${oggi.getFullYear()}-${p(oggi.getMonth()+1)}-${p(oggi.getDate())}`;

  root.append(el('div', { class: 'cal-nav' }, [
    el('button', { class: 'cal-arrow', 'aria-label': 'Settimana precedente', html: icon.back(20), onClick: () => ctx.shiftWeek(-7) }),
    el('div', { class: 'cal-title', text: `${dLabelShort(days[0])} – ${dLabelShort(days[6])}` }),
    el('button', { class: 'cal-arrow', 'aria-label': 'Settimana successiva', html: icon.back(20).replace('m15 18-6-6 6-6','m9 18 6-6-6-6'), onClick: () => ctx.shiftWeek(7) }),
  ]));

  const grid = el('div', { class: 'week-grid' });
  for (const iso of days) {
    const log = ctx.logForDate(iso);
    const isToday = iso === todayISO;
    const assigned = log && log.meals && log.meals.some((m) => m.righe && m.righe.length);
    const tipo = log ? (isSgarroDay(log) ? 'SGARRO' : log.tipo) : null;
    const variant = log && log.variantId ? ctx.variantsOf('ON').concat(ctx.variantsOf('OFF')).find((v) => v.id === log.variantId) : null;

    const dayLabel = el('div', { class: 'week-cell__d' }, [
      el('span', { class: 'week-cell__dow', text: DOW_FULL[weekdayKey(iso)] }),
      el('span', { class: 'week-cell__date', text: dLabelFull(iso) }),
    ]);

    let body;
    if (assigned) {
      body = el('button', { class: 'week-cell__body', onClick: () => ctx.openDayBanco(iso) }, [
        el('span', { class: `chip chip--${tipo === 'ON' ? 'on' : (tipo === 'OFF' ? 'off' : 'sgarro')}`, text: tipo }),
        el('span', { class: 'week-cell__variant', text: variant ? variant.nome : '' }),
        el('span', { class: 'week-cell__kcal', text: `${round(logMacros(log, ctx.foods).kcal)} kcal` }),
      ]);
    } else {
      body = el('button', {
        class: 'week-cell__add', 'aria-label': `Assegna piano a ${DOW_FULL[weekdayKey(iso)]}`,
        html: icon.plus(28), onClick: () => chooseFor(iso, ctx),
      });
    }

    grid.append(el('div', { class: `week-cell ${isToday ? 'is-today' : ''}` }, [
      dayLabel,
      body,
      assigned ? el('button', {
        class: 'week-cell__x', 'aria-label': 'Rimuovi piano assegnato',
        html: icon.close(14), onClick: () => ctx.clearDay(iso),
      }) : null,
    ]));
  }
  root.append(grid);
}

function chooseFor(iso, ctx) {
  openPlanPicker({
    variants: [...ctx.variantsOf('ON'), ...ctx.variantsOf('OFF')],
    onPick: (variantId) => ctx.assignPlanToDay(iso, variantId),
  });
}

// =================== TARGET ===================

function renderTarget(root, ctx) {
  root.append(el('div', { class: 'subtabs subtabs--cat' }, [
    el('button', { class: `subtab subtab--on ${targetCat === 'ON' ? 'is-on' : ''}`, text: 'ON', onClick: () => { targetCat = 'ON'; ctx.rerender(); } }),
    el('button', { class: `subtab subtab--off ${targetCat === 'OFF' ? 'is-on' : ''}`, text: 'OFF', onClick: () => { targetCat = 'OFF'; ctx.rerender(); } }),
  ]));

  const varianti = ctx.variantsOf(targetCat);
  const grid = el('div', { class: 'target-grid' });

  // prima card: kcal/macro target del programma, editabili inline
  grid.append(targetHeaderCard(targetCat, varianti, ctx));

  for (const v of varianti) {
    const m = logMacros({ meals: v.meals }, ctx.foods);
    grid.append(el('div', { class: 'target-card' }, [
      el('button', { class: 'target-card__body', onClick: () => ctx.openBanco(v.id) }, [
        el('div', { class: 'target-card__name' }, [
          v.nome, v.isDefault ? el('span', { class: 'variant-default', text: 'default' }) : null,
        ]),
        el('div', { class: 'target-card__macro', text: `${round(m.kcal)} / ${v.target.kcal} kcal` }),
      ]),
      el('div', { class: 'variant-tools' }, [
        el('button', { class: 'vt', 'aria-label': 'Rinomina', html: icon.pencil(15), onClick: () => ctx.renameVariant(v.id) }),
        !v.isDefault ? el('button', { class: 'vt', 'aria-label': 'Default', html: icon.check(15), onClick: () => ctx.setDefaultVariant(v.id) }) : null,
        !v.isDefault ? el('button', { class: 'vt', 'aria-label': 'Elimina', html: icon.trash(15), onClick: () => ctx.deleteVariant(v.id) }) : null,
      ]),
    ]));
  }

  // card finale: aggiungi nuova variante
  grid.append(el('button', {
    class: 'target-card target-card--add', 'aria-label': `Nuova variante ${targetCat}`,
    html: icon.plus(24), onClick: () => ctx.createVariant(targetCat),
  }));

  root.append(grid);
}

function targetHeaderCard(cat, varianti, ctx) {
  const base = varianti.find((v) => v.isDefault) || varianti[0];
  const target = base?.target || { kcal: 0, carbo: 0, prot: 0, fat: 0 };

  const field = (key, label) => {
    const input = el('input', {
      class: 'target-input', type: 'text', inputmode: 'decimal', value: String(target[key] ?? 0), 'aria-label': label,
    });
    input.addEventListener('focus', () => { input.dataset.prev = input.value; input.value = ''; input.placeholder = input.dataset.prev; });
    const commit = () => {
      const raw = input.value.trim();
      const n = raw === '' ? Number(input.dataset.prev || 0) : parseFloat(raw.replace(',', '.'));
      const val = Number.isFinite(n) ? Math.max(0, n) : 0;
      input.value = String(val);
      if (!base) return;
      if (val !== target[key]) ctx.setVariantTarget(base.id, { ...base.target, [key]: val });
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    return el('label', { class: 'target-field' }, [el('span', { class: 'target-field__l', text: label }), input]);
  };

  return el('div', { class: `target-card target-card--head cat-${cat.toLowerCase()}` }, [
    el('div', { class: 'target-card__name', text: `Target ${cat}` }),
    el('div', { class: 'target-fields' }, [
      field('kcal', 'kcal'), field('carbo', 'C'), field('prot', 'P'), field('fat', 'F'),
    ]),
  ]);
}

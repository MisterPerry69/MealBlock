// piani.js — vista SETTIMANA (7 giorni con date reali) + libreria varianti.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { clearTracker } from '../tracker.js';
import { logMacros, round } from '../format.js';
import { weekDays, weekdayKey, isSgarroDay } from '../../core/day.js';
import { openPlanPicker } from '../modal.js';

const DOW = { lun:'Lun', mar:'Mar', mer:'Mer', gio:'Gio', ven:'Ven', sab:'Sab', dom:'Dom' };
const MON = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
function dLabel(iso){ const [,m,d]=iso.split('-').map(Number); return `${d} ${MON[m-1]}`; }

export function renderPiani(root, ctx) {
  clearTracker();
  const days = weekDays(ctx.weekRef);
  const oggi = new Date(); const p = (n)=>String(n).padStart(2,'0');
  const todayISO = `${oggi.getFullYear()}-${p(oggi.getMonth()+1)}-${p(oggi.getDate())}`;

  root.append(el('div', { class: 'hdr' }, [
    el('div', {}, [el('div', { class: 'hdr__title', text: 'Settimana' })]),
  ]));

  // navigazione settimana
  root.append(el('div', { class: 'cal-nav' }, [
    el('button', { class: 'cal-arrow', 'aria-label': 'Settimana precedente', html: icon.back(20), onClick: () => ctx.shiftWeek(-7) }),
    el('div', { class: 'cal-title', text: `${dLabel(days[0])} – ${dLabel(days[6])}` }),
    el('button', { class: 'cal-arrow', 'aria-label': 'Settimana successiva', html: icon.back(20).replace('m15 18-6-6 6-6','m9 18 6-6-6-6'), onClick: () => ctx.shiftWeek(7) }),
  ]));

  // 7 giorni
  const stack = el('div', { class: 'stack', style: 'margin-bottom:20px' });
  for (const iso of days) {
    const log = ctx.logForDate(iso);
    const isToday = iso === todayISO;
    const assigned = log && log.meals && log.meals.some((m) => m.righe && m.righe.length);
    const tipo = log ? (isSgarroDay(log) ? 'SGARRO' : log.tipo) : null;

    stack.append(el('button', {
      class: `day-slot ${isToday ? 'is-today' : ''}`,
      onClick: () => assigned ? ctx.openDayBanco(iso) : chooseFor(iso, ctx),
    }, [
      el('div', { class: 'day-slot__d' }, [
        el('span', { class: 'day-slot__dow', text: DOW[weekdayKey(iso)] }),
        el('span', { class: 'day-slot__date', text: dLabel(iso) }),
      ]),
      assigned
        ? el('div', { class: 'day-slot__plan' }, [
            el('span', { class: `chip chip--${tipo === 'ON' ? 'on' : (tipo === 'OFF' ? 'off' : 'sgarro')}`, text: tipo }),
            el('span', { class: 'day-slot__kcal', text: `${round(logMacros(log, ctx.foods).kcal)} kcal` }),
          ])
        : el('div', { class: 'day-slot__empty', text: '+ assegna piano' }),
    ]));
  }
  root.append(stack);

  // libreria varianti (per categoria)
  for (const cat of ['ON', 'OFF']) root.append(libBlock(cat, ctx));
}

// scelta rapida del piano per un giorno
function chooseFor(iso, ctx) {
  openPlanPicker({
    variants: [...ctx.variantsOf('ON'), ...ctx.variantsOf('OFF')],
    onPick: (variantId) => ctx.assignPlanToDay(iso, variantId),
  });
}

function libBlock(cat, ctx) {
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
            v.nome, v.isDefault ? el('span', { class: 'variant-default', text: 'default' }) : null,
          ]),
          el('div', { class: 'item__meta', text: `${round(m.kcal)} / ${v.target.kcal} kcal` }),
        ]),
      ]),
      el('div', { class: 'variant-tools' }, [
        el('button', { class: 'vt', 'aria-label': 'Rinomina', html: icon.pencil(15), onClick: () => ctx.renameVariant(v.id) }),
        !v.isDefault ? el('button', { class: 'vt', 'aria-label': 'Default', html: icon.check(15), onClick: () => ctx.setDefaultVariant(v.id) }) : null,
        !v.isDefault ? el('button', { class: 'vt', 'aria-label': 'Elimina', html: icon.trash(15), onClick: () => ctx.deleteVariant(v.id) }) : null,
      ]),
    ]));
  }
  return el('div', { style: 'margin-bottom:22px' }, [header, stack]);
}

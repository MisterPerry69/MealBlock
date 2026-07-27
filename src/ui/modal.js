// modal.js — modal centrale riutilizzabile + form/dialoghi costruiti sopra.

import { el } from './dom.js';
import { icon } from './icons.js';

/**
 * Apre un modal centrale. `build(close)` riceve la funzione di chiusura e
 * restituisce il contenuto (nodo). Ritorna la funzione close.
 */
export function openModal({ title, build }) {
  let backdrop;
  function close() { backdrop?.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }

  const head = el('div', { class: 'modal__head' }, [
    el('h2', { class: 'modal__title', text: title || '' }),
    el('button', { class: 'modal__x', 'aria-label': 'Chiudi', html: icon.close(20), onClick: close }),
  ]);

  const body = build(close);
  const card = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [head, body]);
  backdrop = el('div', { class: 'modal-backdrop', onClick: (e) => { if (e.target === backdrop) close(); } }, [card]);

  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
  // focus al primo campo
  setTimeout(() => card.querySelector('input,button')?.focus(), 30);
  return close;
}

// campo input etichettato
function field(label, attrs = {}) {
  const input = el('input', { class: 'f__input', ...attrs });
  const wrap = el('label', { class: 'f' }, [el('span', { class: 'f__label', text: label }), input]);
  return { wrap, input };
}

/**
 * Form per creare/modificare un CIBO del repertorio.
 * onSave riceve { nome, per100g:{kcal,carbo,prot,fat} }.
 */
export function openFoodForm({ food, onSave }) {
  return openModal({
    title: food ? 'Modifica cibo' : 'Nuovo cibo',
    build(close) {
      const p = food?.per100g || {};
      const rg = food?.rangeGrammatura || {};
      const nome = field('Nome', { type: 'text', value: food?.nome || '', placeholder: 'es. Petto di pollo' });
      const grid = el('div', { class: 'f-grid' });
      const kcal = field('kcal / 100g', { type: 'number', inputmode: 'numeric', min: '0', value: p.kcal ?? '' });
      const carbo = field('Carbo / 100g', { type: 'number', inputmode: 'decimal', min: '0', value: p.carbo ?? '' });
      const prot = field('Prot / 100g', { type: 'number', inputmode: 'decimal', min: '0', value: p.prot ?? '' });
      const fat = field('Grassi / 100g', { type: 'number', inputmode: 'decimal', min: '0', value: p.fat ?? '' });
      grid.append(kcal.wrap, carbo.wrap, prot.wrap, fat.wrap);

      // range grammatura opzionale (limita quanto il motore puo scalare questo cibo)
      const rangeGrid = el('div', { class: 'f-grid' });
      const rmin = field('Min g (opz.)', { type: 'number', inputmode: 'numeric', min: '0', value: rg.min ?? '' });
      const rmax = field('Max g (opz.)', { type: 'number', inputmode: 'numeric', min: '0', value: rg.max ?? '' });
      rangeGrid.append(rmin.wrap, rmax.wrap);
      const rangeHint = el('div', { class: 'f-hint', text: 'Limiti di grammatura per il ricalcolo automatico. Lascia vuoto per nessun limite.' });

      const save = el('button', { class: 'modal-btn modal-btn--primary', text: 'Salva' , onClick: () => {
        const nomeV = nome.input.value.trim();
        if (!nomeV) { nome.input.focus(); return; }
        const out = {
          nome: nomeV,
          per100g: {
            kcal: Number(kcal.input.value) || 0,
            carbo: Number(carbo.input.value) || 0,
            prot: Number(prot.input.value) || 0,
            fat: Number(fat.input.value) || 0,
          },
        };
        const minV = rmin.input.value !== '' ? Number(rmin.input.value) : null;
        const maxV = rmax.input.value !== '' ? Number(rmax.input.value) : null;
        if (minV != null && maxV != null) out.rangeGrammatura = { min: minV, max: maxV };
        onSave(out);
        close();
      }});

      return el('div', {}, [nome.wrap, grid, rangeGrid, rangeHint, el('div', { class: 'modal-actions' }, [save])]);
    },
  });
}

/**
 * Form "fuori piano": scegli un cibo esistente o creane uno al volo, poi i grammi.
 * onConfirm riceve { foodId, grammatura } (creando il cibo se nuovo via onCreateFood).
 */
export function openSgarroForm({ foods, onCreateFood, onConfirm }) {
  return openModal({
    title: 'Fuori piano',
    build(close) {
      const list = Object.values(foods);
      let selectedId = list[0]?.id || null;

      // selettore cibo (dropdown nativo: semplice e affidabile)
      const sel = el('select', { class: 'f__input', onChange: (e) => { selectedId = e.target.value; } },
        list.map((f) => el('option', { value: f.id, text: `${f.nome} · ${f.per100g.kcal} kcal` })));
      const selWrap = el('label', { class: 'f' }, [el('span', { class: 'f__label', text: 'Cibo' }), sel]);

      const gram = field('Grammi mangiati', { type: 'number', inputmode: 'numeric', min: '0', placeholder: 'es. 150' });

      const newBtn = el('button', { class: 'modal-btn', text: '+ Cibo non in lista', onClick: () => {
        close();
        openFoodForm({ onSave: (data) => {
          const id = onCreateFood(data);
          // riapre il form fuori piano con il nuovo cibo preselezionato
          openSgarroFormPreselect({ foods: { ...foods, [id]: { id, ...data } }, onCreateFood, onConfirm, preId: id });
        }});
      }});

      const confirm = el('button', { class: 'modal-btn modal-btn--primary', text: 'Aggiungi', onClick: () => {
        const g = Number(gram.input.value) || 0;
        if (!selectedId || !g) { gram.input.focus(); return; }
        onConfirm({ foodId: selectedId, grammatura: g });
        close();
      }});

      return el('div', {}, [selWrap, gram.wrap, el('div', { class: 'modal-actions' }, [newBtn, confirm])]);
    },
  });
}

// variante con cibo preselezionato (dopo creazione al volo)
function openSgarroFormPreselect({ foods, onCreateFood, onConfirm, preId }) {
  const close = openSgarroForm({ foods, onCreateFood, onConfirm });
  setTimeout(() => { const s = document.querySelector('.modal select'); if (s) { s.value = preId; s.dispatchEvent(new Event('change')); } }, 40);
  return close;
}

/** Rinomina: un solo campo testo. onSave(nuovoNome). */
export function openRenameForm({ value, onSave }) {
  return openModal({
    title: 'Rinomina piano',
    build(close) {
      const f = field('Nome', { type: 'text', value: value || '' });
      const save = el('button', { class: 'modal-btn modal-btn--primary', text: 'Salva', onClick: () => {
        const v = f.input.value.trim(); if (!v) { f.input.focus(); return; }
        onSave(v); close();
      }});
      return el('div', {}, [f.wrap, el('div', { class: 'modal-actions' }, [save])]);
    },
  });
}

/** Modal di sola lettura: riepilogo modifiche al piano dopo un ricalcolo. */
export function openChangesSummary({ changes, residual }) {
  return openModal({
    title: 'Piano aggiornato',
    build() {
      const rows = changes.length
        ? changes.map((c) => el('div', { class: 'chg' }, [
            el('span', { class: 'chg__name', text: c.nome }),
            el('span', { class: 'chg__delta' }, [
              `${c.prima}g `, el('span', { class: 'chg__arrow', text: '→' }), ` ${c.dopo}g`,
            ]),
          ]))
        : [el('div', { class: 'empty', text: 'Nessuna grammatura da aggiustare.' })];

      const res = residual ? el('div', { class: 'chg-res', text: residualText(residual) }) : null;
      return el('div', {}, [el('div', { class: 'chg-list' }, rows), res]);
    },
  });
}

function residualText(r) {
  const parts = [];
  for (const [k, label, unit] of [['kcal','kcal',''],['carbo','C','g'],['prot','P','g'],['fat','F','g']]) {
    const d = Math.round(r[k]);
    if (Math.abs(d) >= (k === 'kcal' ? 30 : 5)) parts.push(`${d > 0 ? '+' : ''}${d}${unit} ${label}`);
  }
  return parts.length ? `Scarto residuo: ${parts.join(', ')}` : 'Giornata in fascia.';
}

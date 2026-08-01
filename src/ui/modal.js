// modal.js — modal centrale riutilizzabile + form/dialoghi costruiti sopra.

import { el } from './dom.js';
import { icon } from './icons.js';

// parse numero accettando virgola o punto come separatore decimale
function num(v) {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

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
      // type text + inputmode decimal: accetta virgola E punto (bug fix)
      const kcal = field('kcal / 100g', { type: 'text', inputmode: 'decimal', value: p.kcal ?? '' });
      const carbo = field('Carbo / 100g', { type: 'text', inputmode: 'decimal', value: p.carbo ?? '' });
      const prot = field('Prot / 100g', { type: 'text', inputmode: 'decimal', value: p.prot ?? '' });
      const fat = field('Grassi / 100g', { type: 'text', inputmode: 'decimal', value: p.fat ?? '' });
      grid.append(kcal.wrap, carbo.wrap, prot.wrap, fat.wrap);

      // range grammatura opzionale (limita quanto il motore puo scalare questo cibo)
      const rangeGrid = el('div', { class: 'f-grid' });
      const rmin = field('Min g (opz.)', { type: 'number', inputmode: 'numeric', min: '0', value: rg.min ?? '' });
      const rmax = field('Max g (opz.)', { type: 'number', inputmode: 'numeric', min: '0', value: rg.max ?? '' });
      rangeGrid.append(rmin.wrap, rmax.wrap);
      const rangeHint = el('div', { class: 'f-hint', text: 'Limiti di grammatura per il ricalcolo automatico. Lascia vuoto per nessun limite.' });

      // flag accessorio: il ricalcolo riduce prima questi (bevande, integratori...)
      const accChk = el('button', {
        class: 'acc-toggle', type: 'button', 'aria-pressed': String(!!food?.accessorio),
        onClick: () => accChk.setAttribute('aria-pressed', accChk.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'),
      }, [ el('span', { class: 'acc-box', html: icon.check(13) }), 'Accessorio (bevanda, integratore…) — ridotto per primo nel ricalcolo' ]);

      const save = el('button', { class: 'modal-btn modal-btn--primary', text: 'Salva' , onClick: () => {
        const nomeV = nome.input.value.trim();
        if (!nomeV) { nome.input.focus(); return; }
        const out = {
          nome: nomeV,
          per100g: {
            kcal: num(kcal.input.value),
            carbo: num(carbo.input.value),
            prot: num(prot.input.value),
            fat: num(fat.input.value),
          },
        };
        // salva il range se c'e ALMENO uno dei due (min o max). L'altro prende
        // un default sensato: min=0, max=nessun limite (999999).
        const minV = rmin.input.value !== '' ? num(rmin.input.value) : null;
        const maxV = rmax.input.value !== '' ? num(rmax.input.value) : null;
        if (minV != null || maxV != null) {
          out.rangeGrammatura = { min: minV != null ? minV : 0, max: maxV != null ? maxV : 999999 };
        }
        if (accChk.getAttribute('aria-pressed') === 'true') out.accessorio = true;
        onSave(out);
        close();
      }});

      return el('div', {}, [nome.wrap, grid, rangeGrid, rangeHint, accChk, el('div', { class: 'modal-actions' }, [save])]);
    },
  });
}

/**
 * Picker cibo. Modalita SINGOLA: scegli un cibo + grammi -> onConfirm({foodId,grammatura}).
 * Modalita MULTI (tieni premuto su un cibo): selezioni piu cibi -> onConfirmMulti([foodId])
 *   e le grammature le decide il chiamante (ultima usata).
 */
export function openSgarroForm({ foods, onCreateFood, onConfirm, onConfirmMulti, title = 'Aggiungi cibo', preId = null, suggestGram = null }) {
  return openModal({
    title,
    build(close) {
      const list = Object.values(foods);
      let selectedId = preId;
      let multi = false;                 // modalita selezione multipla attiva?
      const chosen = new Set();          // foodId selezionati in multi

      const search = el('input', { class: 'f__input', type: 'text', placeholder: 'Cerca un cibo…', 'aria-label': 'Cerca cibo' });
      const results = el('div', { class: 'food-results' });
      const foot = el('div', { class: 'picker__foot' });

      const gram = field('Grammi', { type: 'text', inputmode: 'decimal', placeholder: 'es. 150' });
      gram.input.addEventListener('focus', (e) => e.target.select());

      function pickSingle(f) {
        selectedId = f.id;
        const g = suggestGram && suggestGram(f.id);
        if (g && !gram.input.value) gram.input.value = String(g);
        renderResults(); renderFoot(); gram.input.focus();
      }
      function enterMulti(f) { multi = true; chosen.add(f.id); renderResults(); renderFoot(); }
      function toggleMulti(f) { if (chosen.has(f.id)) chosen.delete(f.id); else chosen.add(f.id); renderResults(); renderFoot(); }

      function renderResults() {
        const q = search.value.trim().toLowerCase();
        const filtered = list.filter((f) => f.nome.toLowerCase().includes(q)).slice(0, 40);
        results.replaceChildren(...filtered.map((f) => {
          const p = f.per100g;
          const sel = multi ? chosen.has(f.id) : (f.id === selectedId);
          const item = el('button', {
            class: `food-opt ${sel ? 'is-sel' : ''}`,
          }, [
            multi ? el('span', { class: `food-opt__chk ${chosen.has(f.id) ? 'on' : ''}`, html: icon.check(12) }) : null,
            el('span', { class: 'food-opt__name', text: f.nome }),
            el('span', { class: 'food-opt__macros' }, [
              `${p.kcal} `,
              el('span', { class: 'mc mc--c', text: `${p.carbo}C ` }),
              el('span', { class: 'mc mc--p', text: `${p.prot}P ` }),
              el('span', { class: 'mc mc--f', text: `${p.fat}F` }),
            ]),
          ]);
          // click: singolo o toggle (in multi). Hold: entra in multi.
          let held = false, timer = null;
          const start = () => { held = false; timer = setTimeout(() => { held = true; if (onConfirmMulti) enterMulti(f); }, 450); };
          const end = (e) => { clearTimeout(timer); if (held) return; e.preventDefault(); multi ? toggleMulti(f) : pickSingle(f); };
          item.addEventListener('pointerdown', start);
          item.addEventListener('pointerup', end);
          item.addEventListener('pointerleave', () => clearTimeout(timer));
          return item;
        }));
        if (filtered.length === 0) results.append(el('div', { class: 'food-none', text: 'Nessun cibo. Creane uno nuovo qui sotto.' }));
      }

      function renderFoot() {
        const newBtn = el('button', { class: 'modal-btn', text: '+ Nuovo cibo', onClick: () => {
          close();
          openFoodForm({ onSave: (data) => {
            const id = onCreateFood(data);
            openSgarroForm({ foods: { ...foods, [id]: { id, ...data } }, onCreateFood, onConfirm, onConfirmMulti, title, suggestGram, preId: id });
          }});
        }});

        if (multi) {
          const add = el('button', { class: 'modal-btn modal-btn--primary', text: `Aggiungi ${chosen.size} ${chosen.size === 1 ? 'cibo' : 'cibi'}`, onClick: () => {
            if (chosen.size === 0) return;
            onConfirmMulti([...chosen]); close();
          }});
          const hint = el('div', { class: 'f-hint', text: 'Selezione multipla: le grammature saranno le ultime usate. Tocca per aggiungere/togliere.' });
          foot.replaceChildren(hint, el('div', { class: 'modal-actions' }, [newBtn, add]));
        } else {
          const add = el('button', { class: 'modal-btn modal-btn--primary', text: 'Aggiungi', onClick: () => {
            const g = parseFloat(String(gram.input.value).replace(',', '.')) || 0;
            if (!selectedId) { search.focus(); return; }
            if (!g) { gram.input.focus(); return; }
            onConfirm({ foodId: selectedId, grammatura: g }); close();
          }});
          foot.replaceChildren(gram.wrap, el('div', { class: 'modal-actions' }, [newBtn, add]));
        }
      }

      search.addEventListener('input', renderResults);
      renderResults(); renderFoot();

      return el('div', { class: 'picker' }, [search, results, foot]);
    },
  });
}

/** Scelta rapida di un piano (variante) da assegnare a un giorno. */
export function openPlanPicker({ variants, onPick }) {
  return openModal({
    title: 'Scegli un piano',
    build(close) {
      const list = el('div', { class: 'stack' }, variants.map((v) => el('button', {
        class: 'item', onClick: () => { close(); onPick(v.id); },
      }, [
        el('div', { style: 'display:flex;align-items:center;gap:10px' }, [
          el('span', { class: `chip chip--${v.categoria === 'ON' ? 'on' : 'off'}`, text: v.categoria }),
          el('span', { class: 'item__title', text: v.nome }),
        ]),
        el('span', { class: 'item__meta', text: `${v.target.kcal} kcal` }),
      ])));
      return el('div', {}, [list]);
    },
  });
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


/**
 * Modal proposte di ricalcolo: lista di modifiche spuntabili. onApply riceve
 * l'array delle proposte selezionate.
 */
export function openProposals({ proposals, foods, onApply }) {
  return openModal({
    title: 'Proposte di ricalcolo',
    build(close) {
      if (!proposals.length) {
        return el('div', {}, [
          el('div', { class: 'empty', text: 'Il piano è già in linea. Nessuna modifica proposta.' }),
        ]);
      }

      const checks = proposals.map((p) => ({ p, on: true }));

      const list = el('div', { class: 'chg-list' }, checks.map((c) => {
        const nome = foods[c.p.foodId]?.nome || c.p.foodId;
        const isAdd = c.p.tipo === 'aggiunta';
        const su = c.p.aG > c.p.daG;
        const verso = isAdd ? 'aggiungi' : (su ? '↑' : '↓');
        const box = el('button', {
          class: 'prop', 'aria-pressed': 'true',
          onClick: () => { c.on = !c.on; box.setAttribute('aria-pressed', String(c.on)); },
        }, [
          el('span', { class: 'prop__check', html: icon.check(13) }),
          el('span', { class: 'prop__body' }, [
            el('span', { class: 'prop__name' }, [isAdd ? '+ ' : '', nome]),
            el('span', { class: 'prop__delta', text: isAdd ? `aggiungi ${c.p.aG}g` : `${c.p.daG}g → ${c.p.aG}g` }),
          ]),
          el('span', { class: 'prop__why', text: verso }),
        ]);
        return box;
      }));

      const apply = el('button', { class: 'modal-btn modal-btn--primary', text: 'Applica selezionate', onClick: () => {
        onApply(checks.filter((c) => c.on).map((c) => c.p));
        close();
      }});

      return el('div', {}, [list, el('div', { class: 'modal-actions' }, [apply])]);
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

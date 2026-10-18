// modal.js — modal centrale riutilizzabile + form/dialoghi costruiti sopra.

import { el } from './dom.js';
import { MEAL_TYPES } from './format.js';
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
export function openModal({ title, build, cls = '', focus = true }) {
  let backdrop;
  function close() { backdrop?.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }

  // title === null: il contenuto porta la propria intestazione (selettore cibo)
  const head = title === null ? null : el('div', { class: 'modal__head' }, [
    el('h2', { class: 'modal__title', text: title || '' }),
    el('button', { class: 'modal__x', 'aria-label': 'Chiudi', html: icon.close(20), onClick: close }),
  ]);

  const body = build(close);
  const card = el('div', { class: `modal ${cls}`, role: 'dialog', 'aria-modal': 'true' }, [head, body]);
  backdrop = el('div', { class: 'modal-backdrop', onClick: (e) => { if (e.target === backdrop) close(); } }, [card]);

  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
  if (focus) setTimeout(() => card.querySelector('input,button')?.focus(), 30);
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
      const nomeRow = el('div', { class: 'f-grid', style: 'grid-template-columns: 64px 1fr' });
      const emoji = field('Emoji', { type: 'text', value: food?.emoji || '', placeholder: '🍽️', maxlength: '4' });
      const nome = field('Nome', { type: 'text', value: food?.nome || '', placeholder: 'es. Petto di pollo' });
      nomeRow.append(emoji.wrap, nome.wrap);
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
          emoji: emoji.input.value.trim() || guessEmoji(nomeV),
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

      return el('div', {}, [nomeRow, grid, rangeGrid, rangeHint, accChk, el('div', { class: 'modal-actions' }, [save])]);
    },
  });
}

// suggerisce un'emoji dal nome del cibo (fallback generico se non riconosciuto)
const EMOJI_HINTS = [
  [/pollo|tacchino/i, '🍗'], [/manzo|vitello|bistecc/i, '🥩'], [/maiale|prosciutto|salame|bresaola/i, '🥓'],
  [/pesce|tonno|salmone|merluzzo|branzino/i, '🐟'], [/gambero|scampi|cozze|vongole/i, '🦐'],
  [/uovo|uova|albume/i, '🥚'], [/riso/i, '🍚'], [/pasta|penne|spaghetti|fusilli/i, '🍝'],
  [/pane|panino/i, '🍞'], [/patat/i, '🥔'], [/avena/i, '🌾'], [/mela/i, '🍎'], [/banana/i, '🍌'],
  [/arancia|mandarino/i, '🍊'], [/frutta|kiwi|pera|uva/i, '🍇'], [/verdur|insalata|zucchin|spinaci|broccoli/i, '🥦'],
  [/pomodoro/i, '🍅'], [/carota/i, '🥕'], [/formaggio|mozzarella|parmigiano|grana/i, '🧀'],
  [/yogurt/i, '🥣'], [/latte/i, '🥛'], [/olio/i, '🫒'], [/mandorle|noci|nocciole|frutta secca/i, '🥜'],
  [/cioccolat/i, '🍫'], [/gelato/i, '🍨'], [/pizza/i, '🍕'], [/legumi|fagioli|ceci|lenticchie/i, '🫘'],
  [/proteina|whey|integrator/i, '🥤'],
];
export function guessEmoji(nome) {
  for (const [re, e] of EMOJI_HINTS) if (re.test(nome)) return e;
  return '🍽️';
}

/**
 * Selettore per aggiungere a un pasto. Elenco compatto: prima i BLOCCHI di quel
 * tipo di pasto, poi i cibi sfusi. Si sceglie una voce e "Aggiungi":
 *  - cibo   -> lo stesso modal passa alla schermata dei grammi -> onConfirm({foodId, grammatura})
 *  - blocco -> inserito subito (i grammi si ritoccano dalla giornata) -> onConfirmBlock(block)
 * Tocco lungo su un cibo = selezione multipla -> onConfirmMulti([foodId]) (grammi: ultima usata).
 * `blocks`: [{ id, nome, righe, kcal }]. Il modal sta sempre in alto: con la tastiera
 * cambia solo l'altezza, niente salti.
 */
export function openFoodPicker({ foods, blocks = [], mealNome = '', onCreateFood, onConfirm, onConfirmMulti, onConfirmBlock, suggestGram = null, preId = null }) {
  return openModal({
    title: null, cls: 'modal--picker', focus: false,
    build(close) {
      const list = Object.values(foods);
      let sel = preId ? { type: 'food', id: preId } : null;   // selezione singola
      let multi = false;                                        // selezione multipla (solo cibi)
      const chosen = new Set();

      const root = el('div', { class: 'picker' });
      const search = el('input', { class: 'f__input picker__search', type: 'text', placeholder: 'Cerca…', 'aria-label': 'Cerca' });
      const results = el('div', { class: 'food-results' });

      const closeBtn = () => el('button', { class: 'modal__x', 'aria-label': 'Chiudi', html: icon.close(20), onClick: close });

      // ---------- schermata 1: elenco ----------
      function foodOpt(f) {
        const p = f.per100g;
        const on = multi ? chosen.has(f.id) : (sel?.type === 'food' && sel.id === f.id);
        const item = el('button', { class: `food-opt ${on ? 'is-sel' : ''}` }, [
          multi ? el('span', { class: `food-opt__chk ${on ? 'on' : ''}`, html: icon.check(12) }) : el('span', { class: `food-opt__rad ${on ? 'on' : ''}` }),
          el('span', { class: 'food-opt__name', text: f.nome }),
          el('span', { class: 'food-opt__macros' }, [
            `${p.kcal} `,
            el('span', { class: 'mc mc--c', text: `${p.carbo}C ` }),
            el('span', { class: 'mc mc--p', text: `${p.prot}P ` }),
            el('span', { class: 'mc mc--f', text: `${p.fat}F` }),
          ]),
        ]);
        // click: seleziona (o toggle in multi). Tocco lungo: entra in multi.
        let held = false, timer = null;
        const start = () => { held = false; timer = setTimeout(() => { held = true; if (onConfirmMulti) { multi = true; sel = null; chosen.add(f.id); renderList(); } }, 450); };
        const end = (e) => {
          clearTimeout(timer); if (held) return; e.preventDefault();
          if (multi) { chosen.has(f.id) ? chosen.delete(f.id) : chosen.add(f.id); }
          else sel = { type: 'food', id: f.id };
          renderList();
        };
        item.addEventListener('pointerdown', start);
        item.addEventListener('pointerup', end);
        item.addEventListener('pointerleave', () => clearTimeout(timer));
        return item;
      }

      function blockOpt(b) {
        const on = sel?.type === 'block' && sel.id === b.id;
        const sub = b.righe.map((r) => foods[r.foodId]?.nome || r.foodId).join(' · ');
        const item = el('button', { class: `food-opt food-opt--blk ${on ? 'is-sel' : ''}` }, [
          el('span', { class: `food-opt__rad ${on ? 'on' : ''}` }),
          el('span', { class: 'food-opt__main' }, [
            el('span', { class: 'food-opt__name', text: b.nome }),
            el('span', { class: 'food-opt__sub', text: sub }),
          ]),
          el('span', { class: 'food-opt__macros', text: `${Math.round(b.kcal)} kcal` }),
        ]);
        item.addEventListener('click', () => { sel = { type: 'block', id: b.id }; renderList(); });
        return item;
      }

      function renderList() {
        const q = search.value.trim().toLowerCase();
        const fb = multi ? [] : blocks.filter((b) => b.nome.toLowerCase().includes(q));
        const ff = list.filter((f) => f.nome.toLowerCase().includes(q)).slice(0, 60);
        const kids = [];
        if (fb.length) { kids.push(el('div', { class: 'picker__label', text: 'Blocchi' })); kids.push(...fb.map(blockOpt)); }
        if (ff.length) {
          if (fb.length) kids.push(el('div', { class: 'picker__label', text: 'Cibi' }));
          kids.push(...ff.map(foodOpt));
        }
        if (!fb.length && !ff.length) kids.push(el('div', { class: 'food-none', text: 'Niente trovato. Creane uno nuovo qui sotto.' }));
        results.replaceChildren(...kids);
        renderFoot();
      }

      const foot = el('div', { class: 'picker__foot' });
      function renderFoot() {
        const newBtn = el('button', { class: 'modal-btn modal-btn--ghost', text: '+ Nuovo', onClick: () => {
          close();
          openFoodForm({ onSave: (data) => {
            const id = onCreateFood(data);
            openFoodPicker({ foods: { ...foods, [id]: { id, ...data } }, blocks, mealNome, onCreateFood, onConfirm, onConfirmMulti, onConfirmBlock, suggestGram, preId: id });
          }});
        }});
        let label = 'Aggiungi', ready = !!sel, act = null;
        if (multi) {
          label = `Aggiungi ${chosen.size} ${chosen.size === 1 ? 'cibo' : 'cibi'}`; ready = chosen.size > 0;
          act = () => { onConfirmMulti([...chosen]); close(); };
        } else if (sel?.type === 'block') {
          label = 'Aggiungi blocco';
          act = () => { onConfirmBlock(blocks.find((b) => b.id === sel.id)); close(); };
        } else if (sel?.type === 'food') {
          act = () => showGrams(foods[sel.id]);
        }
        const add = el('button', { class: `modal-btn modal-btn--primary ${ready ? '' : 'is-off'}`, text: label, onClick: () => { if (ready && act) act(); else search.focus(); } });
        foot.replaceChildren(newBtn, add);
      }

      function showList() {
        root.replaceChildren(
          el('div', { class: 'picker__head' }, [
            el('div', { class: 'picker__title' }, [mealNome ? el('small', { text: mealNome }) : null, 'Aggiungi']),
            closeBtn(),
          ]),
          search, results, foot,
        );
        renderList();
      }

      // ---------- schermata 2: grammi (solo per un cibo) ----------
      function showGrams(food) {
        const p = food.per100g;
        const last = suggestGram ? suggestGram(food.id) : null;
        const input = el('input', { class: 'bigg', type: 'text', inputmode: 'decimal', placeholder: last ? String(last) : '0', 'aria-label': `Grammi di ${food.nome}` });
        const live = el('div', { class: 'live' });
        const val = () => {
          const n = parseFloat(String(input.value).replace(',', '.'));
          return Number.isFinite(n) && n > 0 ? n : (last || 0);
        };
        const paint = () => {
          const g = val(), k = g / 100;
          live.replaceChildren(`${Math.round(p.kcal * k)} kcal · `,
            el('span', { class: 'mc mc--c', text: `${Math.round(p.carbo * k)}C ` }),
            el('span', { class: 'mc mc--p', text: `${Math.round(p.prot * k)}P ` }),
            el('span', { class: 'mc mc--f', text: `${Math.round(p.fat * k)}F` }));
        };
        const confirm = () => {
          const g = val();
          if (!g) { input.focus(); return; }
          onConfirm({ foodId: food.id, grammatura: g }); close();
        };
        input.addEventListener('input', paint);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirm(); });

        const quick = [50, 100, 150];
        if (last && !quick.includes(last)) quick.push(last);
        const chips = el('div', { class: 'quick' }, quick.map((g) => el('button', {
          class: `quick__c ${g === last ? 'is-last' : ''}`, text: g === last ? `ultimo: ${g}` : String(g),
          onClick: () => { input.value = String(g); paint(); input.focus(); },
        })));

        root.replaceChildren(
          el('div', { class: 'picker__head' }, [
            el('button', { class: 'modal__x', 'aria-label': 'Indietro', html: icon.back(20), onClick: showList }),
            el('div', { class: 'picker__title' }, [
              el('small', { text: `${p.kcal} kcal · ${p.carbo}C ${p.prot}P ${p.fat}F ogni 100g` }), food.nome,
            ]),
            closeBtn(),
          ]),
          el('div', { class: 'bigg-wrap' }, [input, el('span', { class: 'bigg-u', text: 'g' })]),
          chips, live,
          el('div', { class: 'picker__spacer' }),
          el('div', { class: 'picker__foot' }, [el('button', { class: 'modal-btn modal-btn--primary', text: 'Conferma', onClick: confirm })]),
        );
        paint();
        setTimeout(() => input.focus(), 30);
      }

      search.addEventListener('input', renderList);
      showList();
      return root;
    },
  });
}

/** Nuovo blocco: nome + tipo di pasto. onCreate({ nome, mealId }). */
export function openBlockForm({ onCreate }) {
  return openModal({
    title: 'Nuovo blocco',
    build(close) {
      const nome = field('Nome', { type: 'text', placeholder: 'es. Colazione proteica' });
      let mealId = MEAL_TYPES[0].id;
      const chips = el('div', { class: 'quick quick--wrap' }, MEAL_TYPES.map((m) => {
        const b = el('button', { class: `quick__c ${m.id === mealId ? 'is-on' : ''}`, text: m.nome, onClick: () => {
          mealId = m.id; chips.querySelectorAll('.quick__c').forEach((x) => x.classList.toggle('is-on', x === b));
        } });
        return b;
      }));
      const save = el('button', { class: 'modal-btn modal-btn--primary', text: 'Crea', onClick: () => {
        const v = nome.input.value.trim(); if (!v) { nome.input.focus(); return; }
        onCreate({ nome: v, mealId }); close();
      }});
      return el('div', {}, [nome.wrap, el('div', { class: 'f__label', text: 'Per quale pasto' }), chips, el('div', { class: 'modal-actions' }, [save])]);
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
      ])));
      return el('div', {}, [list]);
    },
  });
}

/**
 * Scelta rapida alla creazione di un nuovo piano: da zero o duplicando uno
 * esistente della stessa categoria. Se non ci sono piani da duplicare, salta
 * dritto a onFromScratch senza aprire nulla.
 */
export function openNewPlanChoice({ categoria, existing, onFromScratch, onDuplicate }) {
  if (!existing || existing.length === 0) { onFromScratch(); return; }
  return openModal({
    title: `Nuovo piano ${categoria}`,
    build(close) {
      const scratch = el('button', { class: 'item', onClick: () => { close(); onFromScratch(); } }, [
        el('div', { class: 'item__title', text: 'Parti da zero' }),
      ]);
      const dup = el('button', { class: 'item', onClick: () => {
        close();
        openPlanPicker({ variants: existing, onPick: (id) => onDuplicate(id) });
      }}, [
        el('div', { class: 'item__title', text: 'Duplica un piano esistente' }),
      ]);
      return el('div', { class: 'stack' }, [scratch, dup]);
    },
  });
}

/** Conferma generica prima di un'azione distruttiva (es. elimina). */
export function openConfirm({ title = 'Sei sicuro?', message = '', confirmLabel = 'Elimina', onConfirm }) {
  return openModal({
    title,
    build(close) {
      const body = message ? el('div', { class: 'f-hint', text: message }) : null;
      const cancel = el('button', { class: 'modal-btn', text: 'Annulla', onClick: close });
      const confirm = el('button', { class: 'modal-btn modal-btn--danger', text: confirmLabel, onClick: () => { close(); onConfirm(); } });
      return el('div', {}, [body, el('div', { class: 'modal-actions' }, [cancel, confirm])].filter(Boolean));
    },
  });
}

/** Rinomina: un solo campo testo. onSave(nuovoNome). */
export function openRenameForm({ value, onSave, title = 'Rinomina piano' }) {
  return openModal({
    title,
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



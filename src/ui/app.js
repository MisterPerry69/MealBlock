// app.js — orchestratore: stato, routing tra schermate, azioni.

import { clear, el } from './dom.js';
import { icon } from './icons.js';
import { renderTracker } from './tracker.js';
import { createMockStore } from '../data/store.js';
import { createGasStore } from '../data/gasStore.js';
import { GAS_URL, API_TOKEN } from '../data/config.js';
import { seedFoods, seedTemplates, seedTargets } from '../data/seed.js';
import { buildLog, switchDayType, markSgarroDay, isSgarroDay, todayISO, toISO } from '../core/day.js';
import { computeUsage, suggestGrams, rankFoodsForMeal } from '../core/usage.js';
import { logMacros, eatenMacros, flatFoods, MEAL_TYPES } from './format.js';
import { macrosOfRows } from '../core/solver.js';
import { renderOggi, refreshOggiNumbers } from './screens/oggi.js';
import { renderPiani } from './screens/piani.js';
import { renderBanco, refreshBancoNumbers } from './screens/banco.js';
import { renderRepertorio } from './screens/repertorio.js';
import { renderStorico } from './screens/storico.js';
import { renderSpesa } from './screens/spesa.js';
import { openFoodForm, openFoodPicker, openBlockForm, openRenameForm, openPlanPicker, openNewPlanChoice, openConfirm } from './modal.js';

// Se hai incollato l'URL GAS in config.js usa il backend reale, altrimenti mock.
const store = GAS_URL ? createGasStore(GAS_URL, API_TOKEN) : createMockStore();

const state = {
  tab: 'oggi',
  foods: {},
  blocks: [],      // pasti prefatti: { id, nome, mealId, righe }
  variants: [],    // tutti i piani (ON e OFF): { id, nome, categoria, meals }
  targets: { ON: { kcal: 0, carbo: 0, prot: 0, fat: 0 }, OFF: { kcal: 0, carbo: 0, prot: 0, fat: 0 } },
  today: null,     // { log, foods }
  todayDate: null, // giorno (ISO) per cui today e stato caricato
  history: [],
  banco: null,     // { plan, foods } quando il banco da lavoro e aperto
  editMode: false, // modalita modifica giornata in Oggi
  weekRef: null,   // data ISO di riferimento per la settimana mostrata in Piani
  extras: {},      // { weekKey: [{nome}, ...] } voci extra della spesa, per settimana
};

// ---- helper piani ----
function variantsOf(categoria) { return state.variants.filter((v) => v.categoria === categoria); }
function variantById(id) { return state.variants.find((v) => v.id === id); }

async function loadToday() {
  const iso = todayISO();
  state.todayDate = iso;
  // il log di oggi e gia tra i logs scaricati al boot (getAll): niente chiamata
  // extra. Solo se non c'e lo cerco puntualmente.
  let log = state.history.find((l) => l.data === iso) || null;
  if (!log) log = await store.getLog(iso);
  if (log && log.cleared) log = null; // giorno svuotato da Settimana: torna vuoto
  // Nessuna auto-creazione: se il giorno non ha un piano assegnato, Oggi mostra
  // il selettore rapido ON/OFF (vedi renderOggi) finche l'utente non ne sceglie uno.
  state.today = { log, foods: state.foods };
}

// ---- salvataggio del log sul backend (unica fonte di verita, condivisa tra
//      dispositivi). Salvataggio DIRETTO e IMMEDIATO a ogni azione: niente
//      debounce, niente sendBeacon (che verso GAS falliva silenziosamente
//      dicendo "salvato" senza scrivere). Semplice e affidabile.
// Salvataggio SILENZIOSO in background con RETRY automatico: i GAS falliscono a
// volte per timeout/richieste ravvicinate. Ritenta 2 volte (con piccola pausa)
// prima di mostrare il badge d'errore cliccabile. I salvataggi vanno UNO ALLA
// VOLTA, in ordine: due richieste in parallelo verso GAS possono arrivare
// invertite e cancellare la modifica piu recente.
let saveChain = Promise.resolve();
function saveInBackground(doSave) {
  hideSaveError();
  const run = async (tentativi) => {
    try { await doSave(); } catch (e) {
      if (tentativi > 0) { await new Promise((r) => setTimeout(r, 800)); return run(tentativi - 1); }
      showSaveError(() => doSave());
    }
  };
  saveChain = saveChain.then(() => run(2));
}

function saveLogReliable(log) {
  // aggiorna subito lo storico in memoria (UI coerente)
  const i = state.history.findIndex((l) => l.data === log.data);
  if (i >= 0) state.history[i] = log; else state.history.unshift(log);
  saveInBackground(() => store.saveLog(log));
}

// badge d'errore salvataggio: appare solo se un salvataggio fallisce; cliccandolo
// ritenta.
function showSaveError(retry) {
  let box = document.getElementById('savestatus');
  if (!box) {
    box = document.createElement('div');
    box.id = 'savestatus';
    document.body.appendChild(box);
  }
  box.className = 'savestatus is-err';
  box.textContent = '⚠ Non salvato — tocca per riprovare';
  box.onclick = () => { box.textContent = '⌛ salvo…'; retry().then(hideSaveError).catch(() => showSaveError(retry)); };
}
// conferma breve (riusa il badge dei salvataggi)
function showSaved(msg) {
  let box = document.getElementById('savestatus');
  if (!box) { box = document.createElement('div'); box.id = 'savestatus'; document.body.appendChild(box); }
  box.className = 'savestatus is-ok';
  box.textContent = msg;
  box.onclick = null;
  setTimeout(() => { if (box.className === 'savestatus is-ok') box.className = 'savestatus is-hidden'; }, 1800);
}
function hideSaveError() {
  const box = document.getElementById('savestatus');
  if (box) box.className = 'savestatus is-hidden';
}

// statistiche d'uso calcolate dallo storico (per suggerimenti cibo/grammatura)
function currentUsage() { return computeUsage(state.history || []); }

// apre il picker cibo con suggerimenti: cibi del pasto in cima + grammatura
// precompilata. onAdd riceve una LISTA di { foodId, grammatura } (1 elemento in
// modalita singola, N in modalita selezione multipla).
function openSmartPicker({ mealId, onAdd, withBlocks = true }) {
  const usage = currentUsage();
  const ordered = rankFoodsForMeal(Object.values(state.foods), usage, mealId);
  const foodsOrdered = {};
  for (const f of ordered) foodsOrdered[f.id] = f;
  // grammatura per un cibo aggiunto in multi: ultima usata, o 100 di default
  const gramFor = (foodId) => suggestGrams(usage, foodId, mealId) || 100;
  // blocchi del tipo di pasto, con le kcal calcolate; poi i cibi sfusi
  const flat = flatFoods(state.foods);
  const blocks = withBlocks
    ? state.blocks.filter((b) => b.mealId === mealId && b.righe.length)
        .map((b) => ({ ...b, kcal: macrosOfRows(b.righe, flat).kcal }))
    : [];
  openFoodPicker({
    foods: foodsOrdered,
    blocks,
    mealNome: MEAL_TYPES.find((m) => m.id === mealId)?.nome || '',
    onConfirmBlock: (block) => onAdd(block.righe.map((r) => ({ foodId: r.foodId, grammatura: r.grammatura }))),
    suggestGram: (foodId) => suggestGrams(usage, foodId, mealId),
    onCreateFood: (data) => ctx.createFood(data),
    onConfirm: ({ foodId, grammatura }) => onAdd([{ foodId, grammatura }]),
    onConfirmMulti: (foodIds) => onAdd(foodIds.map((foodId) => ({ foodId, grammatura: gramFor(foodId) }))),
  });
}

// Persiste il log corrente: render SUBITO, salvataggio in background (niente
// attesa dei secondi del GAS). Le grammature le decide sempre l'utente a mano.
// Il cambio giorno/piano non deve toccare le grammature.
function persistToday() {
  render();
  saveLogReliable(state.today.log);
}

// target vuoto di sicurezza: usato quando un log molto vecchio non ha ancora
// un `target` proprio (salvato prima di questa modifica).
function emptyTarget() { return { kcal: 0, carbo: 0, prot: 0, fat: 0 }; }

// aggiorna SOLO il tracker di Oggi (senza ricostruire la lista/gli input): usato
// mentre si digita una grammatura in modifica, per non chiudere la tastiera.
function refreshTrackerToday() {
  const { log, foods } = state.today;
  if (isSgarroDay(log)) return;
  const shown = state.editMode ? logMacros(log, foods) : eatenMacros(log, foods);
  renderTracker(shown, log.target || emptyTarget());
}

// aggiorna solo il tracker del banco (totale del piano vs target) senza render
function refreshTrackerBanco() {
  const { plan, target } = state.banco;
  if (!target) return; // editor di un blocco: niente target
  renderTracker(logMacros({ meals: plan.meals }, state.foods), target);
}

// ---- azioni passate alle schermate via ctx ----
const ctx = {
  get foods() { return state.foods; },
  get today() { return state.today; },
  get history() { return state.history; },
  rerender: () => render(),
  // varianti
  variantsOf: (cat) => variantsOf(cat),
  get targets() { return state.targets; },

  // cambia SOLO tipo/target del giorno (i cibi restano quelli che erano).
  // Il target viene da state.targets[categoria] (unico per categoria, non dal
  // piano collegato): il giorno resta "in stasi", non agganciato a nessun
  // piano nuovo, finche non lo salvi esplicitamente (icona floppy nel banco).
  // enterEdit: dopo il cambio entra subito in modalita modifica, dato che i
  // macro sono cambiati e quasi certamente ci sara qualcosa da aggiustare.
  toggleDayType(enterEdit = false) {
    const log = state.today.log;
    const base = isSgarroDay(log) ? (log.tipoBase || 'ON') : log.tipo;
    const nuovoTipo = base === 'ON' ? 'OFF' : 'ON';
    let next = isSgarroDay(log) ? markSgarroDay(log, false) : log;
    next = switchDayType(next, nuovoTipo, state.targets[nuovoTipo]);
    state.today.log = next;
    if (enterEdit) state.editMode = true;
    persistToday();
  },

  // hold su ON/OFF: attiva/disattiva la giornata SGARRO (terzo stato, no target).
  async toggleSgarroDay() {
    const log = state.today.log;
    state.today.log = markSgarroDay(log, !isSgarroDay(log));
    persistToday();
  },

  toggleEaten(mealId, row) {
    // Spuntare "mangiato" fa avanzare le barre: aggiorna la UI SUBITO e salva in
    // background (niente attesa dei 2-4s del backend).
    row.eaten = !row.eaten;
    render();
    saveLogReliable(state.today.log);
  },

  // crea un cibo nel repertorio, ritorna il suo id. Il salvataggio va in coda
  // con retry e badge d'errore: un cibo non salvato farebbe puntare i log a un
  // cibo che al prossimo avvio non esiste.
  createFood(data) {
    const id = data.nome.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now();
    const food = { id, ...data }; // include per100g, rangeGrammatura, accessorio
    state.foods[id] = food;
    saveInBackground(() => store.saveFood(food));
    return id;
  },

  addSgarro() {
    const meal = state.today.log.meals[state.today.log.meals.length - 1];
    openSmartPicker({
      mealId: meal.id,
      onAdd: (items) => {
        for (const { foodId, grammatura } of items)
          meal.righe.push({ foodId, grammatura, isSgarro: true, eaten: true });
        persistToday();
      },
    });
  },

  addFood() {
    openFoodForm({ onSave: (data) => { ctx.createFood(data); render(); } });
  },


  editFood(id) {
    const food = state.foods[id];
    openFoodForm({ food, onSave: (data) => {
      state.foods[id] = { id, ...data };
      saveInBackground(() => store.saveFood(state.foods[id]));
      render();
    }});
  },

  // ---- gestione varianti (piani dentro ON/OFF) ----
  createVariant(categoria) {
    openNewPlanChoice({
      categoria,
      existing: variantsOf(categoria),
      onFromScratch: () => ctx.createVariantFromScratch(categoria),
      onDuplicate: (sourceId) => ctx.duplicateVariant(sourceId, categoria),
    });
  },

  async createVariantFromScratch(categoria) {
    const id = categoria.toLowerCase() + '-' + Date.now();
    const nuovo = {
      id, nome: 'Nuovo piano', categoria,
      meals: [
        { id: 'colazione', nome: 'Colazione', righe: [] },
        { id: 'pranzo', nome: 'Pranzo', righe: [] },
        { id: 'spuntino', nome: 'Spuntino', righe: [] },
        { id: 'cena', nome: 'Cena', righe: [] },
      ],
    };
    await store.saveVariant(nuovo);
    state.variants = await store.getVariants();
    render();
    ctx.openBanco(id);
  },

  async duplicateVariant(sourceId, categoria) {
    const src = variantById(sourceId);
    if (!src) return;
    const id = categoria.toLowerCase() + '-' + Date.now();
    const nuovo = { ...JSON.parse(JSON.stringify(src)), id, nome: `${src.nome} (copia)` };
    await store.saveVariant(nuovo);
    state.variants = await store.getVariants();
    render();
    ctx.openBanco(id);
  },

  renameVariant(variantId) {
    const v = variantById(variantId);
    openRenameForm({ value: v.nome, onSave: async (nome) => {
      await store.saveVariant({ ...v, nome });
      state.variants = await store.getVariants();
      render();
    }});
  },

  deleteVariant(variantId) {
    // aggiorna subito la UI (niente attesa dei secondi del GAS), poi cancella
    // in background: stesso pattern di saveLogReliable per i log.
    state.variants = state.variants.filter((v) => v.id !== variantId);
    render();
    saveInBackground(() => store.deleteVariant(variantId));
  },

  // modifica diretta di kcal/macro target di una CATEGORIA (tab Target).
  // Unico per ON, unico per OFF: aggiorna il numero visto da ogni piano di
  // quella categoria, senza doverli toccare uno a uno.
  async setCategoryTarget(categoria, target) {
    state.targets = { ...state.targets, [categoria]: target };
    render();
    saveInBackground(() => store.saveTargets(state.targets));
  },

  // ---- modifica giornata (matita in Oggi) ----
  get editMode() { return state.editMode; },
  toggleEditMode() { state.editMode = !state.editMode; render(); },

  // sostituisci il cibo di una riga scegliendone un altro dal repertorio
  replaceFood(mealId, rowIndex) {
    openSmartPicker({
      mealId,
      withBlocks: false, // sostituire una riga = un solo cibo
      onAdd: (items) => {
        const { foodId, grammatura } = items[0]; // sostituzione = un solo cibo
        const row = state.today.log.meals.find((m) => m.id === mealId).righe[rowIndex];
        row.foodId = foodId; row.grammatura = grammatura;
        persistToday();
      },
    });
  },

  setRowGram(mealId, rowIndex, grammi) {
    const row = state.today.log.meals.find((m) => m.id === mealId).righe[rowIndex];
    row.grammatura = Math.max(0, grammi || 0);
    // NON fare render() completo (chiuderebbe la tastiera). Aggiorno SOLO il
    // tracker cosi i macro si muovono in tempo reale mentre digiti.
    refreshTrackerToday();
    refreshOggiNumbers(state.today.log, state.foods);
    saveLogReliable(state.today.log);
  },

  removeRow(mealId, rowIndex) {
    state.today.log.meals.find((m) => m.id === mealId).righe.splice(rowIndex, 1);
    render();
    saveLogReliable(state.today.log);
  },

  addRowToMeal(mealId) {
    openSmartPicker({
      mealId,
      onAdd: (items) => {
        const meal = state.today.log.meals.find((m) => m.id === mealId);
        for (const { foodId, grammatura } of items)
          meal.righe.push({ foodId, grammatura, isSgarro: false, eaten: false });
        persistToday();
      },
    });
  },

  // ---- vista settimana (tab Piani) ----
  get weekRef() { return state.weekRef || todayISO(); },
  shiftWeek(deltaDays) {
    const base = state.weekRef || todayISO();
    const [y, m, d] = base.split('-').map(Number);
    state.weekRef = toISO(new Date(y, m - 1, d + deltaDays));
    render({ resetScroll: true });
  },
  // log gia salvato per una data (dallo storico in memoria)
  logForDate(dateISO) { return state.history.find((l) => l.data === dateISO) || null; },

  // ---- voci extra della lista spesa (non legate a nessun piano), per settimana ----
  // sincrono: legge dalla cache locale. Se la settimana non e ancora in cache,
  // ritorna [] e avvia il caricamento in background (si aggiorna da solo al render).
  extrasOf(weekKey) {
    if (weekKey in state.extras) return state.extras[weekKey];
    state.extras[weekKey] = [];
    store.getExtras(weekKey).then((items) => { state.extras[weekKey] = items || []; render(); }).catch(() => {});
    return state.extras[weekKey];
  },
  addExtra(weekKey, nome) {
    const items = [...ctx.extrasOf(weekKey), { nome }];
    state.extras[weekKey] = items;
    render();
    saveInBackground(() => store.saveExtras(weekKey, items));
  },
  removeExtra(weekKey, index) {
    const items = ctx.extrasOf(weekKey).filter((_, i) => i !== index);
    state.extras[weekKey] = items;
    render();
    saveInBackground(() => store.saveExtras(weekKey, items));
  },

  // assegna un piano a un giorno: crea (o sostituisce) il log di quella data.
  // Il target del log viene da state.targets[categoria] (il piano non ne ha
  // uno proprio).
  assignPlanToDay(dateISO, variantId) {
    const tpl = variantById(variantId);
    if (!tpl) return;
    const log = buildLog(dateISO, tpl, state.targets[tpl.categoria]);
    log.variantId = tpl.id;
    saveLogReliable(log); // aggiorna history + backend
    if (dateISO === todayISO()) state.today = { log, foods: state.foods };
    render();
  },

  // selettore rapido per un Oggi senza piano assegnato: apre la lista dei
  // piani della categoria scelta e assegna quello selezionato a oggi.
  quickAssignToday(categoria) {
    const disponibili = variantsOf(categoria);
    if (disponibili.length === 0) {
      ctx.createVariant(categoria); // nessun piano in questa categoria: creane uno al volo
      return;
    }
    openPlanPicker({
      variants: disponibili,
      onPick: (variantId) => ctx.assignPlanToDay(todayISO(), variantId),
    });
  },

  // rimuove il log assegnato a un giorno futuro (svuota lo slot)
  clearDay(dateISO) {
    state.history = state.history.filter((l) => l.data !== dateISO);
    if (state.today?.log?.data === dateISO) state.today = { log: null, foods: state.foods };
    saveInBackground(() => store.saveLog({ data: dateISO, cleared: true, meals: [] }));
    render();
  },

  // ---- banco da lavoro ----
  get banco() { return state.banco; },

  // openBanco: apre un PIANO esistente per id. Il target mostrato/usato per
  // Ricalcola nel banco viene da state.targets[categoria] (il piano non ne
  // ha uno proprio).
  openBanco(id) {
    const tpl = variantById(id);
    if (!tpl) return;
    state.banco = {
      plan: JSON.parse(JSON.stringify(tpl)),
      target: state.targets[tpl.categoria],
      foods: state.foods,
    };
    render({ resetScroll: true });
  },

  // apre un giorno (log) nel banco per modificarlo indipendentemente dal piano.
  // Il target e quello PROPRIO del log (log.target), non del piano collegato:
  // e cosi che un giorno "in stasi" (switchDayType) mantiene il suo target.
  openDayBanco(dateISO) {
    const log = state.history.find((l) => l.data === dateISO);
    if (!log) return;
    // il nome mostrato e quello del piano collegato (non la data): se il
    // giorno non ha un piano, il nome e "Giorno ON/OFF"
    const tipo = log.tipo || variantById(log.variantId)?.categoria || 'ON';
    state.banco = {
      dayISO: dateISO,
      plan: { id: log.variantId, nome: variantById(log.variantId)?.nome || `Giorno ${tipo}`, tipo,
        meals: JSON.parse(JSON.stringify(log.meals)) },
      target: log.target || state.targets[tipo] || emptyTarget(),
      foods: state.foods,
    };
    render({ resetScroll: true });
  },

  // salvataggio AUTOMATICO del piano in background (come Oggi salva il log).
  // Aggiorna anche la variante in memoria e, se e la variante di oggi, la giornata.
  saveBanco() {
    const b = state.banco;
    if (b.blockId) {
      const m = b.plan.meals[0];
      const block = { id: b.blockId, nome: b.plan.nome, mealId: m.id, righe: m.righe.map((r) => ({ foodId: r.foodId, grammatura: r.grammatura })) };
      const i = state.blocks.findIndex((x) => x.id === block.id);
      if (i >= 0) state.blocks[i] = block;
      saveInBackground(() => store.saveBlock(block));
      return;
    }
    if (b.dayISO) {
      // il banco sta modificando un GIORNO (log), non una variante: salva il
      // log CON il suo target (mai perderlo: e cosi che uno switch ON/OFF
      // resta visibile anche dopo aver modificato qualcosa nel banco).
      // parte dal log esistente: cosi non perde campi come tipoBase/mealsBase (sgarro)
      const orig = state.history.find((l) => l.data === b.dayISO) || {};
      const log = { ...orig, data: b.dayISO, tipo: b.plan.tipo, target: { ...b.target }, variantId: b.plan.id, meals: JSON.parse(JSON.stringify(b.plan.meals)) };
      saveLogReliable(log);
      if (state.today?.log?.data === b.dayISO) state.today.log = log;
      return;
    }
    const plan = b.plan;
    const i = state.variants.findIndex((v) => v.id === plan.id);
    if (i >= 0) state.variants[i] = JSON.parse(JSON.stringify(plan));
    saveInBackground(() => store.saveVariant(plan));
  },

  // ---- blocchi (pasti prefatti) ----
  get blocks() { return state.blocks; },

  createBlock() {
    openBlockForm({ onCreate: ({ nome, mealId }) => {
      const block = { id: 'blk-' + Date.now(), nome, mealId, righe: [] };
      state.blocks.push(block);
      saveInBackground(() => store.saveBlock(block));
      ctx.openBlockBanco(block.id);
    }});
  },

  // l'editor di un blocco riusa il banco: un solo "pasto" del tipo del blocco
  openBlockBanco(id) {
    const b = state.blocks.find((x) => x.id === id);
    if (!b) return;
    state.banco = {
      blockId: id,
      plan: { id, nome: b.nome, meals: [{ id: b.mealId, nome: MEAL_TYPES.find((m) => m.id === b.mealId)?.nome || b.mealId, righe: JSON.parse(JSON.stringify(b.righe)) }] },
      target: null,
      foods: state.foods,
    };
    render({ resetScroll: true });
  },

  // tocco sul chip: passa al tipo di pasto successivo
  bancoCycleBlockMeal() {
    const m = state.banco.plan.meals[0];
    const next = MEAL_TYPES[(MEAL_TYPES.findIndex((t) => t.id === m.id) + 1) % MEAL_TYPES.length];
    m.id = next.id; m.nome = next.nome;
    ctx.saveBanco();
    render();
  },

  bancoDeleteBlock() {
    const b = state.banco;
    openConfirm({
      title: 'Eliminare il blocco?', message: `"${b.plan.nome}" verrà eliminato definitivamente.`,
      onConfirm: () => {
        state.blocks = state.blocks.filter((x) => x.id !== b.blockId);
        saveInBackground(() => store.deleteBlock(b.blockId));
        ctx.bancoClose();
      },
    });
  },

  bancoClose() { state.banco = null; render({ resetScroll: true }); },

  bancoSetGram(mealId, index, grammi) {
    const meal = state.banco.plan.meals.find((m) => m.id === mealId);
    meal.righe[index].grammatura = Math.max(0, grammi || 0);
    // niente render() (chiuderebbe la tastiera): aggiorno tracker e numeri sul posto
    refreshTrackerBanco();
    refreshBancoNumbers(state.banco.plan, state.foods);
    ctx.saveBanco();
  },

  bancoRename() {
    openRenameForm({ value: state.banco.plan.nome, onSave: (nome) => {
      state.banco.plan.nome = nome;
      ctx.saveBanco();
      render();
    }});
  },

  bancoRemove(mealId, index) {
    state.banco.plan.meals.find((m) => m.id === mealId).righe.splice(index, 1);
    ctx.saveBanco(); render();
  },

  bancoAddFood(mealId) {
    openSmartPicker({
      mealId,
      withBlocks: !state.banco.blockId, // un blocco non contiene altri blocchi
      onAdd: (items) => {
        const meal = state.banco.plan.meals.find((m) => m.id === mealId);
        for (const { foodId, grammatura } of items) meal.righe.push({ foodId, grammatura });
        ctx.saveBanco(); render();
      },
    });
  },

  // Cambia tipo (ON<->OFF) e target del giorno aperto nel banco; i cibi restano.
  bancoToggleType() {
    const b = state.banco;
    if (!b?.dayISO || b.plan.tipo === 'SGARRO') return;
    b.plan.tipo = b.plan.tipo === 'ON' ? 'OFF' : 'ON';
    b.target = { ...state.targets[b.plan.tipo] };
    ctx.saveBanco();
    render();
  },

  // Floppy del banco di un GIORNO: salva le modifiche nel piano collegato. Se il
  // nome e stato cambiato (matita) o il tipo non coincide piu con quello del
  // piano, crea invece un piano nuovo partendo da questa giornata.
  bancoSave() {
    const b = state.banco;
    if (!b?.dayISO || b.plan.tipo === 'SGARRO') return;
    const meals = b.plan.meals.map((m) => ({
      id: m.id, nome: m.nome,
      righe: m.righe.map((r) => ({ foodId: r.foodId, grammatura: r.grammatura })),
    }));
    const esistente = variantById(b.plan.id);
    let piano, msg;
    if (esistente && esistente.nome === b.plan.nome && esistente.categoria === b.plan.tipo) {
      piano = { ...esistente, meals };
      const i = state.variants.findIndex((v) => v.id === piano.id);
      state.variants[i] = piano;
      msg = `Piano "${piano.nome}" aggiornato`;
    } else {
      piano = { id: b.plan.tipo.toLowerCase() + '-' + Date.now(), nome: b.plan.nome, categoria: b.plan.tipo, meals };
      state.variants.push(piano);
      b.plan.id = piano.id; // il giorno resta collegato al piano appena creato
      msg = `Nuovo piano "${piano.nome}" creato`;
    }
    saveInBackground(() => store.saveVariant(piano));
    ctx.saveBanco();
    showSaved(msg);
  },
};

const screens = { oggi: renderOggi, piani: renderPiani, repertorio: renderRepertorio, storico: renderStorico, spesa: renderSpesa };

// render({resetScroll}): al cambio tab si torna in cima; per gli aggiornamenti
// in-place (spunta, lucchetto) si preserva la posizione di scroll cosi la
// pagina non "rimbalza".
function render({ resetScroll = false } = {}) {
  const view = document.getElementById('view');
  const y = window.scrollY;
  clear(view);
  // Il banco da lavoro e una sotto-vista che sostituisce Piani quando aperto.
  // Le schermate che mostrano il tracker lo popolano da se (renderTracker);
  // le altre lo svuotano tramite clearTracker() al loro interno.
  if (state.banco) renderBanco(view, ctx);
  else screens[state.tab](view, ctx);
  document.querySelectorAll('#tabbar button').forEach((t) => {
    t.setAttribute('aria-current', String(t.dataset.tab === state.tab && !state.banco));
  });
  window.scrollTo(0, resetScroll ? 0 : y);
}

const TABS = [
  { id: 'oggi', label: 'Oggi', ic: 'tabOggi' },
  { id: 'piani', label: 'Settimana', ic: 'tabPiani' },
  { id: 'spesa', label: 'Spesa', ic: 'tabSpesa' },
  { id: 'repertorio', label: 'Cibi', ic: 'tabCibi' },
  { id: 'storico', label: 'Storico', ic: 'tabStorico' },
];

function wireTabs() {
  const bar = document.getElementById('tabbar');
  clear(bar);
  for (const t of TABS) {
    bar.append(el('button', {
      'data-tab': t.id,
      'aria-label': t.label,
      html: icon[t.ic](20) + `<span>${t.label}</span>`,
      onClick: () => { state.banco = null; state.tab = t.id; render({ resetScroll: true }); },
    }));
  }
}

// Al primo avvio con un backend vuoto, semina i dati di esempio.
// Con lo store mock i seed (foods, varianti, target) sono gia dentro.
async function seedIfEmpty() {
  const variants = await store.getVariants();
  if (variants && variants.length) return;
  for (const id of Object.keys(seedFoods)) await store.saveFood(seedFoods[id]);
  await store.saveVariant({ id: 'on-standard', nome: 'Giorno ON', categoria: 'ON', ...seedTemplates.ON });
  await store.saveVariant({ id: 'off-standard', nome: 'Giorno OFF', categoria: 'OFF', ...seedTemplates.OFF });
  await store.saveTargets(seedTargets);
}

function hideLoader() {
  const l = document.getElementById('loader');
  if (l) { l.classList.add('is-hidden'); setTimeout(() => l.remove(), 300); }
}
function showLoaderError(msg, onRetry) {
  const l = document.getElementById('loader');
  if (!l) return;
  l.querySelector('.loader__spin')?.remove();
  l.querySelector('.loader__txt').textContent = msg;
  let btn = l.querySelector('.loader__retry');
  if (!btn) {
    btn = document.createElement('button');
    btn.className = 'loader__retry';
    btn.textContent = 'Riprova';
    l.appendChild(btn);
  }
  btn.onclick = onRetry;
}

async function boot() {
  try {
    await seedIfEmpty();
    state.foods = await store.getFoods();
    state.variants = await store.getVariants();
    state.targets = await store.getTargets();
    state.blocks = (await store.getBlocks()) || [];
    state.history = (await store.getLogs()) || [];
    for (const l of state.history) if (!l.tipo && !l.cleared) l.tipo = variantById(l.variantId)?.categoria || 'ON';
    await loadToday();
    wireTabs();
    render();
    hideLoader();
  } catch (e) {
    console.error(e);
    showLoaderError('Impossibile caricare i dati. Controlla la connessione e riprova.', boot);
    return;
  }

  // app lasciata aperta oltre la mezzanotte: al ritorno in primo piano, se il
  // giorno e cambiato, ricarica "Oggi" (altrimenti le spunte finiscono su ieri)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || state.todayDate === todayISO()) return;
    await loadToday();
    state.editMode = false;
    render({ resetScroll: true });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();

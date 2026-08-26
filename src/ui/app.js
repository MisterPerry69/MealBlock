// app.js — orchestratore: stato, routing tra schermate, azioni.

import { clear, el } from './dom.js';
import { icon } from './icons.js';
import { renderTracker } from './tracker.js';
import { createMockStore } from '../data/store.js';
import { createGasStore } from '../data/gasStore.js';
import { GAS_URL } from '../data/config.js';
import { seedFoods, seedTemplates, seedSchedule } from '../data/seed.js';
import { buildLog, switchDayType, markSgarroDay, isSgarroDay } from '../core/day.js';
import { optimizePlan } from '../core/optimize.js';
import { computeUsage, suggestGrams, rankFoodsForMeal } from '../core/usage.js';
import { flatFoods, logMacros, eatenMacros } from './format.js';
import { renderOggi } from './screens/oggi.js';
import { renderPiani } from './screens/piani.js';
import { renderBanco } from './screens/banco.js';
import { renderRepertorio } from './screens/repertorio.js';
import { renderStorico } from './screens/storico.js';
import { renderSpesa } from './screens/spesa.js';
import { openFoodForm, openSgarroForm, openRenameForm, openProposals, openPlanPicker, openNewPlanChoice } from './modal.js';

// converte l'output dell'ottimizzatore in proposte per il modal (modifiche + aggiunte)
function buildProposals(plan, foods, usage) {
  const flat = flatFoods(foods);
  const { changes, additions } = optimizePlan(plan, flat, { usage });
  const proposals = [];
  for (const c of changes) proposals.push({ id: c.mealId + ':' + c.foodId, tipo: 'modifica', mealId: c.mealId, foodId: c.foodId, daG: c.daG, aG: c.aG });
  for (const a of additions) proposals.push({ id: 'add:' + a.mealId + ':' + a.foodId, tipo: 'aggiunta', mealId: a.mealId, foodId: a.foodId, daG: 0, aG: a.grammatura });
  return proposals;
}

// Se hai incollato l'URL GAS in config.js usa il backend reale, altrimenti mock.
const store = GAS_URL ? createGasStore(GAS_URL) : createMockStore();

const state = {
  tab: 'oggi',
  foods: {},
  variants: [],    // tutte le varianti (ON e OFF), ognuna e un template completo
  schedule: null,
  today: null,     // { log, foods, template }
  history: [],
  banco: null,     // { plan, foods } quando il banco da lavoro e aperto
  editMode: false, // modalita modifica giornata in Oggi
  weekRef: null,   // data ISO di riferimento per la settimana mostrata in Piani
};

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---- helper piani ----
function variantsOf(categoria) { return state.variants.filter((v) => v.categoria === categoria); }
function variantById(id) { return state.variants.find((v) => v.id === id); }
// il piano applicato a un log (via log.variantId). Nessun fallback implicito:
// se il piano non esiste piu (o non e mai stato assegnato), torna null.
function variantForLog(log) {
  return log.variantId ? (variantById(log.variantId) || null) : null;
}

async function loadToday() {
  const iso = todayISO();
  // il log di oggi e gia tra i logs scaricati al boot (getAll): niente chiamata
  // extra. Solo se non c'e lo cerco puntualmente.
  let log = state.history.find((l) => l.data === iso) || null;
  if (!log) log = await store.getLog(iso);
  if (log && log.cleared) log = null; // giorno svuotato da Settimana: torna vuoto
  // Nessuna auto-creazione: se il giorno non ha un piano assegnato, Oggi mostra
  // il selettore rapido ON/OFF (vedi renderOggi) finche l'utente non ne sceglie uno.
  state.today = { log, foods: state.foods, template: log ? variantForLog(log) : null };
}

// ---- salvataggio del log sul backend (unica fonte di verita, condivisa tra
//      dispositivi). Salvataggio DIRETTO e IMMEDIATO a ogni azione: niente
//      debounce, niente sendBeacon (che verso GAS falliva silenziosamente
//      dicendo "salvato" senza scrivere). Semplice e affidabile.
// Salvataggio SILENZIOSO in background con RETRY automatico: i GAS falliscono a
// volte per timeout/richieste ravvicinate. Ritenta 2 volte (con piccola pausa)
// prima di mostrare il badge d'errore cliccabile.
function saveInBackground(doSave, tentativi = 2) {
  hideSaveError();
  doSave().catch((e) => {
    if (tentativi > 0) setTimeout(() => saveInBackground(doSave, tentativi - 1), 800);
    else showSaveError(() => doSave());
  });
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
function hideSaveError() {
  const box = document.getElementById('savestatus');
  if (box) box.className = 'savestatus is-hidden';
}

function queueSaveLog(log) { saveLogReliable(log); }
function installSaveGuards() { /* niente flush/beacon: salviamo gia a ogni azione */ }

// statistiche d'uso calcolate dallo storico (per suggerimenti cibo/grammatura)
function currentUsage() { return computeUsage(state.history || []); }

// apre il picker cibo con suggerimenti: cibi del pasto in cima + grammatura
// precompilata. onAdd riceve una LISTA di { foodId, grammatura } (1 elemento in
// modalita singola, N in modalita selezione multipla).
function openSmartPicker({ mealId, onAdd }) {
  const usage = currentUsage();
  const ordered = rankFoodsForMeal(Object.values(state.foods), usage, mealId);
  const foodsOrdered = {};
  for (const f of ordered) foodsOrdered[f.id] = f;
  // grammatura per un cibo aggiunto in multi: ultima usata, o 100 di default
  const gramFor = (foodId) => suggestGrams(usage, foodId, mealId) || 100;
  openSgarroForm({
    foods: foodsOrdered,
    suggestGram: (foodId) => suggestGrams(usage, foodId, mealId),
    onCreateFood: (data) => {
      const id = data.nome.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now();
      state.foods[id] = { id, ...data }; store.saveFood(state.foods[id]); return id;
    },
    onConfirm: ({ foodId, grammatura }) => onAdd([{ foodId, grammatura }]),
    onConfirmMulti: (foodIds) => onAdd(foodIds.map((foodId) => ({ foodId, grammatura: gramFor(foodId) }))),
  });
}

// applica le proposte selezionate a un piano/log: modifiche (cambia grammatura)
// e aggiunte (inserisce una nuova riga nel pasto indicato).
function applyProposals(planOrLog, selected) {
  for (const p of selected) {
    const meal = planOrLog.meals.find((m) => m.id === p.mealId);
    if (!meal) continue;
    if (p.tipo === 'aggiunta') {
      meal.righe.push({ foodId: p.foodId, grammatura: p.aG, stato: 'aperta', isSgarro: false, eaten: false });
    } else {
      const row = meal.righe.find((r) => r.foodId === p.foodId);
      if (row) row.grammatura = p.aG;
    }
  }
}

// Persiste il log corrente: render SUBITO, salvataggio in background (niente
// attesa dei secondi del GAS). NON ricalcola: le grammature le decide l'utente o
// il tasto Ricalcola (che apre le proposte). Il cambio giorno/variante non deve
// toccare le grammature.
function persistToday() {
  render();
  queueSaveLog(state.today.log);
}

// target vuoto di sicurezza: usato quando un log punta a un piano che non
// esiste piu (es. eliminato mentre era assegnato a un giorno).
function emptyTarget() { return { kcal: 0, carbo: 0, prot: 0, fat: 0 }; }

// aggiorna SOLO il tracker di Oggi (senza ricostruire la lista/gli input): usato
// mentre si digita una grammatura in modifica, per non chiudere la tastiera.
function refreshTrackerToday() {
  const { log, foods, template } = state.today;
  if (isSgarroDay(log)) return;
  const shown = state.editMode ? logMacros(log, foods) : eatenMacros(log, foods);
  renderTracker(shown, template ? template.target : emptyTarget());
}

// aggiorna solo il tracker del banco (totale del piano vs target) senza render
function refreshTrackerBanco() {
  const { plan } = state.banco;
  renderTracker(logMacros({ meals: plan.meals }, state.foods), plan.target);
}

// ---- azioni passate alle schermate via ctx ----
const ctx = {
  get foods() { return state.foods; },
  get today() { return state.today; },
  get history() { return state.history; },
  rerender: () => render(),
  // varianti
  variantsOf: (cat) => variantsOf(cat),
  variantForLog: (log) => variantForLog(log),

  async toggleDayType() {
    // ciclo ON <-> OFF. Se la giornata era SGARRO, torna prima al tipo base.
    // Cambia SOLO il tipo/target: i cibi del giorno restano quelli che erano.
    const log = state.today.log;
    const base = isSgarroDay(log) ? (log.tipoBase || 'ON') : log.tipo;
    const nuovoTipo = base === 'ON' ? 'OFF' : 'ON';
    let next = isSgarroDay(log) ? markSgarroDay(log, false) : log;
    next = switchDayType(next, nuovoTipo);
    state.today.log = next;
    state.today.template = variantForLog(next);
    persistToday();
  },

  // applica un piano specifico alla giornata di oggi: SOSTITUISCE i pasti con
  // quelli del piano scelto (a differenza di toggleDayType, che li preserva).
  async applyVariant(variantId) {
    const tpl = variantById(variantId);
    if (!tpl) return;
    const next = { ...buildLog(state.today.log.data, tpl), variantId: tpl.id };
    state.today.log = next;
    state.today.template = tpl;
    persistToday();
  },

  // hold su ON/OFF: attiva/disattiva la giornata SGARRO (terzo stato, no target).
  async toggleSgarroDay() {
    const log = state.today.log;
    state.today.log = markSgarroDay(log, !isSgarroDay(log));
    persistToday();
  },

  async toggleMealLock(mealId) {
    const meal = state.today.log.meals.find((m) => m.id === mealId);
    const locked = meal.righe.every((r) => r.stato === 'bloccata');
    meal.righe.forEach((r) => (r.stato = locked ? 'aperta' : 'bloccata'));
    persistToday();
  },

  toggleEaten(mealId, row) {
    // Spuntare "mangiato" fa avanzare le barre: aggiorna la UI SUBITO e salva in
    // background (niente attesa dei 2-4s del backend).
    row.eaten = !row.eaten;
    render();
    queueSaveLog(state.today.log);
  },

  // ricalcolo forzato dall'utente (tasto refresh in Oggi)
  // Ricalcola in Oggi: stesso motore del banco (proposte spuntabili).
  recalcNow() {
    const { log, template } = state.today;
    if (isSgarroDay(log)) return; // SGARRO: nessun target rigido
    // cio che ho gia MANGIATO (eaten) o bloccato e intoccabile: non ha senso
    // proporre di cambiarne la grammatura.
    const plan = {
      target: template ? template.target : emptyTarget(),
      meals: log.meals.map((m) => ({ ...m, righe: m.righe.map((r) => ({ ...r, locked: r.locked || r.eaten || r.stato === 'bloccata' })) })),
    };
    const proposals = buildProposals(plan, state.foods, currentUsage());
    openProposals({
      proposals, foods: state.foods,
      onApply: (selected) => {
        applyProposals(state.today.log, selected);
        render();
        queueSaveLog(state.today.log);
      },
    });
  },

  // crea un cibo nel repertorio, ritorna il suo id
  async createFood(data) {
    const id = data.nome.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now();
    const food = { id, ...data }; // include per100g, rangeGrammatura, accessorio
    state.foods[id] = food;
    await store.saveFood(food);
    return id;
  },

  addSgarro() {
    const meal = state.today.log.meals[state.today.log.meals.length - 1];
    openSmartPicker({
      mealId: meal.id,
      onAdd: (items) => {
        for (const { foodId, grammatura } of items)
          meal.righe.push({ foodId, grammatura, stato: 'bloccata', isSgarro: true, eaten: true });
        persistToday();
      },
    });
  },

  addFood() {
    openFoodForm({ onSave: async (data) => { await ctx.createFood(data); render(); } });
  },


  editFood(id) {
    const food = state.foods[id];
    openFoodForm({ food, onSave: async (data) => {
      state.foods[id] = { id, ...data };
      await store.saveFood(state.foods[id]);
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
      target: { kcal: 0, carbo: 0, prot: 0, fat: 0 },
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

  async deleteVariant(variantId) {
    await store.deleteVariant(variantId);
    state.variants = await store.getVariants();
    render();
  },

  // modifica diretta di kcal/macro target di una variante (tab Target)
  async setVariantTarget(variantId, target) {
    const v = variantById(variantId);
    if (!v) return;
    await store.saveVariant({ ...v, target });
    state.variants = await store.getVariants();
    render();
  },

  // ---- modifica giornata (matita in Oggi) ----
  get editMode() { return state.editMode; },
  toggleEditMode() { state.editMode = !state.editMode; render(); },

  // sostituisci il cibo di una riga scegliendone un altro dal repertorio
  replaceFood(mealId, rowIndex) {
    openSmartPicker({
      mealId,
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
    queueSaveLog(state.today.log);
  },

  toggleRowLock(mealId, rowIndex) {
    const row = state.today.log.meals.find((m) => m.id === mealId).righe[rowIndex];
    row.locked = !row.locked;
    render();
    queueSaveLog(state.today.log);
  },

  removeRow(mealId, rowIndex) {
    state.today.log.meals.find((m) => m.id === mealId).righe.splice(rowIndex, 1);
    render();
    queueSaveLog(state.today.log);
  },

  addRowToMeal(mealId) {
    openSmartPicker({
      mealId,
      onAdd: (items) => {
        const meal = state.today.log.meals.find((m) => m.id === mealId);
        for (const { foodId, grammatura } of items)
          meal.righe.push({ foodId, grammatura, stato: 'aperta', isSgarro: false, eaten: false });
        persistToday();
      },
    });
  },

  // ---- vista settimana (tab Piani) ----
  get weekRef() { return state.weekRef || todayISO(); },
  shiftWeek(deltaDays) {
    const base = state.weekRef || todayISO();
    const [y, m, d] = base.split('-').map(Number);
    const nd = new Date(y, m - 1, d + deltaDays);
    const p = (n) => String(n).padStart(2, '0');
    state.weekRef = `${nd.getFullYear()}-${p(nd.getMonth() + 1)}-${p(nd.getDate())}`;
    render({ resetScroll: true });
  },
  // log gia salvato per una data (dallo storico in memoria)
  logForDate(dateISO) { return state.history.find((l) => l.data === dateISO) || null; },

  // assegna una variante a un giorno: crea (o sostituisce) il log di quella data
  assignPlanToDay(dateISO, variantId) {
    const tpl = variantById(variantId);
    if (!tpl) return;
    const log = buildLog(dateISO, tpl);
    log.variantId = tpl.id;
    saveLogReliable(log); // aggiorna history + backend
    if (dateISO === todayISO()) state.today = { log, foods: state.foods, template: tpl };
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
    saveInBackground(() => store.saveLog({ data: dateISO, cleared: true, meals: [] }));
    render();
  },

  // ---- banco da lavoro ----
  get banco() { return state.banco; },

  // openBanco: apre un PIANO esistente per id.
  openBanco(id) {
    const tpl = variantById(id);
    if (!tpl) return;
    state.banco = { plan: JSON.parse(JSON.stringify(tpl)), foods: state.foods };
    render({ resetScroll: true });
  },

  // apre un giorno (log) nel banco per modificarlo indipendentemente dal piano
  openDayBanco(dateISO) {
    const log = state.history.find((l) => l.data === dateISO);
    if (!log) return;
    const tpl = variantForLog(log);
    // il "plan" del banco per un giorno: usa i pasti del log + il target del
    // piano collegato (se il piano non esiste piu, ricade sul target del log
    // stesso o su zero: non deve mai crashare).
    const target = tpl ? tpl.target : (log.target || { kcal: 0, carbo: 0, prot: 0, fat: 0 });
    state.banco = {
      dayISO: dateISO,
      plan: { id: log.variantId, nome: `${dateISO}`, tipo: log.tipo, target,
        meals: JSON.parse(JSON.stringify(log.meals)) },
      foods: state.foods,
    };
    render({ resetScroll: true });
  },

  // salvataggio AUTOMATICO del piano in background (come Oggi salva il log).
  // Aggiorna anche la variante in memoria e, se e la variante di oggi, la giornata.
  saveBanco() {
    const b = state.banco;
    if (b.dayISO) {
      // il banco sta modificando un GIORNO (log), non una variante: salva il log
      const log = { data: b.dayISO, tipo: b.plan.tipo, variantId: b.plan.id, meals: JSON.parse(JSON.stringify(b.plan.meals)) };
      saveLogReliable(log);
      if (state.today && state.today.log.data === b.dayISO) state.today.log = log;
      return;
    }
    const plan = b.plan;
    const i = state.variants.findIndex((v) => v.id === plan.id);
    if (i >= 0) state.variants[i] = JSON.parse(JSON.stringify(plan));
    if (state.today && state.today.log.variantId === plan.id) state.today.template = plan;
    saveInBackground(() => store.saveVariant(plan));
  },

  bancoClose() { state.banco = null; render({ resetScroll: true }); },

  bancoSetGram(mealId, index, grammi) {
    const meal = state.banco.plan.meals.find((m) => m.id === mealId);
    meal.righe[index].grammatura = Math.max(0, grammi || 0);
    // niente render() (chiuderebbe la tastiera): aggiorno solo il tracker + salvo
    refreshTrackerBanco();
    ctx.saveBanco();
  },

  bancoRename() {
    openRenameForm({ value: state.banco.plan.nome, onSave: (nome) => {
      state.banco.plan.nome = nome;
      ctx.saveBanco();
      render();
    }});
  },

  bancoToggleLock(mealId, index) {
    const r = state.banco.plan.meals.find((m) => m.id === mealId).righe[index];
    r.locked = !r.locked;
    ctx.saveBanco(); render();
  },

  bancoRemove(mealId, index) {
    state.banco.plan.meals.find((m) => m.id === mealId).righe.splice(index, 1);
    ctx.saveBanco(); render();
  },

  bancoAddFood(mealId) {
    openSmartPicker({
      mealId,
      onAdd: (items) => {
        const meal = state.banco.plan.meals.find((m) => m.id === mealId);
        for (const { foodId, grammatura } of items) meal.righe.push({ foodId, grammatura });
        ctx.saveBanco(); render();
      },
    });
  },

  // Ricalcola = PROPONE modifiche/aggiunte spuntabili (ottimizzatore multi-macro).
  bancoAuto() {
    const proposals = buildProposals(state.banco.plan, state.foods, currentUsage());
    openProposals({
      proposals, foods: state.foods,
      onApply: (selected) => { applyProposals(state.banco.plan, selected); ctx.saveBanco(); render(); },
    });
  },

  // Salva il giorno corrente del banco come nuovo piano riutilizzabile
  // (icona floppy, solo per il banco di un GIORNO, non di un piano di libreria).
  bancoSaveAsPlan() {
    const b = state.banco;
    if (!b.dayISO) return; // ha senso solo modificando un giorno
    openRenameForm({ value: '', onSave: async (nome) => {
      const id = b.plan.tipo.toLowerCase() + '-' + Date.now();
      const meals = b.plan.meals.map((m) => ({
        id: m.id, nome: m.nome,
        righe: m.righe.map((r) => ({ foodId: r.foodId, grammatura: r.grammatura })),
      }));
      const nuovo = { id, nome, categoria: b.plan.tipo, target: { ...b.plan.target }, meals };
      await store.saveVariant(nuovo);
      state.variants = await store.getVariants();
      // il giorno resta collegato al piano appena creato
      b.plan.id = id;
      ctx.saveBanco();
      render();
    }});
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
// Con lo store mock i seed (foods, varianti, schedule) sono gia dentro.
async function seedIfEmpty() {
  const variants = await store.getVariants();
  if (variants && variants.length) return;
  for (const id of Object.keys(seedFoods)) await store.saveFood(seedFoods[id]);
  await store.saveVariant({ id: 'on-standard', nome: 'Giorno ON', categoria: 'ON', ...seedTemplates.ON });
  await store.saveVariant({ id: 'off-standard', nome: 'Giorno OFF', categoria: 'OFF', ...seedTemplates.OFF });
  await store.saveSchedule(seedSchedule);
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
    state.schedule = await store.getSchedule();
    state.history = (await store.getLogs?.()) || [];
    await loadToday();
    wireTabs();
    installSaveGuards();
    render();
    hideLoader();
  } catch (e) {
    console.error(e);
    showLoaderError('Impossibile caricare i dati. Controlla la connessione e riprova.', boot);
    return;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();

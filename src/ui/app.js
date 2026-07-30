// app.js — orchestratore: stato, routing tra schermate, azioni.

import { clear, el } from './dom.js';
import { icon } from './icons.js';
import { renderTracker } from './tracker.js';
import { createMockStore } from '../data/store.js';
import { createGasStore } from '../data/gasStore.js';
import { GAS_URL } from '../data/config.js';
import { seedFoods, seedTemplates, seedSchedule } from '../data/seed.js';
import { buildLog, weekdayKey, switchDayType, markSgarroDay, isSgarroDay } from '../core/day.js';
import { optimizePlan } from '../core/optimize.js';
import { flatFoods } from './format.js';
import { renderOggi } from './screens/oggi.js';
import { renderPiani } from './screens/piani.js';
import { renderBanco } from './screens/banco.js';
import { renderRepertorio } from './screens/repertorio.js';
import { renderStorico } from './screens/storico.js';
import { openFoodForm, openSgarroForm, openRenameForm, openProposals } from './modal.js';

// converte l'output dell'ottimizzatore in proposte per il modal (modifiche + aggiunte)
function buildProposals(plan, foods) {
  const flat = flatFoods(foods);
  const { changes, additions } = optimizePlan(plan, flat);
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
};

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---- helper varianti ----
function variantsOf(categoria) { return state.variants.filter((v) => v.categoria === categoria); }
function defaultVariant(categoria) {
  const inCat = variantsOf(categoria);
  return inCat.find((v) => v.isDefault) || inCat[0];
}
function variantById(id) { return state.variants.find((v) => v.id === id); }
// la variante applicata a un log (via log.variantId), con fallback alla default
function variantForLog(log) {
  const cat = isSgarroDay(log) ? (log.tipoBase || 'ON') : log.tipo;
  return (log.variantId && variantById(log.variantId)) || defaultVariant(cat);
}

async function loadToday() {
  const iso = todayISO();
  const categoriaPrevista = state.schedule.mappa[weekdayKey(iso)];
  // il log di oggi e gia tra i logs scaricati al boot (getAll): niente chiamata
  // extra. Solo se non c'e lo cerco puntualmente.
  let log = state.history.find((l) => l.data === iso) || null;
  if (!log) log = await store.getLog(iso);
  if (!log) {
    // Il log di Oggi nasce IDENTICO al piano (gia ottimizzato nel banco).
    const tpl = defaultVariant(categoriaPrevista);
    log = buildLog(iso, tpl);
    log.variantId = tpl.id;
    saveLogReliable(log);
  }
  state.today = { log, foods: state.foods, template: variantForLog(log) };
}

// ---- salvataggio del log sul backend (unica fonte di verita, condivisa tra
//      dispositivi). Salvataggio DIRETTO e IMMEDIATO a ogni azione: niente
//      debounce, niente sendBeacon (che verso GAS falliva silenziosamente
//      dicendo "salvato" senza scrivere). Semplice e affidabile.
function saveLogReliable(log) {
  log.savedAt = new Date().toISOString(); // timestamp con orario
  // aggiorna subito lo storico in memoria (UI coerente)
  const i = state.history.findIndex((l) => l.data === log.data);
  if (i >= 0) state.history[i] = log; else state.history.unshift(log);
  // invia SUBITO al backend
  saveStatus('salvo…');
  store.saveLog(log)
    .then(() => saveStatus('salvato'))
    .catch((e) => saveStatus('errore: ' + (e && e.message ? e.message : e)));
}

// indicatore di stato salvataggio, visibile a schermo
let statusTimer = null;
function saveStatus(text) {
  let box = document.getElementById('savestatus');
  if (!box) {
    box = document.createElement('div');
    box.id = 'savestatus';
    box.className = 'savestatus';
    document.body.appendChild(box);
  }
  const err = text.startsWith('errore');
  box.textContent = err ? '⚠ ' + text : (text === 'salvato' ? '✓ salvato' : text);
  box.className = 'savestatus ' + (err ? 'is-err' : (text === 'salvato' ? 'is-ok' : 'is-wait'));
  clearTimeout(statusTimer);
  if (!err) statusTimer = setTimeout(() => { box.classList.add('is-hidden'); }, 2000);
}

function queueSaveLog(log) { saveLogReliable(log); }
function installSaveGuards() { /* niente flush/beacon: salviamo gia a ogni azione */ }

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

// ---- azioni passate alle schermate via ctx ----
const ctx = {
  get foods() { return state.foods; },
  get today() { return state.today; },
  get history() { return state.history; },
  rerender: () => render(),
  // varianti
  variantsOf: (cat) => variantsOf(cat),
  defaultVariant: (cat) => defaultVariant(cat),
  variantForLog: (log) => variantForLog(log),

  async toggleDayType() {
    // ciclo ON <-> OFF. Se la giornata era SGARRO, torna al tipo base e commuta.
    const log = state.today.log;
    const base = isSgarroDay(log) ? (log.tipoBase || 'ON') : log.tipo;
    const nuovoTipo = base === 'ON' ? 'OFF' : 'ON';
    const tpl = defaultVariant(nuovoTipo);
    let next = isSgarroDay(log) ? markSgarroDay(log, false) : log;
    next = switchDayType(next, tpl);
    next.variantId = tpl.id;
    state.today.log = next;
    state.today.template = tpl;
    persistToday();
  },

  // applica una variante specifica alla giornata di oggi
  async applyVariant(variantId) {
    const tpl = variantById(variantId);
    if (!tpl) return;
    let next = switchDayType(state.today.log, tpl);
    next.variantId = tpl.id;
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
    // le righe con stato 'bloccata' (spuntate/bloccate) sono locked per il motore
    const plan = {
      target: template.target,
      meals: log.meals.map((m) => ({ ...m, righe: m.righe.map((r) => ({ ...r, locked: r.locked || r.stato === 'bloccata' })) })),
    };
    const proposals = buildProposals(plan, state.foods);
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
    openSgarroForm({
      foods: state.foods,
      onCreateFood: (data) => {
        // creazione sincrona in memoria; persistenza in background
        const id = data.nome.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now();
        state.foods[id] = { id, ...data };
        store.saveFood(state.foods[id]);
        return id;
      },
      onConfirm: async ({ foodId, grammatura }) => {
        const meal = state.today.log.meals[state.today.log.meals.length - 1];
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
  async createVariant(categoria) {
    const base = defaultVariant(categoria);
    const id = categoria.toLowerCase() + '-' + Date.now();
    const nuova = {
      ...JSON.parse(JSON.stringify(base)),
      id, nome: 'Nuova variante', categoria, isDefault: false,
    };
    await store.saveVariant(nuova);
    state.variants = await store.getVariants();
    render();
    // apri subito il banco sulla nuova variante per costruirla
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

  async setDefaultVariant(variantId) {
    const v = variantById(variantId);
    await store.saveVariant({ ...v, isDefault: true });
    state.variants = await store.getVariants();
    render();
  },

  async deleteVariant(variantId) {
    const v = variantById(variantId);
    if (v.isDefault) return; // non si elimina la default
    await store.deleteVariant(variantId);
    state.variants = await store.getVariants();
    render();
  },

  // ---- modifica giornata (matita in Oggi) ----
  get editMode() { return state.editMode; },
  toggleEditMode() { state.editMode = !state.editMode; render(); },

  // sostituisci il cibo di una riga scegliendone un altro dal repertorio
  replaceFood(mealId, rowIndex) {
    openSgarroForm({
      foods: state.foods,
      onCreateFood: (data) => {
        const id = data.nome.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now();
        state.foods[id] = { id, ...data }; store.saveFood(state.foods[id]); return id;
      },
      onConfirm: async ({ foodId, grammatura }) => {
        const row = state.today.log.meals.find((m) => m.id === mealId).righe[rowIndex];
        row.foodId = foodId; row.grammatura = grammatura;
        persistToday();
      },
    });
  },

  setRowGram(mealId, rowIndex, grammi) {
    const row = state.today.log.meals.find((m) => m.id === mealId).righe[rowIndex];
    row.grammatura = Math.max(0, grammi || 0);
    render();
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
    openSgarroForm({
      foods: state.foods,
      onCreateFood: (data) => {
        const id = data.nome.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now();
        state.foods[id] = { id, ...data }; store.saveFood(state.foods[id]); return id;
      },
      onConfirm: async ({ foodId, grammatura }) => {
        state.today.log.meals.find((m) => m.id === mealId).righe.push(
          { foodId, grammatura, stato: 'aperta', isSgarro: false, eaten: false });
        persistToday();
      },
    });
  },

  // ---- banco da lavoro ----
  get banco() { return state.banco; },

  // openBanco riceve un id-variante (o una categoria, per compat: usa la default)
  openBanco(idOrCat) {
    const tpl = variantById(idOrCat) || defaultVariant(idOrCat);
    state.banco = { plan: JSON.parse(JSON.stringify(tpl)), foods: state.foods };
    render({ resetScroll: true });
  },

  bancoClose() { state.banco = null; render({ resetScroll: true }); },

  bancoSetGram(mealId, index, grammi) {
    const meal = state.banco.plan.meals.find((m) => m.id === mealId);
    meal.righe[index].grammatura = Math.max(0, grammi || 0);
    render();
  },

  bancoToggleLock(mealId, index) {
    const meal = state.banco.plan.meals.find((m) => m.id === mealId);
    const r = meal.righe[index];
    r.locked = !r.locked;
    render();
  },

  bancoRemove(mealId, index) {
    const meal = state.banco.plan.meals.find((m) => m.id === mealId);
    meal.righe.splice(index, 1);
    render();
  },

  bancoAddFood(mealId) {
    openSgarroForm({
      foods: state.foods,
      onCreateFood: (data) => {
        const id = data.nome.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now();
        state.foods[id] = { id, ...data }; store.saveFood(state.foods[id]); return id;
      },
      onConfirm: ({ foodId, grammatura }) => {
        const meal = state.banco.plan.meals.find((m) => m.id === mealId);
        meal.righe.push({ foodId, grammatura });
        render();
      },
    });
  },

  // Ricalcola = PROPONE modifiche/aggiunte spuntabili (ottimizzatore multi-macro).
  bancoAuto() {
    const proposals = buildProposals(state.banco.plan, state.foods);
    openProposals({
      proposals, foods: state.foods,
      onApply: (selected) => { applyProposals(state.banco.plan, selected); render(); },
    });
  },

  async bancoSave() {
    const plan = state.banco.plan;
    await store.saveVariant(plan);
    state.variants = await store.getVariants();

    // se OGGI usa questa variante, chiedi se aggiornare la giornata al nuovo piano
    const oggiUsaVariante = state.today && state.today.log.variantId === plan.id && !isSgarroDay(state.today.log);
    state.banco = null;

    if (oggiUsaVariante) {
      state.today.template = plan;
      const conferma = confirm('Hai modificato il piano di oggi. Aggiornare la giornata di oggi al nuovo piano? (le spunte "mangiato" verranno mantenute dove possibile)');
      if (conferma) {
        const fresh = buildLog(state.today.log.data, plan);
        fresh.variantId = plan.id;
        // mantieni le spunte dei cibi ancora presenti
        for (const m of fresh.meals) {
          const old = state.today.log.meals.find((x) => x.id === m.id);
          for (const r of m.righe) {
            const oldR = old?.righe.find((x) => x.foodId === r.foodId);
            if (oldR?.eaten) r.eaten = true;
          }
        }
        state.today.log = fresh;
        await store.saveLog(fresh);
      }
    }
    render({ resetScroll: true });
  },
};

const screens = { oggi: renderOggi, piani: renderPiani, repertorio: renderRepertorio, storico: renderStorico };

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
  { id: 'piani', label: 'Piani', ic: 'tabPiani' },
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
  await store.saveVariant({ id: 'on-standard', nome: 'Standard', categoria: 'ON', isDefault: true, ...seedTemplates.ON });
  await store.saveVariant({ id: 'off-standard', nome: 'Standard', categoria: 'OFF', isDefault: true, ...seedTemplates.OFF });
  await store.saveSchedule(seedSchedule);
}

function hideLoader() {
  const l = document.getElementById('loader');
  if (l) { l.classList.add('is-hidden'); setTimeout(() => l.remove(), 300); }
}
function showLoaderError(msg) {
  const l = document.getElementById('loader');
  if (!l) return;
  l.querySelector('.loader__spin')?.remove();
  l.querySelector('.loader__txt').textContent = msg;
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
    showLoaderError('Impossibile caricare i dati. Controlla la connessione e riapri.');
    return;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();

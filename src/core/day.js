// day.js — logica di dominio del "giorno": costruire il log dal template,
// gestire blocchi/aperture e ricalcolare con il solver.
// Puro: nessuna dipendenza da DOM o storage.

import { redistribute, macrosOfRows } from './solver.js';

const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const WORKDAYS = new Set(['lun', 'mar', 'mer', 'gio', 'ven']);

/** Chiave giorno (lun..dom) da una data ISO 'YYYY-MM-DD'. */
export function weekdayKey(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d); // ora locale, no timezone shift
  return WEEKDAYS[date.getDay()];
}

/**
 * Crea un Log a partire da un DayTemplate per una data.
 * Ogni riga riceve uno stato: il pranzo dei giorni lavorativi nasce 'bloccata'
 * (cucinato la sera prima), tutto il resto 'aperta'.
 */
export function buildLog(dateISO, template) {
  const isWorkday = WORKDAYS.has(weekdayKey(dateISO));
  return {
    data: dateISO,
    tipo: template.tipo,
    meals: template.meals.map((meal) => ({
      id: meal.id,
      nome: meal.nome,
      righe: meal.righe.map((r) => ({
        foodId: r.foodId,
        grammatura: r.grammatura,
        stato: meal.id === 'pranzo' && isWorkday ? 'bloccata' : 'aperta',
        isSgarro: false,
      })),
    })),
  };
}

/** Un giorno e di tipo SGARRO? (terzo stato oltre ON/OFF, senza target rigido) */
export function isSgarroDay(log) {
  return log.tipo === 'SGARRO';
}

/**
 * Esito di una giornata per lo storico/calendario. Tre stati:
 *   'ok'     = ho spuntato almeno un cibo e nessuno sgarro
 *   'sgarro' = giornata SGARRO, oppure contiene righe fuori piano
 *   'vuoto'  = non ho tracciato nulla (nessuna spunta)
 */
export function dayStatus(log) {
  if (!log) return { stato: 'vuoto' };
  const righe = log.meals.flatMap((m) => m.righe);
  if (isSgarroDay(log) || righe.some((r) => r.isSgarro)) return { stato: 'sgarro' };
  if (righe.some((r) => r.eaten)) return { stato: 'ok' };
  return { stato: 'vuoto' };
}

/**
 * Marca (o smarca) un log come giornata SGARRO.
 * Attivando: "blank canvas" — stessi pasti (contenitori) ma SVUOTATI, cosi
 * l'utente aggiunge solo cio che ha davvero mangiato. I pasti originali sono
 * salvati in `mealsBase` per poterli ripristinare smarcando. Ricorda anche il
 * tipo originale in `tipoBase`. Non muta il log passato.
 */
export function markSgarroDay(log, attiva) {
  if (attiva) {
    if (isSgarroDay(log)) return { ...log };
    return {
      ...log,
      tipo: 'SGARRO',
      tipoBase: log.tipo,
      mealsBase: log.meals, // conserva i pasti originali
      meals: log.meals.map((m) => ({ id: m.id, nome: m.nome, righe: [] })), // vuoti
    };
  }
  // smarca: ripristina pasti e tipo originali
  const base = log.tipoBase || 'ON';
  const meals = log.mealsBase || log.meals;
  const { tipoBase, mealsBase, ...rest } = log;
  return { ...rest, tipo: base, meals };
}

/**
 * Banco da lavoro: dimensiona le righe "auto" di un template verso il target,
 * lasciando fisse le righe manuali (auto:false). Restituisce il template con le
 * grammature auto aggiornate + i totali di TUTTI i cibi (per le barre).
 *
 * Riusa lo stesso motore di recalcLog: auto:false = "bloccata", auto:true =
 * "aperta". Non muta il plan passato.
 */
export function recalcPlan(plan, foods, defaultRangePct = 2) {
  // Nel banco le grammature auto possono variare molto (stai costruendo da zero),
  // quindi il range di default e piu ampio che in Home.
  const flat = flatFoods(foods);

  const locked = [];
  const open = [];
  const openRefs = [];
  const clone = { ...plan, meals: plan.meals.map((m) => ({ ...m, righe: m.righe.map((r) => ({ ...r })) })) };

  for (const meal of clone.meals) {
    for (const riga of meal.righe) {
      if (riga.auto) { open.push({ foodId: riga.foodId, grammatura: riga.grammatura }); openRefs.push(riga); }
      else { locked.push({ foodId: riga.foodId, grammatura: riga.grammatura }); }
    }
  }

  if (open.length > 0) {
    const lockedMacros = macrosOfRows(locked, flat);
    const rest = {};
    for (const m of ['kcal', 'carbo', 'prot', 'fat']) rest[m] = plan.target[m] - lockedMacros[m];
    const { rows } = redistribute({ rest, openRows: open, foods: flat, defaultRangePct });
    rows.forEach((row, i) => { openRefs[i].grammatura = row.grammatura; });
  }

  // Totali di tutti i cibi del piano, per le barre.
  const allRows = [];
  for (const meal of clone.meals) for (const r of meal.righe) allRows.push(r);
  const totals = macrosOfRows(allRows, flat);

  return { plan: clone, totals };
}

/**
 * Cambia il tipo di un log (ON<->OFF). I pasti gia BLOCCATI mantengono
 * contenuto e stato invariati (es. pranzo cucinato): cambiare tipo non deve
 * toccare cio che e gia vero. I pasti aperti prendono il contenuto del nuovo
 * template. Restituisce un nuovo log (non muta quello passato).
 */
export function switchDayType(log, nextTemplate) {
  const fresh = buildLog(log.data, nextTemplate);
  for (const meal of fresh.meals) {
    const old = log.meals.find((m) => m.id === meal.id);
    const wasLocked = old && old.righe.length && old.righe.every((r) => r.stato === 'bloccata');
    if (wasLocked) meal.righe = old.righe.map((r) => ({ ...r }));
  }
  return fresh;
}

// Il solver vuole foods in formato piatto {kcal,carbo,prot,fat}. I nostri Food
// hanno .per100g. Questa vista adatta il formato senza duplicare i dati.
function flatFoods(foods) {
  const out = {};
  for (const id of Object.keys(foods)) {
    out[id] = { ...foods[id].per100g };
    if (foods[id].rangeGrammatura) out[id].rangeGrammatura = foods[id].rangeGrammatura;
  }
  return out;
}

/**
 * Ricalcola un log: tiene fisse le righe 'bloccata', ridistribuisce le 'aperta'
 * per avvicinarsi al target. Restituisce un nuovo log con le grammature
 * aggiornate + lo scarto residuo.
 */
export function recalcLog(log, target, foods) {
  const flat = flatFoods(foods);

  // Raccoglie tutte le righe con un riferimento alla loro posizione, cosi da
  // riscriverle dopo la ridistribuzione.
  const locked = [];
  const open = [];
  const openRefs = [];
  for (const meal of log.meals) {
    for (const riga of meal.righe) {
      if (riga.stato === 'bloccata') {
        locked.push({ foodId: riga.foodId, grammatura: riga.grammatura });
      } else {
        open.push({ foodId: riga.foodId, grammatura: riga.grammatura });
        openRefs.push(riga);
      }
    }
  }

  const lockedMacros = macrosOfRows(locked, flat);
  const rest = {};
  for (const m of ['kcal', 'carbo', 'prot', 'fat']) rest[m] = target[m] - lockedMacros[m];

  const { rows, residual } = redistribute({ rest, openRows: open, foods: flat });

  // Riscrive le grammature aperte nel log (stesso ordine di openRefs).
  rows.forEach((row, i) => { openRefs[i].grammatura = row.grammatura; });

  return { ...log, residual };
}

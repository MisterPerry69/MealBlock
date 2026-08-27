// day.js — logica di dominio del "giorno": costruire il log dal template,
// gestire blocchi/aperture, stato sgarro. Puro: nessuna dipendenza da DOM o storage.

const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const WORKDAYS = new Set(['lun', 'mar', 'mer', 'gio', 'ven']);

/** Chiave giorno (lun..dom) da una data ISO 'YYYY-MM-DD'. */
export function weekdayKey(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d); // ora locale, no timezone shift
  return WEEKDAYS[date.getDay()];
}

function toISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** I 7 giorni ISO (lunedi..domenica) della settimana che contiene dateISO. */
export function weekDays(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const offset = (date.getDay() + 6) % 7; // getDay: dom=0 -> vogliamo lun=0
  const monday = new Date(y, m - 1, d - offset);
  const out = [];
  for (let i = 0; i < 7; i++) out.push(toISO(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
  return out;
}

/**
 * Crea un Log a partire da un DayTemplate per una data. Il target NON viene
 * dal template (i piani non ne hanno uno proprio): va passato esplicitamente
 * dal chiamante (il target della categoria, es. state.targets[tipo]) e viene
 * copiato nel log — da quel momento e un valore del giorno, indipendente dal
 * piano collegato.
 * Ogni riga riceve uno stato: il pranzo dei giorni lavorativi nasce 'bloccata'
 * (cucinato la sera prima), tutto il resto 'aperta'.
 */
export function buildLog(dateISO, template, target) {
  const isWorkday = WORKDAYS.has(weekdayKey(dateISO));
  return {
    data: dateISO,
    tipo: template.tipo,
    target: { ...target },
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
 * Cambia il TIPO (e il TARGET) di un log (ON<->OFF). I pasti restano
 * esattamente quelli che c'erano, li aggiusti tu a mano verso il nuovo
 * target. Non aggancia il giorno a nessun piano: resta "in stasi" finche non
 * lo salvi esplicitamente come piano. Restituisce un nuovo log (non muta
 * quello passato).
 */
export function switchDayType(log, nextTipo, nextTarget) {
  return { ...log, tipo: nextTipo, target: { ...nextTarget } };
}

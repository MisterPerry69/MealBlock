// ============================================================
//  week.js — generatore settimana deterministico (senza AI).
//  Compone 7 giorni scegliendo i blocchi per fascia, rispettando
//  i limiti settimanali (per blocco e per alimento). L'AI in fase 4
//  produrrà la stessa forma {days:[{date,dayType,selection}]}.
//  Il solver gira poi per-giorno nel client -> macro garantiti.
// ============================================================
(function () {
  "use strict";
  const SLOTS = ["colazione", "pranzo", "merenda", "cena"];

  // lunedì della settimana che contiene `d`
  function mondayOf(d) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7; // 0 = lunedì
    x.setDate(x.getDate() - day);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  // data ISO in ora LOCALE (toISOString è UTC: a mezzanotte locale
  // scivolerebbe al giorno prima -> settimana tutta shiftata di -1)
  function iso(d) {
    const p = (n) => (n < 10 ? "0" : "") + n;
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function isoWeekId(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const wk = Math.ceil((((date - yStart) / 86400000) + 1) / 7);
    return date.getUTCFullYear() + "-W" + ("0" + wk).slice(-2);
  }

  function enabledBySlot(blocks) {
    const by = { colazione: [], pranzo: [], merenda: [], cena: [] };
    for (const id of Object.keys(blocks)) {
      const b = blocks[id];
      if (b.enabled !== false && by[b.slot]) by[b.slot].push(b);
    }
    return by;
  }

  // conta quante volte un alimento comparirebbe scegliendo un blocco
  function foodsOfBlock(block) { return (block.items || []).map((i) => i.food); }

  // verifica col solver che il giorno sia risolvibile in target; se no,
  // prova a sostituire pranzo/cena con le alternative (deterministico).
  function ensureSolvable(day, ctx) {
    const { foods, blocks, prefs } = ctx;
    const frozen = ctx.frozen || {};
    const SOLVER = (typeof window !== "undefined" && window.MB_SOLVER) || (typeof require !== "undefined" ? require("./solver.js") : null);
    if (!SOLVER || !foods) return day; // senza solver/foods non posso verificare
    const ok = (sel) => SOLVER.solveDay({ dayType: day.dayType, foods, blocks, prefs, selection: sel, frozen }).status.inTarget;
    if (ok(day.selection)) return day;
    // ritenta sostituendo prima la cena, poi il pranzo, con ogni alternativa
    // (mai gli slot frozen: sono pasti fatti/modificati/liberi dell'utente)
    for (const slot of ["cena", "pranzo"]) {
      if (frozen[slot]) continue;
      const alts = Object.values(blocks).filter((b) => b.slot === slot && b.enabled !== false && b.id !== day.selection[slot]);
      for (const alt of alts) {
        const sel = { ...day.selection, [slot]: alt.id };
        if (ok(sel)) return { ...day, selection: sel };
      }
    }
    return day; // nessuna combinazione in target: pazienza, resta la migliore
  }

  // genera la settimana per la data `anchor` (default oggi)
  function generateWeek(opts) {
    const { blocks, prefs, anchor } = opts;
    // bias del learner (preferiti prima), se disponibile
    const learnBias = (typeof window !== "undefined" && window.MB_LEARNER && prefs)
      ? window.MB_LEARNER.blockBias(prefs) : null;
    const start = mondayOf(anchor || new Date());
    const onDays = new Set((prefs.onDaysDefault || [1, 3, 5])); // getDay(): 1=lun
    const blockLimits = prefs.blockWeekLimits || {};
    const foodLimits = prefs.foodWeekLimits || {};
    const by = enabledBySlot(blocks);

    const blockUsed = {};   // blockId -> count
    const foodUsed = {};    // foodId -> count
    const days = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(start); date.setDate(start.getDate() + i);
      const dow = date.getDay(); // 0=dom..6=sab
      const dayType = onDays.has(dow) ? "ON" : "OFF";
      const selection = {};
      for (const slot of SLOTS) {
        const pick = chooseBlock(by[slot], { blockLimits, foodLimits, blockUsed, foodUsed, seed: i, learnBias });
        if (pick) selection[slot] = pick.id;
      }
      // verifica che la combinazione sia risolvibile in target per il dayType
      // (es. pizza in giorno OFF sfonda i carb): se no, sostituisce cena/pranzo
      let day = { date: iso(date), dow, dayType, selection };
      day = ensureSolvable(day, { foods: opts.foods, blocks, prefs });
      // aggiorna i conteggi limiti SULLA selezione definitiva
      for (const slot of SLOTS) {
        const id = day.selection[slot]; if (!id) continue;
        blockUsed[id] = (blockUsed[id] || 0) + 1;
        for (const f of foodsOfBlock(blocks[id])) foodUsed[f] = (foodUsed[f] || 0) + 1;
      }
      days.push(day);
    }

    return { id: isoWeekId(start), weekStart: iso(start), onDays: [...onDays], days };
  }

  // sceglie il blocco meno usato che non sfora i limiti; rotazione deterministica
  function chooseBlock(candidates, ctx) {
    if (!candidates || !candidates.length) return null;
    const { blockLimits, foodLimits, blockUsed, foodUsed, seed, learnBias } = ctx;
    // ordina: rispetta limiti, poi meno usato, poi rotazione per varietà
    const rotated = candidates.slice(seed % candidates.length).concat(candidates.slice(0, seed % candidates.length));
    const feasible = rotated.filter((b) => {
      if (blockLimits[b.id] != null && (blockUsed[b.id] || 0) >= blockLimits[b.id]) return false;
      for (const f of foodsOfBlock(b)) if (foodLimits[f] != null && (foodUsed[f] || 0) >= foodLimits[f]) return false;
      return true;
    });
    const pool = feasible.length ? feasible : rotated; // se tutti pieni, rilassa (meglio ripetere che vuoto)
    // punteggio: penalizza chi sfora i limiti alimento, poi il meno usato
    const overFood = (b) => foodsOfBlock(b).reduce((n, f) =>
      n + (foodLimits[f] != null && (foodUsed[f] || 0) >= foodLimits[f] ? 1 : 0), 0);
    // "costo" = usato finora meno un bonus proporzionale al gradimento:
    // un blocco amato tollera qualche uso in più prima di essere scartato,
    // ma la varietà resta (il bonus è limitato).
    const pref = (b) => (learnBias && learnBias.score) ? Math.min(1.2, (learnBias.score[b.id] || 0) * 0.25) : 0;
    const cost = (b) => (blockUsed[b.id] || 0) - pref(b);
    pool.sort((a, b) => (overFood(a) - overFood(b)) || (cost(a) - cost(b)));
    return pool[0];
  }

  const WEEK = { generateWeek, ensureSolvable, mondayOf, isoWeekId, iso };
  if (typeof window !== "undefined") window.MB_WEEK = WEEK;
  if (typeof module !== "undefined") module.exports = WEEK;
})();

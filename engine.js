// ============================================================
//  MealBlock — ENGINE
//  Puro calcolo. Nessun DOM, nessun localStorage.
//  Riceve numeri/oggetti, ritorna numeri/oggetti. Testabile.
//
//  Dipende dai dati passati come argomenti (foods, blocks,
//  targets, ecc.) — NON legge variabili globali, così i test
//  possono iniettare dati controllati.
// ============================================================

(function (root) {
  "use strict";

  const EMPTY = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const MACROS = ["kcal", "protein", "carbs", "fat"];

  // ---- util ----
  function round1(n) { return Math.round(n * 10) / 10; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // ------------------------------------------------------------
  //  calcMacros(items, foods)
  //  items: [{ food, grams }]  (grams numerici; "flex" => 0)
  //  ritorna { kcal, protein, carbs, fat } arrotondati a 1 dec.
  // ------------------------------------------------------------
  function calcMacros(items, foods) {
    const acc = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    for (const it of items || []) {
      const f = foods[it.food];
      if (!f) continue;
      const g = typeof it.grams === "number" ? it.grams : 0;
      const k = g / 100;
      acc.kcal    += f.kcal    * k;
      acc.protein += f.protein * k;
      acc.carbs   += f.carbs   * k;
      acc.fat     += f.fat     * k;
    }
    return {
      kcal:    Math.round(acc.kcal),
      protein: round1(acc.protein),
      carbs:   round1(acc.carbs),
      fat:     round1(acc.fat),
    };
  }

  function addMacros(a, b) {
    return {
      kcal: a.kcal + b.kcal, protein: a.protein + b.protein,
      carbs: a.carbs + b.carbs, fat: a.fat + b.fat,
    };
  }
  function diffMacros(actual, target) {
    return {
      kcal: actual.kcal - target.kcal, protein: round1(actual.protein - target.protein),
      carbs: round1(actual.carbs - target.carbs), fat: round1(actual.fat - target.fat),
    };
  }

  // ------------------------------------------------------------
  //  status(actual, target, tol) -> per-macro 'ok'|'over'|'under'
  //  + flag globale inTarget
  // ------------------------------------------------------------
  function status(actual, target, tol) {
    const out = {};
    let inTarget = true;
    for (const m of MACROS) {
      const d = actual[m] - target[m];
      let s = "ok";
      if (d > tol[m]) s = "over";
      else if (d < -tol[m]) s = "under";
      if (s !== "ok") inTarget = false;
      out[m] = { value: actual[m], target: target[m], diff: round1(d), state: s };
    }
    out.inTarget = inTarget;
    return out;
  }

  // ------------------------------------------------------------
  //  resolveBlockItems(block, dayType, foods)
  //  Espande un blocco nei suoi item concreti, includendo gli
  //  extra ON/OFF. Gli item "flex" restano con grams:"flex".
  // ------------------------------------------------------------
  function resolveBlockItems(block, dayType) {
    let items = block.items.map((it) => ({ ...it }));
    if (dayType === "ON" && block.onExtras) items = items.concat(block.onExtras.map((it) => ({ ...it })));
    if (dayType === "OFF" && block.offExtras) items = items.concat(block.offExtras.map((it) => ({ ...it })));
    return items;
  }

  // ------------------------------------------------------------
  //  fillFlexCarbs(items, gapCarbs, foods)
  //  Distribuisce un fabbisogno di carbo (gapCarbs g) sugli item
  //  marcati "flex", proporzionalmente ai carbo/100g.
  //  Muta una COPIA e la ritorna. Ogni flex non scende sotto 0
  //  né sale oltre un cap ragionevole (per evitare 900g di purè).
  // ------------------------------------------------------------
  function fillFlexCarbs(items, gapCarbs, foods, caps) {
    const out = items.map((it) => ({ ...it }));
    const flex = out.filter((it) => it.grams === "flex" && foods[it.food]);
    if (flex.length === 0) { out.forEach((it) => { if (it.grams === "flex") it.grams = 0; }); return out; }

    // peso = carbo per grammo (guardia: alimento mancante => peso minimo)
    const weights = flex.map((it) => ((foods[it.food] ? foods[it.food].carbs : 0) / 100) || 0.0001);
    const wsum = weights.reduce((a, b) => a + b, 0);

    flex.forEach((it, i) => {
      const share = gapCarbs * (weights[i] / wsum); // grammi di carbo da coprire
      const carbsPerGram = foods[it.food].carbs / 100 || 0.0001;
      let grams = share / carbsPerGram;
      const cap = (caps && caps[it.food]) || 600;
      grams = clamp(Math.round(grams), 0, cap);
      it.grams = grams;
    });
    return out;
  }

  // ------------------------------------------------------------
  //  generateDay({ dayType, selection, frozen, data })
  //  - dayType: "ON" | "OFF"
  //  - selection: { pranzo: "lunch_C", cena: "dinner_A", ... }
  //      blocchi scelti per slot. Mancanti => primo BLOCK_OPTIONS.
  //  - frozen: { [slot]: items[] }  blocchi "fatti" già consumati
  //      (grammature concrete) da congelare e contare ma non toccare.
  //  - data: { FOODS, BLOCKS, BLOCK_OPTIONS, TARGETS, TOLERANCE }
  //
  //  Ritorna:
  //  {
  //    dayType, target,
  //    blocks: [{ slot, blockId, label, items:[{food,grams}], frozen:bool }],
  //    totals, status, suggestions (se fuori tolleranza)
  //  }
  // ------------------------------------------------------------
  function generateDay(opts) {
    const { dayType, data } = opts;
    const selection = opts.selection || {};
    const frozen = opts.frozen || {};
    const { FOODS, BLOCKS, BLOCK_OPTIONS, TARGETS, TOLERANCE, SOLVER_WEIGHTS } = data;
    const target = TARGETS[dayType];

    const SLOTS = ["colazione", "pranzo", "merenda", "cena"];
    const blocks = [];

    // 1) work snack fisso (sempre presente)
    const ws = BLOCKS.work_snack;
    blocks.push({
      slot: "snack", blockId: "work_snack", label: ws.label,
      items: ws.items.map((it) => ({ ...it })), frozen: true, fixedDaily: true,
    });

    // 2) blocchi per slot
    for (const slot of SLOTS) {
      if (frozen[slot]) {
        // blocco congelato: usa le grammature fornite
        blocks.push({
          slot, blockId: frozen[slot].blockId || null,
          label: frozen[slot].label || slot,
          items: frozen[slot].items.map((it) => ({ ...it })), frozen: true,
        });
        continue;
      }
      const blockId = selection[slot] || (BLOCK_OPTIONS[slot] && BLOCK_OPTIONS[slot][0]);
      const block = BLOCKS[blockId];
      if (!block) continue;
      const items = resolveBlockItems(block, dayType);
      blocks.push({ slot, blockId, label: block.label, items, frozen: false });
    }

    // 3) macro dei blocchi congelati + dei fixed dei non-congelati
    let fixedTotal = { ...EMPTY };
    for (const b of blocks) {
      if (b.frozen) {
        fixedTotal = addMacros(fixedTotal, calcMacros(b.items, FOODS));
      } else {
        const fixedItems = b.items.filter((it) => it.grams !== "flex");
        fixedTotal = addMacros(fixedTotal, calcMacros(fixedItems, FOODS));
      }
    }

    // 4) gap di carbo da coprire con le valvole flex (solo blocchi non-congelati)
    const gapCarbs = Math.max(0, target.carbs - fixedTotal.carbs);

    // raccogli tutti i flex dei blocchi non-congelati e riempili insieme
    const flexCarry = []; // riferimenti per riscrivere dopo
    const allFlex = [];
    for (const b of blocks) {
      if (b.frozen) continue;
      b.items.forEach((it, idx) => {
        if (it.grams === "flex") { allFlex.push({ ...it }); flexCarry.push({ b, idx }); }
      });
    }
    const filled = fillFlexCarbs(allFlex, gapCarbs, FOODS);
    filled.forEach((it, i) => {
      const ref = flexCarry[i];
      ref.b.items[ref.idx] = { ...ref.b.items[ref.idx], grams: it.grams };
    });

    // 4.5) AUTO-FILL del resto (proteine/grassi): aggiunge fonti mirate al
    //      blocco merenda finché i macro rientrano (max 2 iterazioni).
    //      Non tocca i blocchi congelati. Usa solo alimenti "non jolly".
    if (opts.autoFill !== false) {
      autoFillDay(blocks, target, FOODS, TOLERANCE, SOLVER_WEIGHTS);
    }

    // 5) totali finali
    let totals = { ...EMPTY };
    for (const b of blocks) totals = addMacros(totals, calcMacros(b.items, FOODS));
    totals = {
      kcal: Math.round(totals.kcal), protein: round1(totals.protein),
      carbs: round1(totals.carbs), fat: round1(totals.fat),
    };

    const st = status(totals, target, TOLERANCE);

    // 6) se ANCORA fuori tolleranza (caso raro/impossibile), proponi Top-3
    let suggestions = null;
    if (!st.inTarget) {
      const gap = diffMacros(target, totals);
      suggestions = solveGap({ gap, data, exclude: [] });
    }

    return { dayType, target, blocks, totals, status: st, suggestions };
  }

  // ------------------------------------------------------------
  //  autoFillDay — chiude i gap residui aggiungendo fonti mirate
  //  al blocco "merenda" (o al primo blocco non congelato disponibile).
  //  Salta alimenti `jolly` (non vanno usati dal generatore).
  // ------------------------------------------------------------
  const SOLVER_W_DEFAULT = { protein: 3, kcal: 2, carbs: 1, fat: 1 };
  function autoFillDay(blocks, target, foods, tol, weights) {
    const W = weights || SOLVER_W_DEFAULT;
    const host = blocks.find((b) => !b.frozen && b.slot === "merenda")
      || blocks.find((b) => !b.frozen);
    if (!host) return;

    const candidates = Object.keys(foods).filter((id) => !foods[id].jolly);

    for (let iter = 0; iter < 3; iter++) {
      let totals = { ...EMPTY };
      for (const b of blocks) totals = addMacros(totals, calcMacros(b.items, foods));
      const st = status({
        kcal: Math.round(totals.kcal), protein: round1(totals.protein),
        carbs: round1(totals.carbs), fat: round1(totals.fat),
      }, target, tol);
      if (st.inTarget) break;

      const gap = diffMacros(target, totals); // quanto manca
      // se l'unico problema è un eccesso (gap negativi), non possiamo aggiungere: stop
      if (gap.protein <= tol.protein && gap.fat <= tol.fat && gap.carbs <= tol.carbs && gap.kcal <= tol.kcal) break;

      const top = solveGap({ gap, data: { FOODS: foods, SOLVER_WEIGHTS: W }, candidates });
      if (!top.length || top[0].grams <= 0) break;
      const pick = top[0];
      const ex = host.items.find((x) => x.food === pick.food);
      if (ex) ex.grams += pick.grams; else host.items.push({ food: pick.food, grams: pick.grams });
    }
  }

  // ------------------------------------------------------------
  //  solveGap({ gap, data, candidates?, exclude? })
  //  gap: quanto manca per ogni macro (può essere negativo = eccesso)
  //  Per ogni alimento candidato calcola la grammatura ottimale
  //  (minimi quadrati a 1 variabile, pesata) e il punteggio.
  //  Ritorna le Top-3: [{ food, label, grams, result, score, resultingGap }]
  // ------------------------------------------------------------
  function solveGap(opts) {
    const { gap, data } = opts;
    const { FOODS, SOLVER_WEIGHTS } = data;
    const W = SOLVER_WEIGHTS || { protein: 3, kcal: 2, carbs: 1, fat: 1 };
    const candidates = opts.candidates || Object.keys(FOODS);
    const exclude = new Set(opts.exclude || []);
    const preferCat = opts.preferCat || null; // bonus per stessa categoria (sostituzioni "stessa funzione")

    // per ogni alimento, trova grammi g>=0 che minimizzano
    //   sum_m W[m] * (f[m]*g/100 - gap[m])^2
    // soluzione closed-form: g = 100 * (sum W*f*gap) / (sum W*f^2)
    const results = [];
    for (const id of candidates) {
      if (exclude.has(id)) continue;
      const f = FOODS[id];
      if (!f) continue;
      let num = 0, den = 0;
      for (const m of MACROS) {
        const fm = m === "protein" ? f.protein : m === "carbs" ? f.carbs : m === "fat" ? f.fat : f.kcal;
        num += W[m] * fm * gap[m];
        den += W[m] * fm * fm;
      }
      if (den <= 0) continue;
      let grams = 100 * (num / den);
      grams = Math.round(clamp(grams, 0, 1000));
      if (grams <= 0) continue;

      const result = calcMacros([{ food: id, grams }], FOODS);
      // score = errore pesato residuo
      let score = 0;
      for (const m of MACROS) {
        const resid = (m === "protein" ? result.protein : m === "carbs" ? result.carbs : m === "fat" ? result.fat : result.kcal) - gap[m];
        score += W[m] * resid * resid;
      }
      // bias di categoria: chi è della stessa "funzione" del cibo sostituito
      // ottiene uno sconto di score (preferisce carbo↔carbo, prot↔prot).
      if (preferCat && f.cat !== preferCat) score *= 2.2;
      results.push({
        food: id, label: f.label || id, cat: f.cat, grams, result,
        score: Math.round(score),
        resultingGap: {
          kcal: Math.round(gap.kcal - result.kcal),
          protein: round1(gap.protein - result.protein),
          carbs: round1(gap.carbs - result.carbs),
          fat: round1(gap.fat - result.fat),
        },
      });
    }
    results.sort((a, b) => a.score - b.score);
    return results.slice(0, 3);
  }

  // ------------------------------------------------------------
  //  solveSubstitution({ slot/block items, changedFood, newGrams,
  //                      target, data })
  //  Caso "mi restano 50g di pasta": calcola il nuovo gap dopo la
  //  modifica e propone Top-3 sostituzioni (escludendo l'alimento
  //  già presente nel pasto per evitare suggerimenti banali).
  // ------------------------------------------------------------
  function solveSubstitution(opts) {
    const { items, target, data } = opts;
    const { FOODS } = data;
    const actual = calcMacros(items, FOODS);
    const gap = diffMacros(target, actual); // quanto manca
    const present = items.map((it) => it.food);
    return {
      gap,
      actual,
      top3: solveGap({ gap, data, exclude: present }),
    };
  }

  // ------------------------------------------------------------
  //  buildShoppingList(days, data)
  //  days: [{ blocks: [{ items }] }]  (es. i 7 giorni della settimana)
  //  Aggrega le grammature per alimento, raggruppa per categoria,
  //  e formatta in unità sensate.
  // ------------------------------------------------------------
  function buildShoppingList(days, data) {
    const { FOODS } = data;
    const totals = {}; // food -> grams
    for (const day of days || []) {
      for (const b of day.blocks || []) {
        for (const it of b.items || []) {
          const g = typeof it.grams === "number" ? it.grams : 0;
          totals[it.food] = (totals[it.food] || 0) + g;
        }
      }
    }
    const byCat = {};
    for (const [food, grams] of Object.entries(totals)) {
      const f = FOODS[food];
      if (!f || grams <= 0) continue;
      const cat = f.cat || "altro";
      (byCat[cat] = byCat[cat] || []).push({
        food, label: f.label || food, grams: Math.round(grams),
        display: formatAmount(food, grams, f),
      });
    }
    for (const cat of Object.keys(byCat)) byCat[cat].sort((a, b) => a.label.localeCompare(b.label));
    return byCat;
  }

  function plural(label, n) {
    if (n === 1) return label;
    // pluralizzazione italiana semplice
    if (label.endsWith("o")) return label.slice(0, -1) + "i";
    if (label.endsWith("a")) return label.slice(0, -1) + "e";
    if (label.endsWith("e")) return label.slice(0, -1) + "i";
    return label + "i";
  }

  function formatAmount(food, grams, f) {
    // prodotti a porzione (unit): mostra il numero di pezzi
    if (f.unit && f.unit.portion) {
      const n = Math.max(1, Math.round(grams / f.unit.portion));
      return `${n} ${plural(f.unit.label, n)}`;
    }
    // prodotti venduti a confezione (pack): mostra n confezioni + grammi totali
    if (f.pack && f.pack.size) {
      const n = Math.max(1, Math.ceil(grams / f.pack.size));
      const tot = grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${Math.round(grams)} g`;
      return `${n} ${plural(f.pack.label, n)} (${tot})`;
    }
    if (grams >= 1000) return `~${(grams / 1000).toFixed(1)} kg`;
    return `${Math.round(grams)} g`;
  }

  // ---- export ----
  const ENGINE = {
    calcMacros, addMacros, diffMacros, status,
    resolveBlockItems, fillFlexCarbs,
    generateDay, solveGap, solveSubstitution, buildShoppingList, formatAmount,
  };
  if (typeof window !== "undefined") root.MB_ENGINE = ENGINE;
  if (typeof module !== "undefined") module.exports = ENGINE;
})(typeof window !== "undefined" ? window : globalThis);

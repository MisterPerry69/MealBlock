// ============================================================
//  solver.js — motore macro (puro, deterministico, testabile)
//  Portato dalla v1 (engine.js): coordinate-descent sui range +
//  solveGap closed-form. Nessun DOM, nessun global runtime.
//
//  solveDay({dayType, selection, foods, blocks, prefs, frozen})
//   -> { dayType, target, blocks:[{slot,blockId,label,items:[{food,grams}],frozen}],
//        totals, status, suggestions }
// ============================================================
(function (root) {
  "use strict";
  const MACROS = ["kcal", "protein", "carbs", "fat"];
  const EMPTY = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const round1 = (n) => Math.round(n * 10) / 10;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const roundStep = (n, s = 5) => Math.round(n / s) * s;

  const CAT_SOFTMAX = { fat: 30, protein: 300, carb: 250, fruit: 200, extra: 400 };
  function softMax(f) {
    if (typeof f.softMax === "number") return f.softMax;
    if (f.id === "pure") return 550;
    return CAT_SOFTMAX[f.cat] || 400;
  }

  function calcMacros(items, foods) {
    const a = { ...EMPTY };
    for (const it of items || []) {
      const f = foods[it.food]; if (!f) continue;
      const g = typeof it.grams === "number" ? it.grams : 0, k = g / 100;
      a.kcal += f.kcal * k; a.protein += f.protein * k; a.carbs += f.carbs * k; a.fat += f.fat * k;
    }
    return { kcal: Math.round(a.kcal), protein: round1(a.protein), carbs: round1(a.carbs), fat: round1(a.fat) };
  }
  const addMacros = (a, b) => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat });
  const diffMacros = (t, a) => ({ kcal: t.kcal - a.kcal, protein: round1(t.protein - a.protein), carbs: round1(t.carbs - a.carbs), fat: round1(t.fat - a.fat) });

  function status(actual, target, tol) {
    const out = {}; let inTarget = true;
    for (const m of MACROS) {
      const d = actual[m] - target[m];
      let s = "ok"; if (d > tol[m]) s = "over"; else if (d < -tol[m]) s = "under";
      if (s !== "ok") inTarget = false;
      out[m] = { value: actual[m], target: target[m], diff: round1(d), state: s };
    }
    out.inTarget = inTarget; return out;
  }

  // espande un blocco negli item concreti (+ extras ON/OFF), risolvendo i vincoli
  // dall'ALIMENTO: sfuso -> variabile entro range, fisso -> grammatura fixed.
  function resolveBlockItems(block, dayType, foods) {
    let raw = block.items.map((it) => ({ ...it }));
    if (dayType === "ON" && block.onExtras) raw = raw.concat(block.onExtras.map((it) => ({ ...it })));
    if (dayType === "OFF" && block.offExtras) raw = raw.concat(block.offExtras.map((it) => ({ ...it })));
    return raw;
  }

  // ---- solveGap closed-form (Top-3 sostituzioni / riempitivi) ----
  function solveGap(opts) {
    const { gap, foods, weights } = opts;
    const W = weights || { protein: 3, kcal: 2, carbs: 1, fat: 1 };
    const candidates = opts.candidates || Object.keys(foods);
    const exclude = new Set(opts.exclude || []);
    const preferCat = opts.preferCat || null;
    const results = [];
    for (const id of candidates) {
      if (exclude.has(id)) continue;
      const f = foods[id]; if (!f) continue;
      let num = 0, den = 0;
      for (const m of MACROS) {
        const fm = m === "protein" ? f.protein : m === "carbs" ? f.carbs : m === "fat" ? f.fat : f.kcal;
        num += W[m] * fm * gap[m]; den += W[m] * fm * fm;
      }
      if (den <= 0) continue;
      let grams = Math.round(clamp(100 * (num / den), 0, softMax(f)));
      if (grams <= 0) continue;
      const result = calcMacros([{ food: id, grams }], foods);
      let score = 0;
      for (const m of MACROS) {
        const r = (m === "protein" ? result.protein : m === "carbs" ? result.carbs : m === "fat" ? result.fat : result.kcal) - gap[m];
        score += W[m] * r * r;
      }
      if (preferCat && f.cat !== preferCat) score *= 2.2;
      results.push({ food: id, label: f.label || id, cat: f.cat, grams, result, score: Math.round(score) });
    }
    results.sort((a, b) => a.score - b.score);
    return results.slice(0, 3);
  }

  // ---- coordinate descent sulle variabili sfuse ----
  function solveRanges(vars, fixedTotal, target, W) {
    const scale = { kcal: 100, protein: 20, carbs: 30, fat: 15 };
    const totalOf = () => {
      const t = { ...fixedTotal };
      for (const v of vars) { const g = v.grams; t.kcal += v.perG.kcal * g; t.protein += v.perG.protein * g; t.carbs += v.perG.carbs * g; t.fat += v.perG.fat * g; }
      return t;
    };
    const cost = (t) => { let c = 0; for (const m of MACROS) { const d = (t[m] - target[m]) / scale[m]; c += W[m] * d * d; } return c; };
    for (const v of vars) v.grams = clamp(roundStep((v.min + v.max) / 2), v.min, v.max);
    for (let pass = 0; pass < 12; pass++) {
      let improved = false;
      for (const v of vars) {
        let best = v.grams, bestC = cost(totalOf());
        for (let g = v.min; g <= v.max; g += 5) {
          if (g === v.grams) continue;
          const prev = v.grams; v.grams = g;
          const c = cost(totalOf());
          if (c < bestC - 1e-9) { bestC = c; best = g; improved = true; }
          v.grams = prev;
        }
        v.grams = best;
      }
      if (!improved) break;
    }
    for (const v of vars) v.b.items[v.idx] = { food: v.food, grams: v.grams };
  }

  function solveDay(opts) {
    const { dayType, foods, blocks, prefs } = opts;
    const selection = opts.selection || {};
    const frozen = opts.frozen || {};
    const target = prefs["targets." + dayType];
    const tol = prefs.tolerance;
    const W = prefs.solverWeights;
    const SLOTS = ["colazione", "pranzo", "merenda", "cena"];
    const out = [];

    for (const slot of SLOTS) {
      if (frozen[slot]) {
        const fz = frozen[slot];
        // pasto libero: macro dirette, nessun item da risolvere
        if (fz.custom) { out.push({ slot, blockId: null, label: fz.custom.label || slot, items: [], custom: fz.custom, frozen: true }); continue; }
        out.push({ slot, blockId: fz.blockId || null, label: fz.label || slot, items: fz.items.map((i) => ({ ...i })), frozen: true });
        continue;
      }
      const blockId = selection[slot];
      const block = blockId && blocks[blockId];
      if (!block) continue;
      out.push({ slot, blockId, label: block.label, items: resolveBlockItems(block, dayType, foods), frozen: false });
    }

    // classifica variabili sfuse / fisse
    let fixedTotal = { ...EMPTY }; const vars = [];
    for (const b of out) {
      b.items.forEach((it, idx) => {
        const f = foods[it.food] || { kcal: 0, protein: 0, carbs: 0, fat: 0, kind: "fisso", fixed: 0 };
        const hasG = typeof it.grams === "number";
        const isVar = !b.frozen && !hasG && f.kind === "sfuso" && typeof f.rangeMin === "number";
        if (isVar) {
          vars.push({ b, idx, food: it.food, min: f.rangeMin, max: f.rangeMax, perG: { kcal: f.kcal / 100, protein: f.protein / 100, carbs: f.carbs / 100, fat: f.fat / 100 } });
          b.items[idx] = { food: it.food, grams: roundStep((f.rangeMin + f.rangeMax) / 2) };
        } else {
          const g = hasG ? it.grams : (f.kind === "fisso" && typeof f.fixed === "number") ? f.fixed : (typeof f.rangeMin === "number" ? Math.round((f.rangeMin + f.rangeMax) / 2) : 0);
          b.items[idx] = { food: it.food, grams: g };
          fixedTotal = addMacros(fixedTotal, calcMacros([b.items[idx]], foods));
        }
      });
    }
    // le macro dei pasti liberi pesano come fisse: i futuri si riadattano attorno
    for (const b of out) if (b.custom) fixedTotal = addMacros(fixedTotal, b.custom.macros);
    if (opts.solve !== false && vars.length) solveRanges(vars, fixedTotal, target, W);

    let totals = { ...EMPTY };
    for (const b of out) totals = addMacros(totals, b.custom ? b.custom.macros : calcMacros(b.items, foods));
    totals = { kcal: Math.round(totals.kcal), protein: round1(totals.protein), carbs: round1(totals.carbs), fat: round1(totals.fat) };
    const st = status(totals, target, tol);
    let suggestions = null;
    if (!st.inTarget) suggestions = solveGap({ gap: diffMacros(target, totals), foods, weights: W, preferCat: opts.preferCat || null });

    return { dayType, target, blocks: out, totals, status: st, suggestions };
  }

  // lista spesa aggregata (da settimana)
  function buildShoppingList(days, foods) {
    const totals = {};
    for (const day of days || []) for (const b of day.blocks || []) for (const it of b.items || []) {
      const g = typeof it.grams === "number" ? it.grams : 0;
      totals[it.food] = (totals[it.food] || 0) + g;
    }
    const byCat = {};
    for (const [food, grams] of Object.entries(totals)) {
      const f = foods[food]; if (!f || grams <= 0) continue;
      (byCat[f.cat] = byCat[f.cat] || []).push({ food, label: f.label, grams: Math.round(grams), display: formatAmount(f, grams) });
    }
    return byCat;
  }
  function plural(l, n) { if (n === 1) return l; if (l.endsWith("o")) return l.slice(0, -1) + "i"; if (l.endsWith("a")) return l.slice(0, -1) + "e"; if (l.endsWith("e")) return l.slice(0, -1) + "i"; return l + "i"; }
  function formatAmount(f, grams) {
    if (f.unitPortion) { const n = Math.max(1, Math.round(grams / f.unitPortion)); return `${n} ${plural(f.unitLabel, n)}`; }
    if (f.packSize) { const n = Math.max(1, Math.ceil(grams / f.packSize)); const tot = grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${Math.round(grams)} g`; return `${n} ${plural(f.packLabel, n)} (${tot})`; }
    if (grams >= 1000) return `~${(grams / 1000).toFixed(1)} kg`;
    return `${Math.round(grams)} g`;
  }

  // grammatura "tipica" di un blocco: quella che il solver assegnerebbe in una
  // giornata standard. Serve alla UI per mostrare i grammi nelle card dei
  // blocchi senza spostare i vincoli dall'alimento al blocco.
  function typicalItems(block, ctx) {
    if (!block || !block.slot) return [];
    const dayType = (ctx && ctx.dayType) || "OFF";
    const blocks = { ...(ctx.blocks || {}), [block.id]: block };
    const selection = { colazione: "breakfast", pranzo: "lunch_A", merenda: "snack", cena: "dinner_A" };
    selection[block.slot] = block.id;
    const res = solveDay({ dayType, foods: ctx.foods, blocks, prefs: ctx.prefs, selection });
    const solved = res.blocks.find((b) => b.slot === block.slot && b.blockId === block.id);
    if (!solved) return [];
    return solved.items.map((it) => ({
      food: it.food,
      grams: it.grams || 0,
      label: (ctx.foods[it.food] || {}).label || it.food,
    }));
  }

  const SOLVER = { calcMacros, addMacros, diffMacros, status, solveDay, solveGap, resolveBlockItems, buildShoppingList, formatAmount, typicalItems };
  if (typeof window !== "undefined") root.MB_SOLVER = SOLVER;
  if (typeof module !== "undefined") module.exports = SOLVER;
})(typeof window !== "undefined" ? window : globalThis);

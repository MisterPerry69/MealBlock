// ============================================================
//  proposal.js — logica pura della proposta settimanale.
//  Valida l'output AI (doppia barriera col server), genera id
//  univoci, piazza il blocco accettato nella settimana prossima.
// ============================================================
(function (root) {
  "use strict";
  const SLOTS = ["colazione", "pranzo", "merenda", "cena"];
  const DEFAULT_SEL = { colazione: "breakfast", pranzo: "lunch_A", merenda: "snack", cena: "dinner_A" };

  function solver() {
    return (typeof window !== "undefined" && window.MB_SOLVER) || (typeof require !== "undefined" ? require("./solver.js") : null);
  }

  const isNum = (x) => typeof x === "number" && isFinite(x) && x >= 0;

  function validateProposal(raw, foods, blocks, prefs) {
    if (!raw || !raw.block || !Array.isArray(raw.block.items) || !raw.block.items.length) return null;
    const b = raw.block;
    if (SLOTS.indexOf(b.slot) < 0 || !b.label) return null;
    const newFoods = Array.isArray(raw.newFoods) ? raw.newFoods : [];
    if (newFoods.length > 2) return null;
    for (const f of newFoods) {
      if (!f || !f.id || !f.label) return null;
      if (!isNum(f.kcal) || !isNum(f.carbs) || !isNum(f.protein) || !isNum(f.fat)) return null;
    }
    const byId = {};
    for (const f of newFoods) byId[f.id] = f;
    for (const it of b.items) if (!it || !it.food || (!foods[it.food] && !byId[it.food])) return null;

    // fattibilità: col blocco al posto del default del suo slot, almeno un
    // dayType deve poter centrare i target (stessa barriera che il generatore
    // applica ai blocchi esistenti)
    const S = solver();
    if (!S) return null;
    const mergedFoods = { ...foods };
    for (const f of newFoods) mergedFoods[f.id] = { kind: "sfuso", ...f };
    const mergedBlocks = { ...blocks, [b.id]: { ...b, enabled: true } };
    const sel = { ...DEFAULT_SEL, [b.slot]: b.id };
    const feasible = ["ON", "OFF"].some((dt) =>
      S.solveDay({ dayType: dt, foods: mergedFoods, blocks: mergedBlocks, prefs, selection: sel }).status.inTarget);
    if (!feasible) return null;

    return { block: b, newFoods, recipe: String(raw.recipe || "") };
  }

  function uniqueBlockId(id, blocks) {
    // conflitto case-insensitive: il catalogo ha id in casi misti (dinner_A)
    const keys = new Set(Object.keys(blocks).map((k) => k.toLowerCase()));
    let base = String(id || "blocco").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "blocco";
    if (!keys.has(base)) return base;
    let n = 2;
    while (keys.has(base + "_" + n)) n++;
    return base + "_" + n;
  }

  // piazza il blocco sul PRIMO giorno in cui la giornata resta in target;
  // se nessuno regge, primo giorno comunque (aderenza > perfezione)
  function placeInWeek(week, block, ctx) {
    const S = solver();
    const days = week.days.map((d) => ({ ...d, selection: { ...d.selection } }));
    let placedAt = -1;
    for (let i = 0; i < days.length; i++) {
      const sel = { ...days[i].selection, [block.slot]: block.id };
      const r = S.solveDay({ dayType: days[i].dayType, foods: ctx.foods, blocks: ctx.blocks, prefs: ctx.prefs, selection: sel });
      if (r.status.inTarget) { placedAt = i; break; }
    }
    if (placedAt < 0) placedAt = 0;
    days[placedAt].selection[block.slot] = block.id;
    return { ...week, days };
  }

  const PROPOSAL = { validateProposal, uniqueBlockId, placeInWeek };
  if (typeof window !== "undefined") root.MB_PROPOSAL = PROPOSAL;
  if (typeof module !== "undefined") module.exports = PROPOSAL;
})(typeof window !== "undefined" ? window : globalThis);

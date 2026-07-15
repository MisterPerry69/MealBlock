// ============================================================
//  solver.test.js — test del motore (Node, zero dipendenze).
//  Esegui:  node v2/solver.test.js
//  Verifica: macro in target ON/OFF, fissi immobili, sfusi in range,
//  determinismo, congelamento (ricalcolo solo futuri).
// ============================================================
const SOLVER = require("./solver.js");

// carico i dati seed (il file espone window.MB_SEED; simulo window)
global.window = {};
require("./data.seed.js");
const { FOODS, BLOCKS, PREFS } = global.window.MB_SEED;

let pass = 0, fail = 0;
function ok(cond, msg) { cond ? (pass++, console.log("  ✓ " + msg)) : (fail++, console.log("  ✗ " + msg)); }
function group(name, fn) { console.log("\n" + name); fn(); }

const SEL = { colazione: "breakfast", pranzo: "lunch_A", merenda: "snack", cena: "dinner_A" };

function inTol(totals, target, tol) {
  return ["kcal", "protein", "carbs", "fat"].every((m) => Math.abs(totals[m] - target[m]) <= tol[m]);
}

group("Giornata ON — macro in target", () => {
  const r = SOLVER.solveDay({ dayType: "ON", foods: FOODS, blocks: BLOCKS, prefs: PREFS, selection: SEL });
  console.log("    totals:", JSON.stringify(r.totals), "target:", JSON.stringify(r.target));
  ok(inTol(r.totals, r.target, PREFS.tolerance), "tutti i macro entro tolleranza");
  ok(r.status.inTarget, "status.inTarget = true");
});

group("Giornata OFF — macro in target", () => {
  const r = SOLVER.solveDay({ dayType: "OFF", foods: FOODS, blocks: BLOCKS, prefs: PREFS, selection: SEL });
  console.log("    totals:", JSON.stringify(r.totals), "target:", JSON.stringify(r.target));
  ok(inTol(r.totals, r.target, PREFS.tolerance), "tutti i macro entro tolleranza");
});

group("Alimenti fissi immobili", () => {
  const r = SOLVER.solveDay({ dayType: "ON", foods: FOODS, blocks: BLOCKS, prefs: PREFS, selection: SEL });
  const lunch = r.blocks.find((b) => b.slot === "pranzo");
  const moz = lunch.items.find((i) => i.food === "mozzarella_light");
  ok(moz && moz.grams === FOODS.mozzarella_light.fixed, "mozzarella_light resta a " + FOODS.mozzarella_light.fixed + "g");
});

group("Alimenti sfusi entro range", () => {
  const r = SOLVER.solveDay({ dayType: "ON", foods: FOODS, blocks: BLOCKS, prefs: PREFS, selection: SEL });
  let allIn = true;
  for (const b of r.blocks) for (const it of b.items) {
    const f = FOODS[it.food];
    if (f.kind === "sfuso" && typeof f.rangeMin === "number") {
      if (it.grams < f.rangeMin || it.grams > f.rangeMax) { allIn = false; console.log("    fuori range:", it.food, it.grams, "["+f.rangeMin+","+f.rangeMax+"]"); }
    }
  }
  ok(allIn, "tutti gli sfusi entro [min,max]");
});

group("Determinismo", () => {
  const a = SOLVER.solveDay({ dayType: "ON", foods: FOODS, blocks: BLOCKS, prefs: PREFS, selection: SEL });
  const b = SOLVER.solveDay({ dayType: "ON", foods: FOODS, blocks: BLOCKS, prefs: PREFS, selection: SEL });
  ok(JSON.stringify(a.totals) === JSON.stringify(b.totals), "due run → stessi totals");
});

group("Congelamento — ricalcolo solo futuri", () => {
  const base = SOLVER.solveDay({ dayType: "ON", foods: FOODS, blocks: BLOCKS, prefs: PREFS, selection: SEL });
  const bkfast = base.blocks.find((b) => b.slot === "colazione");
  const frozen = { colazione: { blockId: "breakfast", label: "Colazione", items: bkfast.items } };
  const r = SOLVER.solveDay({ dayType: "ON", foods: FOODS, blocks: BLOCKS, prefs: PREFS, selection: SEL, frozen });
  const bk2 = r.blocks.find((b) => b.slot === "colazione");
  ok(JSON.stringify(bk2.items) === JSON.stringify(bkfast.items), "colazione congelata invariata");
  ok(bk2.frozen === true, "colazione marcata frozen");
  ok(inTol(r.totals, r.target, PREFS.tolerance), "resta in target ribilanciando i futuri");
});

console.log("\n" + (fail === 0 ? "✅ TUTTI VERDI" : "❌ " + fail + " FALLITI") + `  (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);

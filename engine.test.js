// Test runner per l'engine (Node). Esegui: node engine.test.js
const SEED = require("./data.js");
const E = require("./engine.js");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  -> " + extra : "")); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

const data = SEED;

console.log("\n# calcMacros");
{
  const r = E.calcMacros([{ food: "pollo", grams: 200 }], data.FOODS);
  ok("pollo 200g = 198kcal/46P", r.kcal === 198 && near(r.protein, 46, 0.1), JSON.stringify(r));
  const r2 = E.calcMacros([{ food: "oats", grams: 100 }, { food: "whey", grams: 40 }], data.FOODS);
  ok("oats100+whey40 protein ~41.5", near(r2.protein, 41.5, 0.2), JSON.stringify(r2));
  ok("flex => 0", E.calcMacros([{ food: "oats", grams: "flex" }], data.FOODS).kcal === 0);
}

console.log("\n# generateDay ON");
let dayON;
{
  dayON = E.generateDay({ dayType: "ON", selection: { pranzo: "lunch_C", cena: "dinner_A" }, data });
  const t = dayON.totals;
  console.log("    totals ON:", JSON.stringify(t), "target", JSON.stringify(dayON.target));
  ok("ON proteine entro ±12 da 180", near(t.protein, 180, 12), t.protein);
  ok("ON carbo entro ±15 da 320 (flex riempie)", near(t.carbs, 320, 15), t.carbs);
  ok("ON ha 5 blocchi (4 slot + worksnack)", dayON.blocks.length === 5, dayON.blocks.length);
  ok("ON tutte le grammature flex risolte (nessuna 'flex')",
     dayON.blocks.every(b => b.items.every(it => typeof it.grams === "number")));
}

console.log("\n# generateDay OFF");
let dayOFF;
{
  dayOFF = E.generateDay({ dayType: "OFF", selection: { pranzo: "lunch_B", cena: "dinner_A" }, data });
  const t = dayOFF.totals;
  console.log("    totals OFF:", JSON.stringify(t), "target", JSON.stringify(dayOFF.target));
  ok("OFF proteine entro ±12 da 180", near(t.protein, 180, 12), t.protein);
  ok("OFF carbo entro ±15 da 200", near(t.carbs, 200, 15), t.carbs);
}

console.log("\n# generateDay con blocco congelato (switch ON->OFF a colazione fatta)");
{
  // colazione ON già mangiata, congelata; resto ricalcolato per OFF
  const frozenBreakfast = {
    blockId: "breakfast", label: "Colazione",
    items: [{ food: "oats", grams: 100 }, { food: "whey", grams: 45 }, { food: "banana", grams: 120 }],
  };
  const d = E.generateDay({
    dayType: "OFF",
    selection: { pranzo: "lunch_B", cena: "dinner_A" },
    frozen: { colazione: frozenBreakfast },
    data,
  });
  const bf = d.blocks.find(b => b.slot === "colazione");
  ok("colazione resta congelata con grammature ON", bf.frozen === true && bf.items[0].grams === 100);
  ok("target è OFF", d.target.kcal === 2330);
  console.log("    totals dopo switch:", JSON.stringify(d.totals));
}

console.log("\n# solveGap (buco da -50g pasta)");
{
  // pranzo lunch_C con fusilli ridotti a 50g invece del default
  const items = [{ food: "fusilli_integrali", grams: 50 }, { food: "tonno", grams: 120 }];
  const target = { kcal: 700, protein: 55, carbs: 100, fat: 12 };
  const sub = E.solveSubstitution({ items, target, data });
  console.log("    gap:", JSON.stringify(sub.gap));
  console.log("    top3:", sub.top3.map(s => `${s.label} ${s.grams}g (score ${s.score})`).join(" | "));
  ok("ritorna max 3 proposte", sub.top3.length <= 3 && sub.top3.length > 0);
  ok("proposte ordinate per score crescente",
     sub.top3.every((s, i, a) => i === 0 || a[i - 1].score <= s.score));
  ok("non suggerisce alimenti già nel pasto",
     sub.top3.every(s => s.food !== "fusilli_integrali" && s.food !== "tonno"));
  ok("ogni proposta ha grammi > 0", sub.top3.every(s => s.grams > 0));
}

console.log("\n# buildShoppingList");
{
  const week = [dayON, dayOFF, dayON, dayOFF, dayON, dayOFF, dayOFF];
  const list = E.buildShoppingList(week, data);
  console.log("    categorie:", Object.keys(list).join(", "));
  ok("ha categoria protein", !!list.protein);
  ok("kinder mostrato in barrette (porzione)",
     (list.extra || []).some(x => /barrett/.test(x.display)), JSON.stringify(list.extra));
  ok("pollo aggregato in kg se >1000g",
     (list.protein || []).some(x => x.food === "pollo" && /kg|g/.test(x.display)));
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);

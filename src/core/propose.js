// propose.js — motore "proposte" (v3).
//
// Obiettivo: COPRIRE il deficit, non ritoccare timidamente. Ragiona per
// priorita (proteine, carbo, grassi; le kcal seguono):
//   1. AUMENTA i cibi sbloccati ricchi del macro mancante (fino a coprire, il
//      range del DB e solo un tetto morbido non una gabbia).
//   2. Se resta deficit, AGGIUNGE cibi dal repertorio (anche piu di uno) finche
//      il macro e coperto.
// Rispetta i cibi BLOCCATI (locked): non li tocca mai. Non sfora le proteine.

const MACROS = ['kcal', 'carbo', 'prot', 'fat'];
const TOL = { kcal: 60, carbo: 10, prot: 5, fat: 5 };
const PROT_CAP_PCT = 1.08;       // le proteine non oltre +8% del target
const ADD_STEP_MAX = 250;        // grammatura massima di una singola aggiunta
const MAX_ADDS_PER_MACRO = 5;    // quante aggiunte al massimo per un macro

function macros(rows, foods) {
  const t = { kcal: 0, carbo: 0, prot: 0, fat: 0 };
  for (const r of rows) {
    const f = foods[r.foodId]; if (!f) continue;
    const k = r.grammatura / 100;
    for (const m of MACROS) t[m] += (f[m] || 0) * k;
  }
  return t;
}

function dominantMacro(food) {
  const prot = food.prot || 0, carbo = food.carbo || 0, fat = food.fat || 0;
  if (prot >= carbo && prot >= fat) return 'prot';
  if (carbo >= fat) return 'carbo';
  return 'fat';
}

// tetto morbido di aumento per un cibo gia nel piano: range DB se c'e, altrimenti
// generoso (fino a 3x la grammatura di partenza, min 300g) per poter coprire.
function upperCap(food, g0) {
  if (food && food.rangeGrammatura) return food.rangeGrammatura.max;
  return Math.max(300, Math.round((g0 || 0) * 3));
}
function lowerCap(food, g0) {
  if (food && food.rangeGrammatura) return food.rangeGrammatura.min;
  return 0;
}

// "purezza": g di macro per kcal — alto = cibo denso ed efficiente per quel macro
const purity = (food, macro) => (food[macro] || 0) / (food.kcal || 1);

export function proposeAdjustments(plan, foods) {
  const rows = [];
  for (const meal of plan.meals) {
    for (const r of meal.righe) {
      rows.push({ mealId: meal.id, foodId: r.foodId, g0: r.grammatura, g: r.grammatura, locked: !!r.locked });
    }
  }
  const additions = []; // { mealId, foodId, g }
  const inPlan = new Set(rows.map((r) => r.foodId));
  const target = plan.target;
  const lastMeal = plan.meals[plan.meals.length - 1].id;

  const allRows = () => rows.map((r) => ({ foodId: r.foodId, grammatura: r.g }))
    .concat(additions.map((a) => ({ foodId: a.foodId, grammatura: a.g })));
  const cur = () => macros(allRows(), foods);

  // proteine attuali (per il cap)
  const protCap = target.prot * PROT_CAP_PCT;
  const wouldExceedProt = (extraProtPerG, addG) => cur().prot + extraProtPerG * addG > protCap;

  for (const macro of ['prot', 'carbo', 'fat']) {
    // Le proteine le puntiamo un po' SOTTO il target quando le copriamo coi cibi
    // proteici: cosi resta margine per le proteine "collaterali" dei cibi carbo/
    // grassi che aggiungeremo dopo, senza sforare il cap.
    const aim = macro === 'prot' ? target[macro] * 0.9 : target[macro];
    let deficit = aim - cur()[macro];
    if (deficit <= TOL[macro]) continue;

    // 1) aumenta i cibi sbloccati il cui macro dominante e questo
    const candidates = rows
      .filter((r) => !r.locked && foods[r.foodId] && dominantMacro(foods[r.foodId]) === macro)
      .sort((a, b) => purity(foods[b.foodId], macro) - purity(foods[a.foodId], macro));

    for (const r of candidates) {
      deficit = aim - cur()[macro];
      if (deficit <= TOL[macro]) break;
      const food = foods[r.foodId];
      const perG = (food[macro] || 0) / 100;
      if (perG <= 0) continue;
      const cap = upperCap(food, r.g0);
      let want = r.g + deficit / perG;
      // vincolo proteine (se non stiamo gestendo le proteine)
      if (macro !== 'prot') {
        const protPerG = (food.prot || 0) / 100;
        while (want > r.g && wouldExceedProt(protPerG, want - r.g)) want -= 1;
      }
      const next = Math.min(Math.max(r.g, Math.round(want)), cap);
      if (next > r.g) r.g = next;
    }

    // 2) aggiungi cibi finche copre (max N aggiunte per macro)
    let adds = 0;
    while (adds < MAX_ADDS_PER_MACRO) {
      deficit = aim - cur()[macro];
      if (deficit <= TOL[macro]) break;
      // quanto margine proteico resta? se poco, preferisci cibi POVERI di proteine
      const protRoom = protCap - cur().prot;
      const tight = macro !== 'prot' && protRoom < target.prot * 0.15;
      const score = (f) => tight
        ? (f[macro] || 0) / (1 + (f.prot || 0)) // penalizza le proteine quando il margine e stretto
        : purity(f, macro);
      const best = Object.values(foods)
        .filter((f) => !inPlan.has(f.id) && dominantMacro(f) === macro && (f[macro] || 0) > 0)
        .sort((a, b) => score(b) - score(a))[0];
      if (!best) break;
      const perG = best[macro] / 100;
      // RISPETTA il range del cibo: un'aggiunta non supera mai il suo max.
      const addCap = best.rangeGrammatura ? best.rangeGrammatura.max : ADD_STEP_MAX;
      let g = Math.min(addCap, Math.round(deficit / perG));
      if (macro !== 'prot') {
        const protPerG = (best.prot || 0) / 100;
        while (g > 0 && wouldExceedProt(protPerG, g)) g -= 5;
      }
      if (g < 5) break;
      additions.push({ mealId: lastMeal, foodId: best.id, g });
      inPlan.add(best.id);
      adds++;
      // se questo cibo non basta (era cappato al suo max), il loop continua e
      // sceglie il PROSSIMO cibo adatto -> piu cibi invece di sforarne uno.
    }
  }

  // costruisci proposte
  const proposals = [];
  for (const r of rows) {
    if (!r.locked && Math.round(r.g) !== Math.round(r.g0)) {
      proposals.push({ id: r.mealId + ':' + r.foodId, tipo: 'modifica', mealId: r.mealId, foodId: r.foodId, daG: Math.round(r.g0), aG: Math.round(r.g), macro: dominantMacro(foods[r.foodId]) });
    }
  }
  for (const a of additions) {
    proposals.push({ id: 'add:' + a.mealId + ':' + a.foodId, tipo: 'aggiunta', mealId: a.mealId, foodId: a.foodId, daG: 0, aG: Math.round(a.g), macro: dominantMacro(foods[a.foodId]) });
  }

  return { proposals, totalsIfApplied: cur() };
}

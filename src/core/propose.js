// propose.js — motore "proposte" per il ricalcolo.
//
// Ragiona per PRIORITA (proteine, poi carbo, poi grassi; le kcal seguono):
//   1. AUMENTA gli alimenti gia nel piano ricchi del macro in deficit (entro range).
//   2. Se resta deficit, PROPONE UN'AGGIUNTA dal repertorio: il cibo piu adatto
//      a quel macro (denso in quel macro, poco nel resto).
// Vincolo: non sforare le proteine oltre +5%. Restituisce PROPOSTE, non applica.

const MACROS = ['kcal', 'carbo', 'prot', 'fat'];
const DEFAULT_RANGE_PCT = 0.5;   // ±50% se il cibo non ha range nel DB
const ADD_MAX_G = 300;           // grammatura massima per un'aggiunta proposta

// tolleranza sotto la quale un macro e "a posto"
const TOL = { kcal: 40, carbo: 8, prot: 5, fat: 5 };

function macros(rows, foods) {
  const t = { kcal: 0, carbo: 0, prot: 0, fat: 0 };
  for (const r of rows) {
    const f = foods[r.foodId]; if (!f) continue;
    const k = r.grammatura / 100;
    for (const m of MACROS) t[m] += (f[m] || 0) * k;
  }
  return t;
}

function rangeFor(row, food) {
  if (food && food.rangeGrammatura) return [food.rangeGrammatura.min, food.rangeGrammatura.max];
  const g = row.grammatura || 0;
  const hi = g > 0 ? Math.round(g * (1 + DEFAULT_RANGE_PCT)) : ADD_MAX_G;
  return [Math.max(0, Math.round(g * (1 - DEFAULT_RANGE_PCT))), hi];
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function dominantMacro(food) {
  const prot = food.prot || 0, carbo = food.carbo || 0, fat = food.fat || 0;
  if (prot >= carbo && prot >= fat) return 'prot';
  if (carbo >= fat) return 'carbo';
  return 'fat';
}

// quanto un cibo e "puro" per un macro: densita del macro pesata, penalizzando
// i macro che NON servono. Serve a scegliere l'aggiunta migliore.
function purityFor(food, macro) {
  const kcal = food.kcal || 1;
  return (food[macro] || 0) / kcal; // g di macro per kcal: alto = denso ed efficiente
}

/**
 * @returns {{ proposals, totalsIfApplied }}
 *   proposals: [{ id, tipo:'modifica'|'aggiunta', mealId, foodId, daG, aG, macro }]
 */
export function proposeAdjustments(plan, foods) {
  // righe di lavoro (tutte, con riferimento a pasto e grammatura originale)
  const rows = [];
  for (const meal of plan.meals) {
    for (const r of meal.righe) rows.push({ mealId: meal.id, foodId: r.foodId, g0: r.grammatura, g: r.grammatura });
  }
  // aggiunte candidate: { mealId, foodId, g }
  const additions = [];

  const inPlan = new Set(rows.map((r) => r.foodId));
  const target = plan.target;
  const priority = ['prot', 'carbo', 'fat'];

  const currentTotals = () => macros(
    rows.map((r) => ({ foodId: r.foodId, grammatura: r.g }))
      .concat(additions.map((a) => ({ foodId: a.foodId, grammatura: a.g }))),
    foods
  );

  for (const macro of priority) {
    let cur = currentTotals();
    let deficit = target[macro] - cur[macro];
    if (deficit <= TOL[macro]) continue; // gia coperto (o in eccesso)

    // 1) AUMENTA gli alimenti gia nel piano il cui macro dominante e questo
    const candidates = rows.filter((r) => foods[r.foodId] && dominantMacro(foods[r.foodId]) === macro);
    for (const r of candidates) {
      if (deficit <= TOL[macro]) break;
      const food = foods[r.foodId];
      const perG = (food[macro] || 0) / 100;
      if (perG <= 0) continue;
      const [lo, hi] = rangeFor({ grammatura: r.g0 }, food);
      const want = r.g + deficit / perG;
      let next = clamp(want, Math.max(lo, r.g), hi); // solo aumenti
      next = capProt(next, r, rows, additions, foods, target, macro);
      if (next > r.g) {
        deficit -= (next - r.g) * perG;
        r.g = Math.round(next);
      }
    }

    // 2) Se resta deficit, PROPONI un'aggiunta: il cibo piu adatto al macro
    cur = currentTotals();
    deficit = target[macro] - cur[macro];
    if (deficit > TOL[macro]) {
      const best = Object.values(foods)
        .filter((f) => !inPlan.has(f.id) && (f[macro] || 0) > 0 && dominantMacro(f) === macro)
        .sort((a, b) => purityFor(b, macro) - purityFor(a, macro))[0];
      if (best) {
        const perG = best[macro] / 100;
        let g = Math.round(clamp(deficit / perG, 0, ADD_MAX_G));
        g = capProt(g, { foodId: best.id, g: 0 }, rows, additions, foods, target, macro, best);
        if (g >= 5) {
          const mealId = plan.meals[plan.meals.length - 1].id; // aggiunge all'ultimo pasto
          additions.push({ mealId, foodId: best.id, g: Math.round(g) });
          inPlan.add(best.id);
        }
      }
    }
  }

  // costruisci proposte
  const proposals = [];
  for (const r of rows) {
    if (Math.round(r.g) !== Math.round(r.g0)) {
      proposals.push({ id: r.mealId + ':' + r.foodId, tipo: 'modifica', mealId: r.mealId, foodId: r.foodId, daG: Math.round(r.g0), aG: Math.round(r.g), macro: dominantMacro(foods[r.foodId]) });
    }
  }
  for (const a of additions) {
    proposals.push({ id: 'add:' + a.mealId + ':' + a.foodId, tipo: 'aggiunta', mealId: a.mealId, foodId: a.foodId, daG: 0, aG: Math.round(a.g), macro: dominantMacro(foods[a.foodId]) });
  }

  const totalsIfApplied = currentTotals();
  return { proposals, totalsIfApplied };
}

// riduce una grammatura candidata se farebbe sforare le proteine oltre +5%
function capProt(next, target_row, rows, additions, foods, target, macro, addFood) {
  if (macro === 'prot') return next; // stiamo proprio sistemando le proteine
  const cap = target.prot * 1.05;
  const trial = rows.map((r) => ({ foodId: r.foodId, grammatura: r === target_row ? next : r.g }))
    .concat(additions.map((a) => ({ foodId: a.foodId, grammatura: a.g })));
  if (addFood) trial.push({ foodId: addFood.id, grammatura: next });
  const prot = macros(trial, foods).prot;
  if (prot <= cap) return next;
  const food = addFood || foods[target_row.foodId];
  const protPerG = (food.prot || 0) / 100;
  if (protPerG <= 0) return next;
  return Math.max(0, next - (prot - cap) / protPerG);
}

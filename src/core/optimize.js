// optimize.js — ottimizzatore multi-macro (v4).
//
// A differenza del vecchio motore (che ragionava per "macro dominante" e copriva
// solo i deficit), questo considera la COMPOSIZIONE COMPLETA di ogni alimento e
// avvicina TUTTI i macro insieme, gestendo sia deficit sia ECCESSI (riduce i
// cibi se sfori). Ottimizzazione a coordinate su errore pesato.
//
// Poi, se resta scarto positivo (deficit), PROPONE aggiunte dal repertorio
// scegliendo il cibo che riduce di piu l'errore totale, sempre entro range.

const MACROS = ['kcal', 'carbo', 'prot', 'fat'];

// pesi dell'errore: kcal normalizzata (scala grande), proteine prioritarie
const W = { kcal: 1 / 100, carbo: 1, prot: 2, fat: 1 };

function macrosOf(rows, foods) {
  const t = { kcal: 0, carbo: 0, prot: 0, fat: 0 };
  for (const r of rows) {
    const f = foods[r.foodId]; if (!f) continue;
    const k = r.grammatura / 100;
    for (const m of MACROS) t[m] += (f[m] || 0) * k;
  }
  return t;
}

function weightedError(tot, target) {
  let e = 0;
  for (const m of MACROS) { const d = tot[m] - target[m]; e += W[m] * d * d; }
  return e;
}

function rangeOf(food, g0) {
  if (food && food.rangeGrammatura) return [food.rangeGrammatura.min, food.rangeGrammatura.max];
  return [0, Math.max(300, Math.round((g0 || 0) * 3))];
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * Ottimizza le grammature dei cibi sbloccati per avvicinare tutti i macro al
 * target, poi propone aggiunte per lo scarto residuo.
 * @returns {{ meals, changes, additions, totalsIfApplied, residual }}
 */
export function optimizePlan(plan, foods) {
  const meals = plan.meals.map((m) => ({ ...m, righe: m.righe.map((r) => ({ ...r })) }));
  const target = plan.target;

  // indice piatto dei cibi sbloccati (quelli ottimizzabili)
  const open = [];
  for (const meal of meals) for (const r of meal.righe) {
    if (!r.locked) open.push({ meal, r, g0: r.grammatura, food: foods[r.foodId] });
  }

  const allRows = (extra = []) => {
    const rows = [];
    for (const meal of meals) for (const r of meal.righe) rows.push({ foodId: r.foodId, grammatura: r.grammatura });
    return rows.concat(extra);
  };

  // --- ottimizzazione a coordinate ---
  for (let iter = 0; iter < 60; iter++) {
    let improved = false;
    for (const item of open) {
      if (!item.food) continue;
      const [lo, hi] = rangeOf(item.food, item.g0);
      // errore in funzione della grammatura di questo cibo = parabola: minimo in forma chiusa
      // tot(g) = others + food*g/100 ; err = sum W*(others_m + c_m*g - t_m)^2, c_m = food_m/100
      const others = { kcal: 0, carbo: 0, prot: 0, fat: 0 };
      for (const meal of meals) for (const r of meal.righe) {
        if (r === item.r) continue;
        const f = foods[r.foodId]; if (!f) continue;
        const k = r.grammatura / 100;
        for (const m of MACROS) others[m] += (f[m] || 0) * k;
      }
      let num = 0, den = 0;
      for (const m of MACROS) {
        const c = (item.food[m] || 0) / 100;
        num += W[m] * c * (target[m] - others[m]);
        den += W[m] * c * c;
      }
      const best = den === 0 ? item.r.grammatura : clamp(num / den, lo, hi);
      if (Math.abs(best - item.r.grammatura) > 0.5) { item.r.grammatura = best; improved = true; }
    }
    if (!improved) break;
  }
  for (const item of open) item.r.grammatura = Math.round(item.r.grammatura);

  // --- aggiunte per lo scarto residuo (solo deficit) ---
  const additions = [];
  const inPlan = new Set();
  for (const meal of meals) for (const r of meal.righe) inPlan.add(r.foodId);
  const lastMeal = meals[meals.length - 1].id;

  for (let step = 0; step < 5; step++) {
    const tot = macrosOf(allRows(additions), foods);
    const curErr = weightedError(tot, target);
    // se siamo gia vicini, stop
    const deficit = MACROS.some((m) => target[m] - tot[m] > (m === 'kcal' ? 60 : 8));
    if (!deficit) break;

    // scegli il cibo (non gia nel piano) che, aggiunto alla sua grammatura ottima,
    // riduce di piu l'errore totale
    let bestPick = null;
    for (const f of Object.values(foods)) {
      if (inPlan.has(f.id)) continue;
      const [lo, hi] = rangeOf(f, 0);
      // grammatura ottima di f dato lo stato attuale
      let num = 0, den = 0;
      for (const m of MACROS) { const c = (f[m] || 0) / 100; num += W[m] * c * (target[m] - tot[m]); den += W[m] * c * c; }
      if (den === 0) continue;
      const g = clamp(Math.round(num / den), lo, hi);
      if (g < 5) continue;
      const newErr = weightedError(macrosOf(allRows(additions.concat([{ foodId: f.id, grammatura: g }])), foods), target);
      if (newErr < curErr && (!bestPick || newErr < bestPick.newErr)) bestPick = { foodId: f.id, g, newErr };
    }
    if (!bestPick) break;
    additions.push({ foodId: bestPick.foodId, grammatura: bestPick.g, mealId: lastMeal });
    inPlan.add(bestPick.foodId);
  }

  // --- diff delle modifiche ---
  const changes = [];
  for (const item of open) {
    if (Math.round(item.r.grammatura) !== Math.round(item.g0)) {
      changes.push({ mealId: item.meal.id, foodId: item.r.foodId, daG: Math.round(item.g0), aG: Math.round(item.r.grammatura) });
    }
  }

  const totalsIfApplied = macrosOf(allRows(additions), foods);
  const residual = {};
  for (const m of MACROS) residual[m] = target[m] - totalsIfApplied[m];

  return { meals, changes, additions, totalsIfApplied, residual };
}

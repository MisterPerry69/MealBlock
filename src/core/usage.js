// usage.js — statistiche d'uso dei cibi, imparate dallo storico dei log.
// Servono a: suggerire i cibi giusti per pasto e precompilare la grammatura.
// Modulo puro.

/**
 * Costruisce le statistiche d'uso da una lista di log.
 * @returns {{ [foodId]: { perMeal: { [mealId]: { count, grams:number[], last:number } }, total } }}
 */
export function computeUsage(logs) {
  const u = {};
  // ordina i log dal piu vecchio al piu recente, cosi "last" e davvero l'ultimo
  const ordered = [...logs].sort((a, b) => (a.data < b.data ? -1 : 1));
  for (const log of ordered) {
    for (const meal of log.meals || []) {
      for (const r of meal.righe || []) {
        if (!r.foodId || !r.grammatura) continue;
        const f = (u[r.foodId] = u[r.foodId] || { perMeal: {}, total: 0 });
        const pm = (f.perMeal[meal.id] = f.perMeal[meal.id] || { count: 0, grams: [], last: null });
        pm.count++; pm.grams.push(r.grammatura); pm.last = r.grammatura;
        f.total++;
      }
    }
  }
  return u;
}

/** Grammatura suggerita per un cibo in un pasto: l'ultima usata li, o l'ultima
 *  usata in qualsiasi pasto, o null se mai visto. */
export function suggestGrams(usage, foodId, mealId) {
  const f = usage[foodId];
  if (!f) return null;
  if (mealId && f.perMeal[mealId] && f.perMeal[mealId].last != null) return f.perMeal[mealId].last;
  // fallback: l'ultima grammatura vista in qualunque pasto
  let best = null;
  for (const m of Object.values(f.perMeal)) if (m.last != null) best = m.last;
  return best;
}

/** Ordina i cibi mettendo davanti quelli piu usati nel pasto indicato, poi i
 *  piu usati in assoluto, poi il resto in ordine alfabetico. */
export function rankFoodsForMeal(foods, usage, mealId) {
  const score = (f) => {
    const u = usage[f.id];
    if (!u) return { meal: 0, total: 0 };
    return { meal: (u.perMeal[mealId] && u.perMeal[mealId].count) || 0, total: u.total || 0 };
  };
  return [...foods].sort((a, b) => {
    const sa = score(a), sb = score(b);
    if (sb.meal !== sa.meal) return sb.meal - sa.meal;   // piu usato in questo pasto
    if (sb.total !== sa.total) return sb.total - sa.total; // poi piu usato in generale
    return (a.nome || a.id).localeCompare(b.nome || b.id);
  });
}

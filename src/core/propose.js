// propose.js — motore "proposte" per il ricalcolo AUTO.
//
// Non risolve un'equazione cieca (che gonfiava un alimento per inseguire macro
// che non ha). Ragiona per PRIORITA: prima le proteine, poi le kcal via
// carbo/grassi. Ogni alimento AUTO viene scalato verso il macro che copre
// meglio, entro il suo range (dal DB, o default stretto). Restituisce PROPOSTE
// spuntabili, senza applicarle.

const MACROS = ['kcal', 'carbo', 'prot', 'fat'];
const DEFAULT_RANGE_PCT = 0.3; // ±30% se il cibo non ha un range nel DB

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
  return [Math.max(0, Math.round(g * (1 - DEFAULT_RANGE_PCT))), Math.round(g * (1 + DEFAULT_RANGE_PCT)) || 100];
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// qual e il macro "dominante" di un cibo (quello che copre meglio)?
function dominantMacro(food) {
  const prot = food.prot || 0, carbo = food.carbo || 0, fat = food.fat || 0;
  // pesiamo per densita: proteine e carbo ~4 kcal/g, grassi ~9
  if (prot >= carbo && prot >= fat) return 'prot';
  if (carbo >= fat) return 'carbo';
  return 'fat';
}

/**
 * Genera proposte di aggiustamento per le righe AUTO di un piano.
 * @returns {{ proposals, totalsIfApplied }}
 *   proposals: [{ id, tipo:'modifica', mealId, foodId, nome, daG, aG, macro }]
 *   totalsIfApplied: macro totali se si applicassero TUTTE le proposte
 */
export function proposeAdjustments(plan, foods) {
  // righe piatte con riferimento
  const auto = [];
  const fixedRows = [];
  for (const meal of plan.meals) {
    for (const r of meal.righe) {
      if (r.auto) auto.push({ meal, r });
      else fixedRows.push(r);
    }
  }

  // grammature di lavoro (partono da quelle correnti)
  const work = auto.map(({ r }) => r.grammatura);

  // funzione: totale macro dato lo stato di lavoro
  const totals = () => {
    const rows = fixedRows.concat(auto.map(({ r }, i) => ({ foodId: r.foodId, grammatura: work[i] })));
    return macros(rows, foods);
  };

  // ordine di priorita dei macro da sistemare
  const priority = ['prot', 'kcal', 'carbo', 'fat'];

  // per ogni macro in ordine, aggiusta gli alimenti AUTO il cui macro dominante
  // e quello, per avvicinarsi al target di QUEL macro. Le proteine hanno la
  // precedenza e NON vengono sforate dagli aggiustamenti successivi.
  for (const target of priority) {
    // alimenti auto che "servono" per questo macro
    const idxs = auto
      .map(({ r }, i) => ({ i, food: foods[r.foodId] }))
      .filter(({ food }) => food && dominantMacro(food) === (target === 'kcal' ? 'carbo' : target));
    if (idxs.length === 0) continue;

    const cur = totals();
    let deficit = plan.target[target] - cur[target]; // >0 manca, <0 eccede
    if (Math.abs(deficit) < (target === 'kcal' ? 20 : 3)) continue;

    // distribuisci il deficit tra gli alimenti candidati (in parti uguali)
    for (const { i } of idxs) {
      const food = foods[auto[i].r.foodId];
      const perGramMacro = (food[target] || 0) / 100; // quanto di 'target' per grammo
      if (perGramMacro <= 0) continue;
      const [lo, hi] = rangeFor(auto[i].r, food);
      const delta = (deficit / idxs.length) / perGramMacro; // grammi da aggiungere
      let next = clamp(work[i] + delta, lo, hi);

      // vincolo proteine: non far sforare le proteine oltre +5%
      if (target !== 'prot') {
        const protCap = plan.target.prot * 1.05;
        const rows = fixedRows.concat(auto.map(({ r }, k) => ({ foodId: r.foodId, grammatura: k === i ? next : work[k] })));
        if (macros(rows, foods).prot > protCap) {
          // riduci next finche le proteine rientrano
          const protPerG = (food.prot || 0) / 100;
          if (protPerG > 0) {
            const over = macros(rows, foods).prot - protCap;
            next = clamp(next - over / protPerG, lo, hi);
          }
        }
      }
      work[i] = Math.round(next);
    }
  }

  // costruisci le proposte (solo dove la grammatura cambia davvero)
  const proposals = [];
  auto.forEach(({ meal, r }, i) => {
    if (Math.round(work[i]) !== Math.round(r.grammatura)) {
      proposals.push({
        id: meal.id + ':' + r.foodId,
        tipo: 'modifica',
        mealId: meal.id,
        foodId: r.foodId,
        daG: Math.round(r.grammatura),
        aG: Math.round(work[i]),
        macro: dominantMacro(foods[r.foodId]),
      });
    }
  });

  // totali se si applicassero tutte le proposte
  const totalsIfApplied = totals();

  return { proposals, totalsIfApplied };
}

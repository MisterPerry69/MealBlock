// optimize.js — motore "a mosse mirate" (v5).
//
// Filosofia: minimo intervento. Se sei gia in fascia, non tocca niente. Se un
// macro e fuori, colpisce il CIBO PIU RESPONSABILE di quello scarto (non sparge
// micro-modifiche su tutti). Poche mosse, grosse abbastanza da contare.
//
// Esempio reale: proteine +18 causate dalla bevanda proteica -> propone di
// ridurre LA BEVANDA, non di limare 12 cibi di 1-2g.

const MACROS = ['kcal', 'carbo', 'prot', 'fat'];
// Ottimizziamo solo C/P/F: le kcal sono la CONSEGUENZA, non un macro da
// inseguire (inseguirle portava ad aumentare cibi calorici a caso). Le kcal
// fanno solo da TETTO (non sforare troppo).
const NUTRI = ['prot', 'carbo', 'fat'];
const BAND = { carbo: 8, prot: 5, fat: 5 };
const KCAL_BAND = 120;    // tolleranza sulle kcal totali (tetto)
// peso di priorita: le proteine contano di piu
const PRIORITY = { prot: 3, fat: 1.2, carbo: 1 };
const MIN_MOVE = 3;
const MAX_MOVES = 5;

function macrosOf(rows, foods) {
  const t = { kcal: 0, carbo: 0, prot: 0, fat: 0 };
  for (const r of rows) {
    const f = foods[r.foodId]; if (!f) continue;
    const k = r.grammatura / 100;
    for (const m of MACROS) t[m] += (f[m] || 0) * k;
  }
  return t;
}

function rangeOf(food, g0) {
  if (food && food.rangeGrammatura) return [food.rangeGrammatura.min, food.rangeGrammatura.max];
  return [0, Math.max(300, Math.round((g0 || 0) * 3))];
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// il macro NUTRITIVO (C/P/F) piu fuori fascia, pesato per priorita (proteine
// prima). Le kcal NON entrano qui.
function worstMacro(tot, target) {
  let worst = null, worstScore = 0;
  for (const m of NUTRI) {
    const d = tot[m] - target[m];              // >0 eccesso, <0 deficit
    const over = Math.abs(d) - BAND[m];        // quanto sfora la fascia
    if (over <= 0) continue;
    const score = over * (PRIORITY[m] || 1);
    if (score > worstScore) { worstScore = score; worst = { macro: m, diff: d }; }
  }
  return worst;
}

/**
 * @param {object} opts { usage } statistiche d'uso: le aggiunte pescano SOLO dai
 *        cibi noti per il pasto in deficit (niente scelte a caso tipo bevanda a
 *        cena). Se usage manca, nessuna aggiunta automatica.
 * @returns {{ meals, changes, additions, totalsIfApplied, residual, inBand }}
 */
export function optimizePlan(plan, foods, opts = {}) {
  const usage = opts.usage || null;
  const meals = plan.meals.map((m) => ({ ...m, righe: m.righe.map((r) => ({ ...r })) }));
  const target = plan.target;

  // cibi "noti" per un pasto (dallo storico d'uso), ordinati per frequenza
  const knownForMeal = (mealId) => {
    if (!usage) return [];
    return Object.keys(usage)
      .filter((fid) => usage[fid].perMeal && usage[fid].perMeal[mealId] && usage[fid].perMeal[mealId].count > 0)
      .sort((a, b) => usage[b].perMeal[mealId].count - usage[a].perMeal[mealId].count);
  };
  const g0map = new Map(); // grammature iniziali per il diff
  for (const meal of meals) for (const r of meal.righe) g0map.set(r, r.grammatura);

  const openRows = () => {
    const out = [];
    for (const meal of meals) for (const r of meal.righe) if (!r.locked) out.push({ meal, r });
    return out;
  };
  const rowsFlat = (extra = []) => {
    const out = [];
    for (const meal of meals) for (const r of meal.righe) out.push({ foodId: r.foodId, grammatura: r.grammatura });
    return out.concat(extra);
  };

  const additions = [];
  const inPlan = new Set();
  for (const meal of meals) for (const r of meal.righe) inPlan.add(r.foodId);
  const lastMeal = meals[meals.length - 1].id;

  let moves = 0;
  while (moves < MAX_MOVES) {
    const tot = macrosOf(rowsFlat(additions), foods);
    const w = worstMacro(tot, target);
    if (!w) break; // tutto in fascia
    const { macro, diff } = w; // diff>0 eccesso -> ridurre; diff<0 deficit -> aumentare

    // candidati sbloccati che contengono questo macro
    const cands = openRows()
      .map(({ meal, r }) => ({ meal, r, food: foods[r.foodId] }))
      .filter(({ food }) => food && (food[macro] || 0) > 0);

    // il PIU RESPONSABILE: max contributo assoluto a questo macro (g_macro nel piatto)
    // per un eccesso vogliamo ridurre chi contribuisce di piu; per un deficit
    // aumentare chi e piu "efficiente" (denso nel macro).
    let acted = false;
    if (diff > 0) {
      // ECCESSO: riduci prima i cibi ACCESSORI (bevande/integratori), poi tra
      // questi il maggior contributore. I cibi principali si toccano solo se
      // non bastano gli accessori.
      cands.sort((a, b) => {
        if (!!b.food.accessorio !== !!a.food.accessorio) return (b.food.accessorio ? 1 : 0) - (a.food.accessorio ? 1 : 0);
        return (b.food[macro] * b.r.grammatura) - (a.food[macro] * a.r.grammatura);
      });
      for (const c of cands) {
        const perG = c.food[macro] / 100;
        const [lo, hi] = rangeOf(c.food, g0map.get(c.r));
        const want = c.r.grammatura - diff / perG;      // quanto togliere per azzerare lo scarto
        const next = clamp(Math.round(want), lo, c.r.grammatura); // solo riduzioni
        if (c.r.grammatura - next >= MIN_MOVE) { c.r.grammatura = next; acted = true; break; }
      }
    } else {
      // DEFICIT: aumenta il cibo piu EFFICIENTE per questo macro (max macro/kcal),
      // cosi copri il deficit portando meno kcal possibile. E non far sforare le
      // kcal totali oltre il tetto (target + KCAL_BAND).
      const kcalRoom = (target.kcal + KCAL_BAND) - tot.kcal; // kcal ancora disponibili
      cands.sort((a, b) => (b.food[macro] / b.food.kcal) - (a.food[macro] / a.food.kcal));
      for (const c of cands) {
        const perG = c.food[macro] / 100;
        const kcalPerG = (c.food.kcal || 0) / 100;
        const [lo, hi] = rangeOf(c.food, g0map.get(c.r));
        let want = c.r.grammatura + (-diff) / perG;
        // limita l'aumento a quanto le kcal residue permettono
        if (kcalPerG > 0 && kcalRoom > 0) {
          const maxAddByKcal = kcalRoom / kcalPerG;
          want = Math.min(want, c.r.grammatura + maxAddByKcal);
        }
        const next = clamp(Math.round(want), c.r.grammatura, hi); // solo aumenti
        if (next - c.r.grammatura >= MIN_MOVE) { c.r.grammatura = next; acted = true; break; }
      }
      // se nessun cibo presente puo coprire il deficit, proponi un'AGGIUNTA
      // pescando SOLO dai cibi noti per l'ultimo pasto (dallo storico d'uso):
      // niente scelte a caso. Rispetta sempre il range max reale del cibo.
      if (!acted) {
        const noti = knownForMeal(lastMeal);
        const best = noti
          .map((fid) => foods[fid])
          .filter((f) => f && !inPlan.has(f.id) && (f[macro] || 0) > 0)
          .sort((a, b) => (b[macro] / b.kcal) - (a[macro] / a.kcal))[0];
        if (best) {
          const perG = best[macro] / 100;
          const kcalPerG = (best.kcal || 0) / 100;
          const hi = best.rangeGrammatura ? best.rangeGrammatura.max : 100;
          const lo = best.rangeGrammatura ? best.rangeGrammatura.min : 0;
          let want = (-diff) / perG;
          // non sforare le kcal totali oltre il tetto
          const kcalRoom = (target.kcal + KCAL_BAND) - tot.kcal;
          if (kcalPerG > 0 && kcalRoom > 0) want = Math.min(want, kcalRoom / kcalPerG);
          const g = clamp(Math.round(want), Math.max(lo, 5), hi);
          if (g >= 5) { additions.push({ mealId: lastMeal, foodId: best.id, grammatura: g }); inPlan.add(best.id); acted = true; }
        }
      }
    }
    if (!acted) break; // non riesco a migliorare questo macro senza sforare i range
    moves++;
  }

  // diff
  const changes = [];
  for (const meal of meals) for (const r of meal.righe) {
    const g0 = g0map.get(r);
    if (Math.round(r.grammatura) !== Math.round(g0)) {
      changes.push({ mealId: meal.id, foodId: r.foodId, daG: Math.round(g0), aG: Math.round(r.grammatura) });
    }
  }

  const totalsIfApplied = macrosOf(rowsFlat(additions), foods);
  const residual = {};
  for (const m of MACROS) residual[m] = target[m] - totalsIfApplied[m];
  const inBand = !worstMacro(totalsIfApplied, target);

  return { meals, changes, additions, totalsIfApplied, residual, inBand };
}

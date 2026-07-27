// solver.js — motore "riempi il resto" per MealPrep.
// Modulo puro: nessuna dipendenza dal DOM o dallo storage.

const MACROS = ['kcal', 'carbo', 'prot', 'fat'];

// Peso di ciascun macro nella funzione di errore. Le kcal sono su una scala
// molto piu grande dei grammi, quindi normalizziamo per rendere i macro
// confrontabili (l'errore su 1 kcal non deve pesare quanto 1g di proteina).
const ERROR_WEIGHTS = { kcal: 1 / 100, carbo: 1, prot: 1, fat: 1 };

/**
 * Somma i macro di un insieme di righe, scalando i valori per 100g del cibo
 * in base alla grammatura.
 * @param {{foodId: string, grammatura: number}[]} rows
 * @param {Record<string, {kcal,carbo,prot,fat}>} foods - valori per 100g
 * @returns {{kcal,carbo,prot,fat}}
 */
export function macrosOfRows(rows, foods) {
  const total = { kcal: 0, carbo: 0, prot: 0, fat: 0 };
  for (const row of rows) {
    const food = foods[row.foodId];
    const factor = row.grammatura / 100;
    for (const m of MACROS) {
      total[m] += food[m] * factor;
    }
  }
  return total;
}

/**
 * Quanto resta da coprire con le righe aperte: target meno i macro bloccati.
 * @param {{kcal,carbo,prot,fat}} target
 * @param {{foodId,grammatura}[]} lockedRows
 * @param {Record<string,object>} foods
 * @returns {{kcal,carbo,prot,fat}}
 */
export function remainingTarget(target, lockedRows, foods) {
  const locked = macrosOfRows(lockedRows, foods);
  const rest = {};
  for (const m of MACROS) {
    rest[m] = target[m] - locked[m];
  }
  return rest;
}

// Range [min, max] di grammatura per una riga: usa il range esplicito del cibo
// se presente, altrimenti +/-defaultRangePct intorno alla grammatura di partenza.
function rangeFor(row, food, defaultRangePct) {
  if (food && food.rangeGrammatura) {
    return [food.rangeGrammatura.min, food.rangeGrammatura.max];
  }
  const g = row.grammatura;
  return [g * (1 - defaultRangePct), g * (1 + defaultRangePct)];
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Ridistribuisce le grammature delle righe aperte per avvicinarsi al "rest"
 * (macro ancora da coprire), rispettando i range per riga.
 *
 * Usa ottimizzazione a coordinate: per ogni riga, tenendo fisse le altre,
 * sceglie la grammatura (entro range) che minimizza l'errore pesato sui macro.
 * Itera fino a convergenza.
 *
 * @returns {{rows: {foodId,grammatura}[]}}
 */
export function redistribute({ rest, openRows, foods, defaultRangePct = 0.4 }) {
  const rows = openRows.map((r) => ({ ...r }));
  const ranges = rows.map((r) => rangeFor(r, foods[r.foodId], defaultRangePct));

  const MAX_ITER = 50;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let changed = false;

    for (let i = 0; i < rows.length; i++) {
      const food = foods[rows[i].foodId];
      const [lo, hi] = ranges[i];

      // Contributo delle altre righe (tutte tranne la i-esima).
      const others = { kcal: 0, carbo: 0, prot: 0, fat: 0 };
      for (let j = 0; j < rows.length; j++) {
        if (j === i) continue;
        const f = foods[rows[j].foodId];
        const factor = rows[j].grammatura / 100;
        for (const m of MACROS) others[m] += f[m] * factor;
      }

      // Grammatura ottimale per la riga i: minimizza somma pesata di
      // (others[m] + food[m]*g/100 - rest[m])^2. Soluzione ai minimi quadrati.
      let num = 0;
      let den = 0;
      for (const m of MACROS) {
        const coef = food[m] / 100; // d(macro)/d(grammatura)
        const residual = rest[m] - others[m];
        const w = ERROR_WEIGHTS[m];
        num += w * coef * residual;
        den += w * coef * coef;
      }

      const best = den === 0 ? rows[i].grammatura : clamp(num / den, lo, hi);
      if (Math.abs(best - rows[i].grammatura) > 1e-6) {
        rows[i].grammatura = best;
        changed = true;
      }
    }

    if (!changed) break;
  }

  // Arrotonda a grammi interi: leggibile e coerente con l'uso reale.
  for (const r of rows) r.grammatura = Math.round(r.grammatura);

  // Scarto residuo onesto: quanto resta scoperto dopo la ridistribuzione.
  // residual[m] > 0 = manca ancora; < 0 = si e ecceduto.
  const covered = macrosOfRows(rows, foods);
  const residual = {};
  for (const m of MACROS) residual[m] = rest[m] - covered[m];

  return { rows, residual };
}

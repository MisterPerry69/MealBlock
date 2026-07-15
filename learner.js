// ============================================================
//  learner.js — memoria preferenze (locale-first).
//  Osserva le scelte (pasti spuntati, cibi aggiunti, blocchi tenuti)
//  e mantiene punteggi che fanno da BIAS per generatore e solver.
//  Nessuna magia: incrementi semplici con decadimento, così i gusti
//  recenti pesano di più. I punteggi vivono in prefs.learner.*
// ============================================================
(function () {
  "use strict";

  const KEYS = { block: "learner.blockScores", food: "learner.foodScores" };

  function getScores(prefs, which) { return (prefs && prefs[KEYS[which]]) || {}; }

  // rinforzo: +w al punteggio, con leggero decadimento globale (i gusti evolvono)
  function reinforce(scores, id, w) {
    const next = {};
    for (const k of Object.keys(scores)) next[k] = scores[k] * 0.98; // decay
    next[id] = (next[id] || 0) + w;
    return next;
  }

  // eventi -> aggiornamento prefs.learner.* (ritorna il patch da salvare)
  function observe(prefs, event) {
    const patch = {};
    if (event.type === "checkMeal" && event.blockId) {
      patch[KEYS.block] = reinforce(getScores(prefs, "block"), event.blockId, 1.0);
    } else if (event.type === "addFood" && event.food) {
      patch[KEYS.food] = reinforce(getScores(prefs, "food"), event.food, 1.5); // scelta esplicita: pesa di più
    } else if (event.type === "keepBlock" && event.blockId) {
      patch[KEYS.block] = reinforce(getScores(prefs, "block"), event.blockId, 0.3); // tenuto in settimana
    }
    return patch;
  }

  // bias per il generatore: espone i punteggi blocco (il generatore li usa
  // come bonus morbido, entro i vincoli di varietà e limiti).
  function blockBias(prefs) {
    return { score: getScores(prefs, "block") };
  }

  // categoria preferita (per il solveGap del solver, come tie-break morbido)
  function favoriteCat(prefs, foods) {
    const s = getScores(prefs, "food");
    const catScore = {};
    for (const id of Object.keys(s)) { const f = foods[id]; if (f) catScore[f.cat] = (catScore[f.cat] || 0) + s[id]; }
    let best = null, bestV = 0;
    for (const c of Object.keys(catScore)) if (catScore[c] > bestV) { bestV = catScore[c]; best = c; }
    return best;
  }

  const LEARNER = { observe, blockBias, favoriteCat, getScores, KEYS };
  if (typeof window !== "undefined") window.MB_LEARNER = LEARNER;
  if (typeof module !== "undefined") module.exports = LEARNER;
})();

// ============================================================
//  adjust.js — diff dei riadattamenti del solver (puro, testabile).
//  Confronta la giornata prima/dopo un ricalcolo e dice cosa è
//  cambiato negli slot NON frozen (i frozen sono scelte utente).
// ============================================================
(function (root) {
  "use strict";

  function diffAdjustments(prevBlocks, nextBlocks) {
    if (!prevBlocks || !nextBlocks) return [];
    const out = [];
    for (const nb of nextBlocks) {
      if (nb.frozen) continue;
      const pb = prevBlocks.find((b) => b.slot === nb.slot);
      if (!pb) continue;
      if (pb.blockId !== nb.blockId) {
        out.push({ slot: nb.slot, replaced: { from: pb.label || pb.blockId, to: nb.label || nb.blockId }, changes: [] });
        continue;
      }
      const changes = [];
      const prevG = {};
      for (const it of pb.items || []) prevG[it.food] = typeof it.grams === "number" ? it.grams : 0;
      const seen = new Set();
      for (const it of nb.items || []) {
        seen.add(it.food);
        const to = typeof it.grams === "number" ? it.grams : 0;
        if (!(it.food in prevG)) changes.push({ food: it.food, from: null, to });
        else if (prevG[it.food] !== to) changes.push({ food: it.food, from: prevG[it.food], to });
      }
      for (const it of pb.items || []) if (!seen.has(it.food)) changes.push({ food: it.food, from: prevG[it.food], to: null });
      if (changes.length) out.push({ slot: nb.slot, replaced: null, changes });
    }
    return out;
  }

  // genere corretto per "sostituito/a" per fascia
  const REPL_WORD = { colazione: "sostituita", pranzo: "sostituito", merenda: "sostituita", cena: "sostituita" };

  function formatAdjustments(adjs, foods, slotNames) {
    const NAME = slotNames || {};
    return (adjs || []).map((a) => {
      const slotLabel = NAME[a.slot] || a.slot;
      if (a.replaced) return slotLabel + " " + (REPL_WORD[a.slot] || "sostituito") + ": " + a.replaced.from + " → " + a.replaced.to;
      const parts = a.changes.map((c) => {
        const label = ((foods || {})[c.food] || {}).label || c.food;
        if (c.from === null) return label + " +" + c.to + "g";
        if (c.to === null) return label + " −" + c.from + "g";
        return label + " " + c.from + "→" + c.to + "g";
      });
      return slotLabel + ": " + parts.join(", ");
    });
  }

  const ADJUST = { diffAdjustments, formatAdjustments };
  if (typeof window !== "undefined") root.MB_ADJUST = ADJUST;
  if (typeof module !== "undefined") module.exports = ADJUST;
})(typeof window !== "undefined" ? window : globalThis);

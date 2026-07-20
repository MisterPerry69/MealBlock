// ============================================================
//  main.js — boot + azioni + render unico sottoscritto allo store.
//  Le AZIONI sono l'unico punto di mutazione. Il solver è chiamato
//  dalle azioni, mai dal render (render idempotente, senza side-effect).
// ============================================================
(function () {
  "use strict";
  const store = window.MB_STORE;
  const withStatus = window.MB_withStatus;
  const api = window.MB_API;
  const SOLVER = window.MB_SOLVER;
  const VIEWS = window.MB_VIEWS;

  const root = document.getElementById("app");

  // selezione default deterministica (finché non c'è la Settimana/AI)
  function defaultSelection(dayType) {
    return { colazione: "breakfast", pranzo: "lunch_A", merenda: "snack", cena: "dinner_A" };
  }

  // costruisce/ricostruisce la giornata dal solver, preservando i pasti "fatti"
  function composeToday(state, opts) {
    const { foods, blocks, prefs } = state;
    const prev = state.today;
    // giorno corrente nella settimana (se c'è): sorgente di dayType + selezione
    const todayIso = window.MB_WEEK.iso(new Date());
    const wday = state.week && (state.week.days || []).find((d) => d.date === todayIso);
    const dayType = (opts && opts.dayType) || (prev && prev.dayType) || (wday && wday.dayType) || defaultDayType(prefs);
    const selection = (opts && opts.selection) || (prev && prev.selection) || (wday && wday.selection) || defaultSelection(dayType);

    // pasti spuntati O modificati a mano -> frozen (il solver non li tocca, ridistribuisce sui futuri)
    const frozen = {};
    if (prev) for (const b of prev.blocks) if (b.state === "done" || b.edited || b.custom) frozen[b.slot] = { blockId: b.blockId, label: b.label, items: b.items, custom: b.custom, edited: b.edited, wasDone: b.state === "done" };

    const res = SOLVER.solveDay({ dayType, foods, blocks, prefs, selection, frozen });

    // ordina i pasti cronologicamente
    const ORDER = { colazione: 0, pranzo: 1, merenda: 2, cena: 3 };
    res.blocks.sort((a, b) => (ORDER[a.slot] ?? 9) - (ORDER[b.slot] ?? 9));

    // stato per slot: done (spuntato) / active (finestra oraria ora) / future
    const nowSlot = VIEWS.activeSlot(prefs, new Date());
    const withState = res.blocks.map((b) => {
      const fz = frozen[b.slot];
      const edited = !!(fz && fz.edited);
      // done solo se davvero spuntato; un pasto solo-modificato mantiene il suo stato temporale
      const state = (fz && fz.wasDone) ? "done" : b.slot === nowSlot ? "active" : "future";
      return { ...b, edited, state };
    });
    // fuori da ogni finestra: attiva il primo pasto non ancora fatto
    if (!withState.some((b) => b.state === "active")) {
      const firstFuture = withState.find((b) => b.state !== "done");
      if (firstFuture) firstFuture.state = "active";
    }

    // MANGIATO = somma dei soli pasti spuntati (le barre si riempiono spuntando)
    let eaten = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    for (const b of withState) if (b.state === "done") eaten = SOLVER.addMacros(eaten, b.custom ? b.custom.macros : SOLVER.calcMacros(b.items, foods));
    eaten = { kcal: Math.round(eaten.kcal), protein: Math.round(eaten.protein * 10) / 10, carbs: Math.round(eaten.carbs * 10) / 10, fat: Math.round(eaten.fat * 10) / 10 };

    // diff dei riadattamenti vs stato precedente (solo slot non-frozen)
    const adjustments = prev ? window.MB_ADJUST.diffAdjustments(prev.blocks, withState) : [];
    return { ...res, selection, eaten, adjustments, activeSlot: withState.find((b) => b.state === "active")?.slot || null, blocks: withState };
  }

  // unisce due liste di riadattamenti per slot: durante una modifica il solver
  // ricalcola a ogni grammo, ma all'utente interessa il RISULTATO complessivo.
  function mergeAdjustments(prevList, nextList) {
    const by = {};
    for (const a of prevList || []) by[a.slot] = { slot: a.slot, replaced: a.replaced, changes: [...a.changes] };
    for (const a of nextList || []) {
      const cur = by[a.slot];
      if (!cur) { by[a.slot] = { slot: a.slot, replaced: a.replaced, changes: [...a.changes] }; continue; }
      if (a.replaced) cur.replaced = { from: (cur.replaced && cur.replaced.from) || a.replaced.from, to: a.replaced.to };
      for (const c of a.changes) {
        const old = cur.changes.find((x) => x.food === c.food);
        // il "da" è il primo valore visto, il "a" è l'ultimo: il netto della sessione
        if (old) old.to = c.to; else cur.changes.push({ ...c });
      }
      // scarta le voci tornate al punto di partenza
      cur.changes = cur.changes.filter((c) => c.from !== c.to);
    }
    return Object.values(by).filter((a) => a.replaced || a.changes.length);
  }

  // riepilogo immediato (fuori dalla modifica): apre il modal se c'è qualcosa
  function showAdjustments(today) {
    const s = store.get();
    const adjs = (today && today.adjustments) || [];
    if (!adjs.length) return;
    const lines = window.MB_ADJUST.formatAdjustments(adjs, s.foods, window.MB_VIEWS.SLOT_NAME);
    if (lines.length) store.set({ sheet: { type: "adjust", lines } });
  }

  // ---- validazione lato client dell'output AI (seconda barriera) ----
  function enabledBySlot(blocks) {
    const by = { colazione: [], pranzo: [], merenda: [], cena: [] };
    for (const id of Object.keys(blocks)) { const b = blocks[id]; if (b.enabled !== false && by[b.slot]) by[b.slot].push(b.id); }
    return by;
  }
  function validateAiDays(days, blocks) {
    const by = enabledBySlot(blocks);
    const SLOTS = ["colazione", "pranzo", "merenda", "cena"];
    return days.slice(0, 7).map((d) => {
      const selection = {};
      for (const s of SLOTS) {
        const chosen = d.selection && d.selection[s];
        selection[s] = by[s].includes(chosen) ? chosen : by[s][0] || null; // fallback: primo abilitato
      }
      return { dayType: d.dayType === "ON" ? "ON" : "OFF", selection };
    });
  }
  function daysToWeek(cleanDays, state) {
    const start = window.MB_WEEK.mondayOf(new Date());
    const days = cleanDays.map((d, i) => {
      const date = new Date(start); date.setDate(start.getDate() + i);
      return { date: window.MB_WEEK.iso(date), dow: date.getDay(), dayType: d.dayType, selection: d.selection };
    });
    return { id: window.MB_WEEK.isoWeekId(start), weekStart: window.MB_WEEK.iso(start),
      onDays: days.filter((d) => d.dayType === "ON").map((d) => d.dow), days };
  }

  function defaultDayType(prefs) {
    const on = (prefs && prefs["onDaysDefault"]) || [];
    return on.includes(new Date().getDay()) ? "ON" : "OFF";
  }

  // ---- AZIONI (unico punto di mutazione) ----
  const actions = {
    go(route) {
      const s = store.get();
      if (s.editingSlot) { actions.toggleEditMeal(s.editingSlot); return; } // prima esci dalla modifica
      store.set({ route });
    },

    toggleMeal(slot) {
      const s = store.get();
      // in modifica: il tap sulla card non chiude niente, esce solo dalla modifica
      if (s.editingSlot) {
        if (s.editingSlot === slot) actions.toggleEditMeal(slot);
        return;
      }
      store.set((st) => {
        const wasOpen = (st.openSlots || new Set()).has(slot);
        // accordion: un solo blocco aperto alla volta
        const open = wasOpen ? new Set() : new Set([slot]);
        // se apro, porto il focus sulla card (meno friction)
        return { openSlots: open, scrollTo: wasOpen ? null : slot };
      });
    },

    // spunta/despunta un pasto: fatto -> frozen, ricalcola i futuri
    checkMeal(slot) {
      const s = store.get();
      if (!s.today) return;
      const target = s.today.blocks.find((b) => b.slot === slot);
      const nowDone = target && target.state !== "done";
      const blocks = s.today.blocks.map((b) =>
        b.slot === slot ? { ...b, state: b.state === "done" ? "future" : "done" } : b);
      const today = composeTodayFrom({ ...s, today: { ...s.today, blocks } });
      store.set({ today });
      persistDay(today);
      showAdjustments(today);
      // learner: spuntare un pasto = segnale di gradimento del blocco
      if (nowDone && target) learn({ type: "checkMeal", blockId: target.blockId });
      api.logEvent("checkMeal", { slot, blockId: target && target.blockId, done: nowDone }).catch(() => {});
    },

    toggleDayType() {
      const s = store.get();
      if (!s.today) return;
      const dayType = s.today.dayType === "ON" ? "OFF" : "ON";
      // riverifica col nuovo tipo: se un blocco non regge più viene sostituito
      // (mai i pasti fatti/modificati/liberi); la barra riadattamenti lo mostra
      const frozen = {};
      for (const b of s.today.blocks) if (b.state === "done" || b.edited || b.custom) frozen[b.slot] = b.custom ? { custom: b.custom } : { blockId: b.blockId, label: b.label, items: b.items };
      const todayIso = window.MB_WEEK.iso(new Date());
      const day = window.MB_WEEK.ensureSolvable(
        { date: todayIso, dayType, selection: { ...s.today.selection } },
        { foods: s.foods, blocks: s.blocks, prefs: s.prefs, frozen });
      const today = composeToday(s, { dayType, selection: day.selection });
      store.set({ today });
      persistDay(today);
      showAdjustments(today);
      // riflette il cambio anche nella settimana e salva
      if (s.week) {
        const days = s.week.days.map((d) => d.date === todayIso ? { ...d, dayType, selection: day.selection } : d);
        const week = { ...s.week, days };
        store.set({ week });
        api.saveWeek(week);
      }
    },

    regenerate() {
      const s = store.get();
      store.set({ today: composeToday(s) });
    },

    dismissAdjustments() {
      store.set((s) => ({ today: s.today && { ...s.today, adjustments: [] } }));
    },
    closeAdjModal() { store.set({ sheet: null }); },

    // ---- settimana ----
    regenerateWeek() {
      const s = store.get();
      const week = window.MB_WEEK.generateWeek({ foods: s.foods, blocks: s.blocks, prefs: s.prefs });
      store.set({ week });
      store.set((st) => ({ today: composeToday({ ...st, today: null }) }));
      api.saveWeek(week);
    },
    openAiWeek() { store.set({ sheet: { type: "ai", text: "" } }); },

    // ---- gestione (alimenti + blocchi) ----
    setGestTab(gestTab) { store.set({ gestTab }); },
    newEntity(tab) {
      if (tab === "alimenti") store.set({ sheet: { type: "foodedit", draft: { id: "", label: "", kcal: 0, carbs: 0, protein: 0, fat: 0, cat: "protein", kind: "sfuso", rangeMin: 50, rangeMax: 200, emoji: "🍽️" }, isNew: true } });
      else store.set({ sheet: { type: "blockedit", draft: { id: "", label: "", slot: "pranzo", items: [], enabled: true }, isNew: true } });
    },
    // nuovo blocco già assegnato a una fascia (dal picker del calendario)
    newBlockForSlot(slot) {
      store.set({ sheet: { type: "blockedit", draft: { id: "", label: "", slot, items: [], enabled: true }, isNew: true } });
    },
    editFood(id) {
      const f = store.get().foods[id];
      if (f) store.set({ sheet: { type: "foodedit", draft: JSON.parse(JSON.stringify(f)), isNew: false } });
    },
    editBlock(id) {
      const b = store.get().blocks[id];
      if (b) store.set({ sheet: { type: "blockedit", draft: JSON.parse(JSON.stringify(b)), isNew: false } });
    },
    setDraft(patch) { store.set((s) => ({ sheet: { ...s.sheet, draft: { ...s.sheet.draft, ...patch } } })); },
    saveDraft() {
      const s = store.get();
      const sh = s.sheet;
      if (!sh || !sh.draft) return;
      const d = sh.draft;
      if (!d.label) { store.set({ toast: "Serve un nome" }); setTimeout(() => store.set({ toast: null }), 1800); return; }
      if (!d.id) d.id = d.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (sh.type === "foodedit") {
        ["kcal", "carbs", "protein", "fat", "rangeMin", "rangeMax", "fixed"].forEach((k) => { if (d[k] != null) d[k] = Number(d[k]) || 0; });
        d.verified = true; // salvare dal form = valori controllati dall'utente
        store.set({ foods: { ...s.foods, [d.id]: d }, sheet: null });
        api.saveFood(d);
      } else {
        store.set({ blocks: { ...s.blocks, [d.id]: d }, sheet: null });
        api.saveBlock(d);
      }
      // la giornata può dipendere dai dati modificati
      store.set((st) => ({ today: composeToday(st) }));
    },
    toggleBlockEnabled(id) {
      const s = store.get();
      const b = s.blocks[id]; if (!b) return;
      const nb = { ...b, enabled: b.enabled === false };
      store.set({ blocks: { ...s.blocks, [id]: nb } });
      api.saveBlock(nb);
    },

    // compone la settimana con l'AI (Gemini via GAS); fallback deterministico
    async aiComposeWeek(notes) {
      const s = store.get();
      store.set({ aiBusy: true, toast: null });
      try {
        let result = null;
        try {
          result = await withStatus("ai", () => api.aiCompose("week", notes, {
            blocks: s.blocks, prefs: s.prefs,
          }));
        } catch (e) { result = null; } // quota/formato/HTTP → fallback

        let week;
        if (result && Array.isArray(result.days) && result.days.length) {
          // validazione DOPPIA lato client: blockId esistente + enabled + slot coerente
          const clean = validateAiDays(result.days, s.blocks);
          week = daysToWeek(clean, s);
          store.set({ toast: "Settimana composta con AI" });
        } else {
          // fallback deterministico (AI assente/mock/errore)
          week = window.MB_WEEK.generateWeek({ foods: s.foods, blocks: s.blocks, prefs: s.prefs });
          store.set({ toast: "AI non disponibile — piano generato in locale" });
        }
        store.set({ week });
        store.set((st) => ({ today: composeToday({ ...st, today: null }) }));
        api.saveWeek(week);
      } finally {
        store.set({ aiBusy: false, sheet: null });
        const cur = store.get().toast;
        setTimeout(() => store.get().toast === cur && store.set({ toast: null }), 2800);
      }
    },

    // apri/chiudi un giorno nel calendario (accordion)
    toggleDay(date) {
      store.set((s) => ({ openDay: s.openDay === date ? null : date }));
    },
    // scegli un altro blocco per una fascia di un giorno
    openBlockPicker(date, slot) {
      const s = store.get();
      const day = s.week && s.week.days.find((d) => d.date === date);
      store.set({ sheet: { type: "blockpicker", date, slot, current: day && day.selection[slot] } });
    },
    setDayBlock(date, slot, blockId) {
      const s = store.get();
      if (!s.week) return;
      const days = s.week.days.map((d) => d.date === date ? { ...d, selection: { ...d.selection, [slot]: blockId } } : d);
      const week = { ...s.week, days };
      store.set({ week, sheet: null });
      // se ho cambiato oggi, ricomponi la giornata (i pasti fatti restano)
      const todayIso = window.MB_WEEK.iso(new Date());
      if (date === todayIso) store.set((st) => ({ today: composeToday({ ...st, today: st.today && { ...st.today, selection: { ...st.today.selection, [slot]: blockId } } }) }));
      api.saveWeek(week);
    },

    toggleWeekDayType(date) {
      const s = store.get();
      if (!s.week) return;
      const todayIso = window.MB_WEEK.iso(new Date());
      const days = s.week.days.map((d) => {
        if (d.date !== date) return d;
        const dayType = d.dayType === "ON" ? "OFF" : "ON";
        // per oggi rispetta i pasti fatti/modificati/liberi
        const frozen = {};
        if (d.date === todayIso && s.today) {
          for (const b of s.today.blocks) if (b.state === "done" || b.edited || b.custom) frozen[b.slot] = b.custom ? { custom: b.custom } : { blockId: b.blockId, label: b.label, items: b.items };
        }
        const fixed = window.MB_WEEK.ensureSolvable({ ...d, dayType, selection: { ...d.selection } },
          { foods: s.foods, blocks: s.blocks, prefs: s.prefs, frozen });
        return { ...d, dayType, selection: fixed.selection };
      });
      const week = { ...s.week, days };
      store.set({ week });
      if (date === todayIso) {
        const wday = days.find((d) => d.date === todayIso);
        store.set((st) => ({ today: composeToday(st, { dayType: wday.dayType, selection: wday.selection }) }));
        persistDay(store.get().today);
        showAdjustments(store.get().today);
      }
      api.saveWeek(week);
    },

    // ---- modifica pasto inline (long-press sulla card aperta) ----
    toggleEditMeal(slot) {
      const s = store.get();
      const closing = s.editingSlot === slot;
      if (!closing) { store.set({ editingSlot: slot }); return; }
      // uscita dalla modifica: mostro il riepilogo di TUTTA la sessione
      const lines = (s.adjPending && s.adjPending.length)
        ? window.MB_ADJUST.formatAdjustments(s.adjPending, s.foods, window.MB_VIEWS.SLOT_NAME)
        : [];
      store.set({ editingSlot: null, adjPending: null,
        sheet: lines.length ? { type: "adjust", lines } : s.sheet });
    },
    openFoodPicker(slot) { store.set({ sheet: { type: "picker", slot, query: "" } }); },
    closeSheet() { store.set({ sheet: null }); },
    setSheetQuery(query) { store.set((s) => ({ sheet: { ...s.sheet, query } })); },
    setSheetText(text) { store.set((s) => ({ sheet: { ...s.sheet, text } })); },

    addFoodToMeal(slot, foodId) {
      editMeal(slot, (items) => items.some((i) => i.food === foodId) ? items : items.concat([{ food: foodId }]));
      store.set({ sheet: null }); // chiudo il picker, resto in modifica
      learn({ type: "addFood", food: foodId }); // scelta esplicita: forte segnale di preferenza
      api.logEvent("addFood", { slot, food: foodId }).catch(() => {});
    },
    removeFoodFromMeal(slot, foodId) {
      editMeal(slot, (items) => items.filter((i) => i.food !== foodId));
    },
    nudgeGrams(slot, foodId, delta) {
      editMeal(slot, (items) => items.map((i) =>
        i.food === foodId ? { ...i, grams: Math.max(0, (i.grams || 0) + delta) } : i));
    },
    // tap sulla grammatura = modal nostro con input numerico
    promptGrams(slot, foodId, current) {
      store.set({ sheet: { type: "grams", slot, food: foodId, value: String(current || "") } });
    },
    setGramsValue(value) { store.set((s) => ({ sheet: { ...s.sheet, value } })); },
    confirmGrams() {
      const s = store.get();
      const sh = s.sheet;
      if (!sh || sh.type !== "grams") return;
      const g = Math.max(0, Math.round(Number(sh.value)));
      store.set({ sheet: null });
      if (!isFinite(g)) return;
      editMeal(sh.slot, (items) => items.map((i) => i.food === sh.food ? { ...i, grams: g } : i));
    },

    // ---- pasto libero: "ho mangiato altro" ----
    openFreeMeal(slot) {
      const s = store.get();
      const b = s.today && s.today.blocks.find((x) => x.slot === slot);
      store.set({ sheet: { type: "freemeal", slot, text: (b && b.custom && b.custom.label) || "", manual: false, busy: false,
        vals: { kcal: "", protein: "", carbs: "", fat: "" }, isCustom: !!(b && b.custom) } });
    },
    setFreeMealVal(key, value) { store.set((s) => ({ sheet: { ...s.sheet, vals: { ...s.sheet.vals, [key]: value } } })); },
    async submitFreeMeal() {
      const s = store.get();
      const sh = s.sheet;
      if (!sh || sh.type !== "freemeal" || !(sh.text || "").trim()) return;
      store.set({ sheet: { ...sh, busy: true } });
      try {
        const est = await api.aiEstimateMeal(sh.text.trim());
        applyFreeMeal(sh.slot, { label: est.label, macros: est.macros, estimated: true });
        store.set({ sheet: null });
      } catch (e) {
        // AI non disponibile → inserimento manuale, il testo resta come etichetta
        store.set((st) => ({ sheet: st.sheet && { ...st.sheet, busy: false, manual: true } }));
      }
    },
    confirmFreeMealManual() {
      const s = store.get();
      const sh = s.sheet;
      if (!sh || sh.type !== "freemeal") return;
      const n = (x) => Math.max(0, Math.round(Number(x) || 0));
      const macros = { kcal: n(sh.vals.kcal), protein: n(sh.vals.protein), carbs: n(sh.vals.carbs), fat: n(sh.vals.fat) };
      if (!macros.kcal && !macros.protein && !macros.carbs && !macros.fat) return; // tutto vuoto: niente da registrare
      applyFreeMeal(sh.slot, { label: ((sh.text || "").trim() || "Pasto libero").slice(0, 40), macros, estimated: false });
      store.set({ sheet: null });
    },
    // torna al pasto pianificato (annulla il pasto libero)
    restorePlannedMeal(slot) {
      const s = store.get();
      if (!s.today) return;
      const blocks = s.today.blocks.map((b) => b.slot === slot ? { ...b, custom: null, edited: false, state: b.state === "done" ? "future" : b.state } : b);
      const today = composeToday({ ...s, today: { ...s.today, blocks } });
      store.set({ today, sheet: null });
      persistDay(today);
    },

    // ---- proposta settimanale ----
    async acceptProposal() {
      const s = store.get();
      const p = s.proposal;
      if (!p || p.status !== "pending") return;
      store.set({ proposal: { ...p, status: "accepting" } }); // blocca il doppio tap
      // 1) nuovi alimenti nel catalogo (da verificare sull'etichetta)
      const foods = { ...s.foods };
      for (const f of p.newFoods) { const nf = { kind: "sfuso", ...f, verified: false }; foods[nf.id] = nf; api.saveFood(nf); }
      // 2) blocco nel catalogo, con ricetta
      const block = { ...p.block, recipe: p.recipe, enabled: true };
      const blocks = { ...s.blocks, [block.id]: block };
      api.saveBlock(block);
      store.set({ foods, blocks });
      // 3) settimana prossima: carica o genera, piazza il blocco, salva
      let next = null;
      try { next = await api.getWeek(p.weekId); } catch (e) { next = null; }
      const monday = window.MB_WEEK.mondayOf(new Date()); monday.setDate(monday.getDate() + 7);
      if (!next) next = window.MB_WEEK.generateWeek({ foods, blocks, prefs: s.prefs, anchor: monday });
      next = window.MB_PROPOSAL.placeInWeek(next, block, { foods, blocks, prefs: s.prefs });
      api.saveWeek(next);
      // 4) stato proposta
      const done = { ...p, status: "accepted" };
      store.set((st) => ({ nextWeek: next, proposal: null, prefs: { ...st.prefs, "proposal.current": done } }));
      api.savePrefs({ "proposal.current": done });
    },
    dismissProposal() {
      const s = store.get();
      const p = s.proposal;
      if (!p) return;
      const done = { ...p, status: "dismissed" };
      store.set((st) => ({ proposal: null, prefs: { ...st.prefs, "proposal.current": done } }));
      api.savePrefs({ "proposal.current": done });
    },
    // ---- impostazioni (supermercato + giorno proposta) ----
    openSettings() {
      const s = store.get();
      const pp = proposalPrefs(s.prefs);
      store.set({ sheet: { type: "settings", supermarket: pp.supermarket, weekday: pp.weekday } });
    },
    setSettingsVal(patch) { store.set((st) => ({ sheet: { ...st.sheet, ...patch } })); },
    saveSettings() {
      const s = store.get();
      const sh = s.sheet;
      if (!sh || sh.type !== "settings") return;
      // NB: 0 (domenica) è falsy — niente `|| 5`, whitelist esplicita
      const wd = Number(sh.weekday);
      const patch = { "proposal.supermarket": String(sh.supermarket || "Lidl").slice(0, 40), "proposal.weekday": [0, 4, 5, 6].includes(wd) ? wd : 5 };
      store.set((st) => ({ prefs: { ...st.prefs, ...patch }, sheet: null }));
      api.savePrefs(patch);
    },
    // ---- conferma macro di un alimento proposto dall'AI ----
    confirmFood(id) {
      const s = store.get();
      const f = s.foods[id];
      if (!f) return;
      const nf = { ...f, verified: true };
      store.set({ foods: { ...s.foods, [id]: nf } });
      api.saveFood(nf);
    },

  };

  // applica una modifica manuale al pasto: il pasto diventa "fissato" (frozen)
  // e il solver ridistribuisce SOLO sui pasti futuri per restare in target.
  function editMeal(slot, transform) {
    const s = store.get();
    if (!s.today) return;
    const target = s.today.blocks.find((b) => b.slot === slot);
    if (!target) return;
    const newItems = transform(target.items.map((i) => ({ ...i })));

    // congela: i done restano done; il pasto modificato viene bloccato as-is;
    // i pasti futuri li ricalcola il solver.
    const blocks = s.today.blocks.map((b) => {
      if (b.slot === slot) return { ...b, items: newItems, state: b.state === "done" ? "done" : b.state, edited: true };
      return b;
    });
    const today = composeToday({ ...s, today: { ...s.today, blocks } });
    // avviso solo se la modifica fa USCIRE dal target (non se la giornata
    // era già fuori per conto suo: sarebbe spam a ogni +1g)
    const wasInTarget = s.today.status && s.today.status.inTarget;
    const warn = (wasInTarget && !today.status.inTarget) ? "Scostamento troppo grande per rientrare oggi" : null;
    // durante la modifica accumulo i riadattamenti: il riepilogo si mostra
    // alla chiusura, non a ogni singolo grammo
    store.set((st) => ({ today, adjPending: mergeAdjustments(st.adjPending, today.adjustments), toast: warn }));
    if (warn) setTimeout(() => store.get().toast === warn && store.set({ toast: null }), 3000);
    persistDay(today);
  }

  // registra un pasto libero: lo slot diventa custom (sempre frozen),
  // i pasti futuri si riadattano e la barra riadattamenti lo mostra.
  function applyFreeMeal(slot, custom) {
    const s = store.get();
    if (!s.today) return;
    const blocks = s.today.blocks.map((b) => b.slot === slot ? { ...b, custom, items: [], blockId: null } : b);
    const today = composeToday({ ...s, today: { ...s.today, blocks } });
    store.set({ today });
    persistDay(today);
    showAdjustments(today);
    api.logEvent("freeMeal", { slot, label: custom.label, estimated: custom.estimated }).catch(() => {});
  }

  // helper: ricompone da uno stato dato (per checkMeal che passa blocks modificati)
  function composeTodayFrom(state) { return composeToday(state); }

  // persiste la giornata via coda sync (il badge in header mostra lo stato)
  function persistDay(today) {
    api.saveDay(serializeDay(today));
  }

  // learner: applica un'osservazione ai punteggi in prefs e persiste
  function learn(event) {
    const s = store.get();
    const patch = window.MB_LEARNER.observe(s.prefs, event);
    if (!patch || !Object.keys(patch).length) return;
    const prefs = { ...s.prefs, ...patch };
    store.set({ prefs });
    api.savePrefs(patch);
  }

  // ---- proposta settimanale pre-spesa ----
  function proposalPrefs(prefs) {
    return {
      weekday: Number(prefs["proposal.weekday"] ?? 5),        // 5 = venerdì
      supermarket: String(prefs["proposal.supermarket"] ?? "Lidl"),
    };
  }
  function nextWeekId() {
    const m = window.MB_WEEK.mondayOf(new Date());
    m.setDate(m.getDate() + 7);
    return window.MB_WEEK.isoWeekId(m);
  }
  function inProposalWindow(prefs) {
    const dow = new Date().getDay();
    const wd = proposalPrefs(prefs).weekday;
    // wd=0 (domenica) = solo domenica; altrimenti da wd fino a domenica inclusa
    return wd === 0 ? dow === 0 : (dow === 0 || dow >= wd);
  }
  // al boot: nella finestra ven→dom, se non c'è già una proposta per la
  // settimana prossima, chiedila all'AI in background (silenzio sugli errori)
  async function maybeFetchProposal() {
    const s = store.get();
    if (!inProposalWindow(s.prefs)) return;
    const wid = nextWeekId();
    const cur = s.prefs["proposal.current"];
    if (cur && cur.weekId === wid) {
      if (cur.status === "pending") store.set({ proposal: cur });
      return; // già proposta (in qualsiasi stato) per la settimana prossima
    }
    try {
      let raw = null, valid = null;
      for (let attempt = 0; attempt < 2 && !valid; attempt++) {
        raw = await api.aiProposeWeeklyBlock({
          foods: s.foods, blocks: s.blocks,
          learnerScores: s.prefs["learner.blockScores"] || {},
          supermarket: proposalPrefs(s.prefs).supermarket,
        });
        valid = window.MB_PROPOSAL.validateProposal(raw, s.foods, s.blocks, s.prefs);
      }
      if (!valid) return; // due tentativi falliti: nessuna proposta, nessun errore in faccia
      valid.block.id = window.MB_PROPOSAL.uniqueBlockId(valid.block.id, s.blocks);
      const proposal = { weekId: wid, block: valid.block, newFoods: valid.newFoods, recipe: valid.recipe, status: "pending" };
      store.set({ proposal });
      api.savePrefs({ "proposal.current": proposal });
      store.set((st) => ({ prefs: { ...st.prefs, "proposal.current": proposal } }));
    } catch (e) { /* AI assente: silenzio, si riproverà al prossimo boot */ }
  }

  function serializeDay(today) {
    return {
      id: window.MB_WEEK.iso(new Date()),
      date: window.MB_WEEK.iso(new Date()),
      dayType: today.dayType,
      selection: today.selection,
      resolved: today.blocks.map((b) => ({ slot: b.slot, blockId: b.blockId, items: b.items, custom: b.custom || null, state: b.state })),
      totals: today.totals,
    };
  }

  window.MB_ACTIONS = actions;

  // ---- render unico ----
  // tinta fissa magenta ovunque (decisione: la fascia si vede dalla card)
  document.body.className = "theme-magenta";

  function render(state) {
    if (!state.booted) return; // boot screen già in HTML
    const view = VIEWS[state.route] || VIEWS.oggi;
    const phone = view(state);
    root.replaceChildren(phone);
    // side-effect di render: porta in vista la card appena aperta
    if (state.scrollTo) {
      const el = root.querySelector(`[data-slot="${state.scrollTo}"]`);
      if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
      // consuma il flag senza ri-renderizzare in loop
      store.get().scrollTo = null;
    }
  }
  store.subscribe(render);

  // scritture fallite: riprova quando l'app torna in primo piano
  window.addEventListener("focus", () => api.sync && api.sync.flush());

  // ---- boot ----
  (async () => {
    try {
      const data = await withStatus("boot", () => api.bootstrap());
      store.set({
        foods: data.foods, blocks: data.blocks, prefs: data.prefs,
        openSlots: new Set(), booted: true,
      });
      // settimana: usa quella dal cloud o generala in locale (deterministico)
      store.set((s) => {
        const week = data.currentWeek || window.MB_WEEK.generateWeek({ foods: s.foods, blocks: s.blocks, prefs: s.prefs });
        return { week };
      });
      // compone la giornata di oggi dalla selezione della settimana corrente
      // il blocco della fascia oraria attiva parte già aperto
      store.set((s) => {
        const today = composeToday(s);
        return { today, openSlots: new Set(today.activeSlot ? [today.activeSlot] : []) };
      });
      // proposta pre-spesa (ven→dom) + settimana prossima già salvata
      maybeFetchProposal();
      if (inProposalWindow(store.get().prefs)) {
        // non sovrascrivere una nextWeek già impostata (es. accettazione più rapida del fetch)
        api.getWeek(nextWeekId()).then((w) => { if (w) store.set((st) => st.nextWeek ? {} : { nextWeek: w }); }).catch(() => {});
      }
      // persisti la settimana se generata ora (mock: no-op)
      if (!data.currentWeek) api.saveWeek(store.get().week);
    } catch (e) {
      root.replaceChildren();
      root.append(Object.assign(document.createElement("div"),
        { className: "boot", textContent: "Errore: " + (e.message || e) }));
    }
  })();
})();

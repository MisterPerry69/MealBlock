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
    const todayIso = new Date().toISOString().slice(0, 10);
    const wday = state.week && (state.week.days || []).find((d) => d.date === todayIso);
    const dayType = (opts && opts.dayType) || (prev && prev.dayType) || (wday && wday.dayType) || defaultDayType(prefs);
    const selection = (prev && prev.selection) || (wday && wday.selection) || defaultSelection(dayType);

    // pasti spuntati O modificati a mano -> frozen (il solver non li tocca, ridistribuisce sui futuri)
    const frozen = {};
    if (prev) for (const b of prev.blocks) if (b.state === "done" || b.edited) frozen[b.slot] = { blockId: b.blockId, label: b.label, items: b.items, edited: b.edited, wasDone: b.state === "done" };

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

    return { ...res, selection, activeSlot: withState.find((b) => b.state === "active")?.slot || null, blocks: withState };
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
    go(route) { store.set({ route }); },

    toggleMeal(slot) {
      store.set((s) => {
        const wasOpen = (s.openSlots || new Set()).has(slot);
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
      api.saveDay(serializeDay(today)).catch(() => store.set({ toast: "Salvataggio fallito" }));
      // learner: spuntare un pasto = segnale di gradimento del blocco
      if (nowDone && target) learn({ type: "checkMeal", blockId: target.blockId });
      api.logEvent("checkMeal", { slot, blockId: target && target.blockId, done: nowDone }).catch(() => {});
    },

    toggleDayType() {
      const s = store.get();
      if (!s.today) return;
      const dayType = s.today.dayType === "ON" ? "OFF" : "ON";
      store.set({ today: composeToday(s, { dayType }) });
    },

    regenerate() {
      const s = store.get();
      store.set({ today: composeToday(s) });
    },

    // ---- settimana ----
    regenerateWeek() {
      const s = store.get();
      const week = window.MB_WEEK.generateWeek({ blocks: s.blocks, prefs: s.prefs });
      store.set({ week });
      store.set((st) => ({ today: composeToday({ ...st, today: null }) }));
      api.saveWeek(week).catch(() => {});
    },
    openAiWeek() { store.set({ sheet: { type: "ai", text: "" } }); },

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
          week = window.MB_WEEK.generateWeek({ blocks: s.blocks, prefs: s.prefs });
          store.set({ toast: "AI non disponibile — piano generato in locale" });
        }
        store.set({ week });
        store.set((st) => ({ today: composeToday({ ...st, today: null }) }));
        api.saveWeek(week).catch(() => {});
      } finally {
        store.set({ aiBusy: false, sheet: null });
        const cur = store.get().toast;
        setTimeout(() => store.get().toast === cur && store.set({ toast: null }), 2800);
      }
    },

    toggleWeekDayType(date) {
      const s = store.get();
      if (!s.week) return;
      const days = s.week.days.map((d) => d.date === date ? { ...d, dayType: d.dayType === "ON" ? "OFF" : "ON" } : d);
      const week = { ...s.week, days };
      store.set({ week });
      // se è oggi, ricomponi la giornata
      const todayIso = new Date().toISOString().slice(0, 10);
      if (date === todayIso) store.set((st) => ({ today: composeToday({ ...st, today: null }) }));
      api.saveWeek(week).catch(() => {});
    },

    // ---- scostamento a 3 vie ----
    openDeviation(slot) { store.set({ sheet: { type: "deviation", slot, tab: "cerca", query: "", text: "" } }); },
    closeSheet() { store.set({ sheet: null }); },
    setSheetTab(tab) { store.set((s) => ({ sheet: { ...s.sheet, tab } })); },
    setSheetQuery(query) { store.set((s) => ({ sheet: { ...s.sheet, query } })); },
    setSheetText(text) { store.set((s) => ({ sheet: { ...s.sheet, text } })); },

    addFoodToMeal(slot, foodId) {
      editMeal(slot, (items) => items.some((i) => i.food === foodId) ? items : items.concat([{ food: foodId }]));
      store.set({ sheet: null }); // aggiunto: chiudo, torno alla giornata aggiornata
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

    describeToAi(slot) {
      const s = store.get();
      const text = (s.sheet && s.sheet.text || "").trim();
      if (!text) return;
      // mock (senza GAS): stima grezza -> alimento generico "extra descritto".
      // reale (fase 4): api.aiEstimate(text) -> {label,kcal,...}; se non esiste lo aggiunge al DB.
      store.set({ toast: "AI non attiva in mock — collega GAS (fase 4)" });
      setTimeout(() => store.get().toast === "AI non attiva in mock — collega GAS (fase 4)" && store.set({ toast: null }), 2600);
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
    // avviso se, pur ribilanciando, non si rientra in target
    const warn = !today.status.inTarget ? "Scostamento troppo grande per rientrare oggi" : null;
    store.set({ today, toast: warn });
    if (warn) setTimeout(() => store.get().toast === warn && store.set({ toast: null }), 3000);
    api.saveDay(serializeDay(today)).catch(() => {});
  }

  // helper: ricompone da uno stato dato (per checkMeal che passa blocks modificati)
  function composeTodayFrom(state) { return composeToday(state); }

  // learner: applica un'osservazione ai punteggi in prefs e persiste
  function learn(event) {
    const s = store.get();
    const patch = window.MB_LEARNER.observe(s.prefs, event);
    if (!patch || !Object.keys(patch).length) return;
    const prefs = { ...s.prefs, ...patch };
    store.set({ prefs });
    api.savePrefs(patch).catch(() => {});
  }

  function serializeDay(today) {
    return {
      id: new Date().toISOString().slice(0, 10),
      date: new Date().toISOString().slice(0, 10),
      dayType: today.dayType,
      selection: today.selection,
      resolved: today.blocks.map((b) => ({ slot: b.slot, blockId: b.blockId, items: b.items, state: b.state })),
      totals: today.totals,
    };
  }

  window.MB_ACTIONS = actions;

  // ---- render unico ----
  const THEME_HEX = { colazione: "#F1C97E", pranzo: "#A6D6A0", merenda: "#9EC9DE", cena: "#B4A2D6", magenta: "#D78FCD" };
  const metaTheme = document.querySelector('meta[name="theme-color"]');

  function syncTheme(phone) {
    // propaga il tema del .phone al <body> (safe-area/notch dello stesso colore)
    const cls = (phone.className.match(/theme-(\w+)/) || [])[1] || "magenta";
    document.body.className = "theme-" + cls;
    if (metaTheme) metaTheme.setAttribute("content", THEME_HEX[cls] || THEME_HEX.magenta);
  }

  function render(state) {
    if (!state.booted) return; // boot screen già in HTML
    const view = VIEWS[state.route] || VIEWS.oggi;
    const phone = view(state);
    root.replaceChildren(phone);
    syncTheme(phone);
    // side-effect di render: porta in vista la card appena aperta
    if (state.scrollTo) {
      const el = root.querySelector(`[data-slot="${state.scrollTo}"]`);
      if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
      // consuma il flag senza ri-renderizzare in loop
      store.get().scrollTo = null;
    }
  }
  store.subscribe(render);

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
        const week = data.currentWeek || window.MB_WEEK.generateWeek({ blocks: s.blocks, prefs: s.prefs });
        return { week };
      });
      // compone la giornata di oggi dalla selezione della settimana corrente
      // il blocco della fascia oraria attiva parte già aperto
      store.set((s) => {
        const today = composeToday(s);
        return { today, openSlots: new Set(today.activeSlot ? [today.activeSlot] : []) };
      });
      // persisti la settimana se generata ora (mock: no-op)
      if (!data.currentWeek) api.saveWeek(store.get().week).catch(() => {});
    } catch (e) {
      root.replaceChildren();
      root.append(Object.assign(document.createElement("div"),
        { className: "boot", textContent: "Errore: " + (e.message || e) }));
    }
  })();
})();

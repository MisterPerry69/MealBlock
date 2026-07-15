// ============================================================
//  views.js — rendering puro (stato -> DOM). Nessuna mutazione.
//  Le viste leggono lo store e chiamano window.MB_ACTIONS sui gesti.
//  Classi dal design system in style.css (approvato su mockup).
// ============================================================
(function () {
  "use strict";
  const { h, icon, ring } = window.MB_UI;
  const A = () => window.MB_ACTIONS || {};

  const DOW = ["DOMENICA", "LUNEDÌ", "MARTEDÌ", "MERCOLEDÌ", "GIOVEDÌ", "VENERDÌ", "SABATO"];
  const SLOT_THEME = { colazione: "colazione", pranzo: "pranzo", merenda: "merenda", cena: "cena" };
  const SLOT_NAME = { colazione: "Colazione", pranzo: "Pranzo", merenda: "Merenda", cena: "Cena" };

  // finestra oraria -> slot "attivo" ora (per il tema colore dello schermo)
  function activeSlot(prefs, now = new Date()) {
    const wins = (prefs && prefs.mealWindows) || {};
    const hr = now.getHours();
    for (const [slot, [a, b]] of Object.entries(wins)) if (hr >= a && hr < b) return slot;
    return "pranzo";
  }

  // ---- macro row (barra) ----
  function macroRow(cls, iconName, name, val, target, unit, color) {
    const pct = target > 0 ? Math.min(100, (val / target) * 100) : 0;
    return h("div", { class: "mrow " + cls },
      h("span", { class: "ic" }, icon(iconName, 14, 2.2)),
      h("span", { class: "name" }, name),
      h("div", { class: "track" }, h("div", { class: "fill", style: { width: pct + "%", background: color } })),
      h("span", { class: "v" }, Math.round(val), h("span", { class: "t" }, "/" + Math.round(target) + unit)),
    );
  }

  // ---- calbox (calorie + macro annidati) ----
  function calbox(totals, target) {
    const pct = target.kcal > 0 ? Math.round((totals.kcal / target.kcal) * 100) : 0;
    return h("div", { class: "calbox glass-strong" },
      h("div", { class: "top" },
        h("div", {},
          h("div", { class: "lab" }, icon("flame", 13, 2.4), "Calorie"),
          h("div", { class: "n" }, Math.round(totals.kcal), h("span", {}, " /" + target.kcal)),
          h("div", { class: "unit" }, "kcal"),
        ),
        h("div", { class: "ring" }, ring(pct), h("div", { class: "p" }, pct + "%")),
      ),
      h("div", { class: "macro" },
        macroRow("c", "wheat", "CARB", totals.carbs, target.carbs, "g", "var(--carb)"),
        macroRow("p", "beef", "PROT", totals.protein, target.protein, "g", "var(--pro)"),
        macroRow("f", "droplet", "FAT", totals.fat, target.fat, "g", "var(--fat)"),
      ),
    );
  }

  // ---- card pasto (nella timeline) ----
  function mealCard(block, state, foods, open) {
    const slot = block.slot;
    const emoji = (foods[block.items[0] && block.items[0].food] || {}).emoji || "🍽️";
    const glass = state === "active" ? "glass-active" : "glass";
    const done = state === "done";
    const card = h("div", { class: "card " + glass + (open ? " open" : "") + (done ? " done" : ""),
        dataset: { slot },
        onClick: () => A().toggleMeal && A().toggleMeal(slot) },
      h("div", { class: "crow" },
        // tessera icona = spunta "ho mangiato" (tap dedicato, non apre la card)
        h("div", { class: "mi " + slot + (done ? " checked" : ""), title: done ? "Fatto" : "Segna come mangiato",
            onClick: (e) => { e.stopPropagation(); A().checkMeal && A().checkMeal(slot); } },
          done ? icon("check", 22, 3) : emoji),
        h("h3", {}, SLOT_NAME[slot] || block.label),
        h("div", { class: "chev" }, icon("chevron-down", 18, 2.4)),
      ),
      h("div", { class: "foods" },
        block.items.map((it) => {
          const f = foods[it.food] || {};
          return h("div", { class: "food" },
            h("span", { class: "dot" }),
            h("span", { class: "fn" }, f.label || it.food),
            h("span", { class: "fg" }, it.grams != null ? it.grams + " g" : ""),
          );
        }),
        // ho mangiato diverso? → apre lo scostamento a 3 vie
        !done && h("div", { class: "fedit" },
          h("button", { title: "Ho mangiato diverso",
            onClick: (e) => { e.stopPropagation(); A().openDeviation && A().openDeviation(slot); } },
            icon("pencil", 17, 2.2))),
      ),
    );
    return card;
  }

  // ---- timeline (righe rail+card) ----
  function timeline(day, foods, openSlots) {
    const rows = day.blocks.map((b, i) => {
      const st = b.state || "future";
      return h("div", { class: "row " + st },
        h("div", { class: "rail" }, h("div", { class: "node" })),
        mealCard(b, st, foods, openSlots.has(b.slot)),
      );
    });
    return h("div", { class: "meals" }, h("div", { class: "mcol" }, rows));
  }

  // ---- nav pillola ----
  function nav(route) {
    const items = [
      ["oggi", "target", "DIARIO"],
      ["settimana", "calendar-days", "CALENDARIO"],
      ["lista", "shopping-basket", "LISTA"],
      ["profilo", "user", "PROFILO"],
    ];
    return h("nav", { class: "glass" },
      items.map(([r, ic, lab]) =>
        h("button", { class: r === route ? "on" : "", onClick: () => A().go && A().go(r) },
          icon(ic, 21, r === route ? 2.4 : 2), h("span", {}, lab))),
    );
  }

  // ---- bottom sheet: scostamento a 3 vie ----
  function deviationSheet(state) {
    const sh = state.sheet;
    if (!sh || sh.type !== "deviation") return null;
    const { foods } = state;
    const slot = sh.slot;
    const block = (state.today.blocks || []).find((b) => b.slot === slot);
    const tab = sh.tab || "cerca";
    const close = () => A().closeSheet && A().closeSheet();

    const tabs = h("div", { class: "tabs" },
      [["cerca", "search"], ["ai", "sparkles"], ["edita", "pencil"]].map(([t, ic]) =>
        h("button", { class: t === tab ? "on" : "", onClick: () => A().setSheetTab(t) }, icon(ic, 20, 2.2))));

    let body;
    if (tab === "cerca") {
      const q = (sh.query || "").toLowerCase();
      const list = Object.values(foods)
        .filter((f) => !q || (f.label || "").toLowerCase().includes(q))
        .slice(0, 40);
      body = h("div", { class: "body" },
        h("input", { class: "search-in", placeholder: "Cerca un alimento…", value: sh.query || "",
          oninput: (e) => A().setSheetQuery(e.target.value) }),
        list.map((f) => h("div", { class: "srow", onClick: () => A().addFoodToMeal(slot, f.id) },
          h("span", { class: "em" }, f.emoji || "🍽️"),
          h("span", { class: "nm" }, f.label),
          h("span", { class: "kc" }, f.kcal + " kcal/100g"))),
      );
    } else if (tab === "ai") {
      body = h("div", { class: "body" },
        h("textarea", { class: "field", rows: 3, placeholder: "Es. due fette di pizza margherita…",
          oninput: (e) => A().setSheetText(e.target.value) }, sh.text || ""),
        h("button", { class: "go", onClick: () => A().describeToAi(slot) },
          icon("sparkles", 18, 2.2), "Stima e aggiungi"),
      );
    } else {
      body = h("div", { class: "body" },
        (block ? block.items : []).map((it) => {
          const f = foods[it.food] || {};
          return h("div", { class: "qty" },
            h("span", { class: "nm" }, f.label || it.food),
            h("div", { class: "stp" },
              h("button", { onClick: () => A().nudgeGrams(slot, it.food, -10) }, "−"),
              h("span", { class: "g" }, (it.grams || 0) + " g"),
              h("button", { onClick: () => A().nudgeGrams(slot, it.food, +10) }, "+"),
              h("button", { onClick: () => A().removeFoodFromMeal(slot, it.food), title: "Rimuovi" }, icon("x", 16, 2.4))),
          );
        }),
      );
    }
    return [h("div", { class: "scrim", onClick: close }),
      h("div", { class: "sheet" }, h("div", { class: "grab" }), tabs, body)];
  }

  // ---- bottom sheet: componi settimana con AI ----
  function aiSheet(state) {
    const sh = state.sheet;
    if (!sh || sh.type !== "ai") return null;
    const close = () => A().closeSheet && A().closeSheet();
    const busy = state.aiBusy;
    return [h("div", { class: "scrim", onClick: busy ? () => {} : close }),
      h("div", { class: "sheet" }, h("div", { class: "grab" }),
        h("div", { class: "body" },
          h("textarea", { class: "field", rows: 3, disabled: busy,
            placeholder: "Es. settimana senza latticini, stanco della pasta…",
            oninput: (e) => A().setSheetText(e.target.value) }, sh.text || ""),
          h("button", { class: "go", disabled: busy,
            onClick: () => A().aiComposeWeek(sh.text || "") },
            icon("sparkles", 18, 2.2), busy ? "Compongo…" : "Componi la settimana"),
        )),
    ];
  }

  // overlay comuni (sheet + toast) da appendere a ogni vista
  function overlays(state, phone) {
    const dev = deviationSheet(state); if (dev) phone.append(...dev);
    const ai = aiSheet(state); if (ai) phone.append(...ai);
    if (state.toast) phone.append(h("div", { class: "toast" }, state.toast));
  }

  // ---- vista OGGI ----
  function viewOggi(state) {
    const { today, foods, prefs } = state;
    const slot = today ? activeSlot(prefs) : "pranzo";
    const phone = h("div", { class: "phone theme-" + (SLOT_THEME[slot] || "magenta") });

    const now = new Date();
    const dow = DOW[now.getDay()];

    const head = h("div", { class: "head" },
      h("h1", {}, dow),
      today && h("span", { class: "on", onClick: () => A().toggleDayType && A().toggleDayType() }, today.dayType),
      h("div", { class: "spacer" }),
      h("button", { class: "icobtn", title: "Rigenera", onClick: () => A().regenerate && A().regenerate() }, icon("refresh-cw", 19, 2.2)),
    );

    const scroll = h("div", { class: "screen" }, h("div", { class: "scroll" }));
    const inner = scroll.firstChild;
    inner.append(head);

    if (!today) {
      inner.append(h("div", { class: "boot", style: { color: "var(--ink)", opacity: .6 } }, "Preparo la giornata…"));
    } else {
      inner.append(calbox(today.totals, today.target));
      inner.append(timeline(today, foods, state.openSlots || new Set()));
    }

    phone.append(scroll, nav(state.route));
    overlays(state, phone);
    return phone;
  }

  const DOW_SHORT = ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"];

  // ---- vista SETTIMANA ----
  function viewSettimana(state) {
    const { week, blocks, foods } = state;
    const phone = h("div", { class: "phone theme-magenta" });
    const scroll = h("div", { class: "screen" }, h("div", { class: "scroll" }));
    const inner = scroll.firstChild;
    const todayIso = new Date().toISOString().slice(0, 10);

    inner.append(h("div", { class: "head" },
      h("h1", {}, "SETTIMANA"),
      h("div", { class: "spacer" }),
      h("button", { class: "icobtn", title: "Componi con AI", onClick: () => A().openAiWeek && A().openAiWeek() }, icon("sparkles", 19, 2.2)),
      h("button", { class: "icobtn", title: "Rigenera", onClick: () => A().regenerateWeek && A().regenerateWeek() }, icon("refresh-cw", 19, 2.2)),
    ));

    if (!week) inner.append(h("div", { class: "boot", style: { color: "var(--ink)", opacity: .6 } }, "Nessuna settimana."));
    else inner.append(h("div", { class: "wdays" },
      week.days.map((d) => {
        const isToday = d.date === todayIso;
        const dd = new Date(d.date + "T00:00:00").getDate();
        const meals = ["colazione", "pranzo", "merenda", "cena"]
          .map((s) => { const b = blocks[d.selection[s]]; const f = b && foods[b.items[0].food]; return (f && f.emoji) || "·"; }).join(" ");
        return h("div", { class: "wday" + (isToday ? " today" : "") },
          h("div", { class: "wdate" },
            h("span", { class: "dow" }, DOW_SHORT[d.dow]),
            h("span", { class: "num" }, dd)),
          h("div", { class: "wmeals" }, meals),
          h("span", { class: "wtype " + d.dayType.toLowerCase(),
            onClick: () => A().toggleWeekDayType && A().toggleWeekDayType(d.date) }, d.dayType),
        );
      }),
    ));

    phone.append(scroll, nav(state.route));
    overlays(state, phone);
    return phone;
  }

  // ---- vista SPESA ----
  function viewLista(state) {
    const { week, blocks, foods, prefs } = state;
    const phone = h("div", { class: "phone theme-magenta" });
    const scroll = h("div", { class: "screen" }, h("div", { class: "scroll" }));
    const inner = scroll.firstChild;
    inner.append(h("div", { class: "head" }, h("h1", {}, "SPESA")));

    // ricostruisco i giorni risolti col solver, poi aggrego
    const SOLVER = window.MB_SOLVER;
    const days = week ? week.days.map((d) =>
      SOLVER.solveDay({ dayType: d.dayType, foods, blocks, prefs, selection: d.selection })) : [];
    const byCat = SOLVER.buildShoppingList(days, foods);
    const CAT_LABEL = { carb: "Carboidrati", protein: "Proteine", fat: "Grassi", fruit: "Frutta", extra: "Extra" };

    if (!Object.keys(byCat).length) inner.append(h("div", { class: "boot", style: { color: "var(--ink)", opacity: .6 } }, "Genera prima la settimana."));
    else inner.append(h("div", { class: "shop" },
      ["carb", "protein", "fat", "fruit", "extra"].filter((c) => byCat[c]).map((cat) =>
        h("div", { class: "shopcat glass" },
          h("div", { class: "shophead" }, CAT_LABEL[cat] || cat),
          byCat[cat].sort((a, b) => a.label.localeCompare(b.label)).map((row) =>
            h("div", { class: "shoprow" },
              h("span", { class: "em" }, (foods[row.food] || {}).emoji || "·"),
              h("span", { class: "nm" }, row.label),
              h("span", { class: "amt" }, row.display))),
        )),
    ));

    phone.append(scroll, nav(state.route));
    overlays(state, phone);
    return phone;
  }

  // ---- placeholder altre viste ----
  function viewStub(label) {
    return (state) => {
      const phone = h("div", { class: "phone theme-magenta" });
      phone.append(
        h("div", { class: "screen" }, h("div", { class: "scroll" },
          h("div", { class: "head" }, h("h1", {}, label)),
          h("div", { style: { padding: "40px 24px", color: "var(--mut)", fontWeight: 600 } }, "In arrivo."))),
        nav(state.route));
      return phone;
    };
  }

  window.MB_VIEWS = {
    oggi: viewOggi,
    settimana: viewSettimana,
    lista: viewLista,
    profilo: viewStub("PROFILO"),
    activeSlot,
  };
})();

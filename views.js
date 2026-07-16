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
  // long-press helper: tenere premuto ~450ms scatena fn (tap normale escluso)
  function longPress(el, fn) {
    let t = null, fired = false;
    const start = (e) => { fired = false; t = setTimeout(() => { fired = true; fn(e); }, 450); };
    const cancel = () => { clearTimeout(t); t = null; };
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("pointermove", cancel); // scroll = non è un long-press
    // dopo un long-press, il click successivo va soppresso (non apre/chiude)
    el.addEventListener("click", (e) => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
    return el;
  }

  function mealCard(block, state, foods, open, editing) {
    const slot = block.slot;
    const emoji = (foods[block.items[0] && block.items[0].food] || {}).emoji || "🍽️";
    const glass = state === "active" ? "glass-active" : "glass";
    const done = state === "done";
    const card = h("div", { class: "card " + glass + (open ? " open" : "") + (done ? " done" : "") + (editing ? " editing" : ""),
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
          const k = (it.grams || 0) / 100;
          const cpf = h("span", { class: "cpf" },
            h("b", { class: "c" }, "C " + Math.round((f.carbs || 0) * k)),
            h("b", { class: "p" }, "P " + Math.round((f.protein || 0) * k)),
            h("b", { class: "f" }, "F " + Math.round((f.fat || 0) * k)));
          if (!editing) return h("div", { class: "food" },
            h("span", { class: "dot" }),
            h("span", { class: "fn" }, f.label || it.food, cpf),
            h("span", { class: "fg" }, it.grams != null ? it.grams + " g" : ""),
          );
          // modalità modifica (long-press): +/−1g, grammatura tappabile, X
          return h("div", { class: "food edit", onClick: (e) => e.stopPropagation() },
            h("span", { class: "fn" }, f.label || it.food),
            h("button", { class: "stpb", onClick: () => A().nudgeGrams(slot, it.food, -1) }, "−"),
            h("span", { class: "fg tap", title: "Grammatura precisa",
              onClick: () => A().promptGrams(slot, it.food, it.grams || 0) }, (it.grams || 0) + " g"),
            h("button", { class: "stpb", onClick: () => A().nudgeGrams(slot, it.food, +1) }, "+"),
            h("button", { class: "stpb x", onClick: () => A().removeFoodFromMeal(slot, it.food) }, icon("x", 15, 2.6)),
          );
        }),
        // in modifica: riga vuota col + per aggiungere un alimento
        editing && h("div", { class: "food addrow", onClick: (e) => { e.stopPropagation(); A().openFoodPicker(slot); } },
          h("span", { class: "fn", style: { opacity: .45 } }, ""),
          h("button", { class: "stpb add" }, icon("plus", 17, 2.6)),
        ),
      ),
    );
    // long-press sulla card aperta (non fatta) = entra/esce dalla modifica
    if (open && !done) longPress(card, () => A().toggleEditMeal(slot));
    return card;
  }

  // ---- timeline (righe rail+card) ----
  function timeline(day, foods, openSlots, editingSlot) {
    const rows = day.blocks.map((b, i) => {
      const st = b.state || "future";
      return h("div", { class: "row " + st },
        h("div", { class: "rail" }, h("div", { class: "node" })),
        mealCard(b, st, foods, openSlots.has(b.slot), editingSlot === b.slot),
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
      ["profilo", "layout-grid", "GESTIONE"],
    ];
    return h("nav", { class: "glass" },
      items.map(([r, ic, lab]) =>
        h("button", { class: r === route ? "on" : "", onClick: () => A().go && A().go(r) },
          icon(ic, 21, r === route ? 2.4 : 2), h("span", {}, lab))),
    );
  }

  // ---- modal CENTRALE: scegli un alimento da aggiungere al pasto ----
  function foodPickerModal(state) {
    const sh = state.sheet;
    if (!sh || sh.type !== "picker") return null;
    const { foods } = state;
    const slot = sh.slot;
    const close = () => A().closeSheet && A().closeSheet();
    const q = (sh.query || "").toLowerCase();
    const list = Object.values(foods)
      .filter((f) => !q || (f.label || "").toLowerCase().includes(q))
      .slice(0, 40);
    return [h("div", { class: "scrim", onClick: close },
      h("div", { class: "modal", onClick: (e) => e.stopPropagation() },
        h("input", { class: "search-in", placeholder: "Cerca…", value: sh.query || "", autofocus: true,
          oninput: (e) => A().setSheetQuery(e.target.value) }),
        h("div", { class: "mlist" },
          list.map((f) => h("div", { class: "srow", onClick: () => A().addFoodToMeal(slot, f.id) },
            h("span", { class: "em" }, f.emoji || "🍽️"),
            h("span", { class: "nm" }, f.label),
            h("span", { class: "kc" }, f.kcal + " kcal")))),
      ))];
  }

  // ---- modal CENTRALE: grammatura precisa ----
  function gramsModal(state) {
    const sh = state.sheet;
    if (!sh || sh.type !== "grams") return null;
    const f = state.foods[sh.food] || {};
    const close = () => A().closeSheet && A().closeSheet();
    return [h("div", { class: "scrim", onClick: close },
      h("div", { class: "modal gmodal", onClick: (e) => e.stopPropagation() },
        h("div", { class: "gname" }, f.label || sh.food),
        h("div", { class: "ginput" },
          h("input", { class: "gnum", type: "number", inputMode: "numeric", min: "0", step: "1",
            value: sh.value, autofocus: true,
            oninput: (e) => A().setGramsValue(e.target.value),
            onkeydown: (e) => { if (e.key === "Enter") A().confirmGrams(); } }),
          h("span", { class: "gunit" }, "g")),
        h("button", { class: "go", onClick: () => A().confirmGrams() }, icon("check", 18, 2.6)),
      ))];
  }

  // ---- modal CENTRALE: scegli il blocco per una fascia di un giorno ----
  function blockPickerModal(state) {
    const sh = state.sheet;
    if (!sh || sh.type !== "blockpicker") return null;
    const { blocks, foods } = state;
    const close = () => A().closeSheet && A().closeSheet();
    const list = Object.values(blocks).filter((b) => b.slot === sh.slot && b.enabled !== false);
    return [h("div", { class: "scrim", onClick: close },
      h("div", { class: "modal", onClick: (e) => e.stopPropagation() },
        h("div", { class: "mlist" },
          list.map((b) => {
            const f = foods[b.items[0] && b.items[0].food];
            const current = sh.current === b.id;
            return h("div", { class: "srow" + (current ? " cur" : ""), onClick: () => A().setDayBlock(sh.date, sh.slot, b.id) },
              h("span", { class: "em" }, (f && f.emoji) || "🍽️"),
              h("span", { class: "nm" }, b.label),
              current && h("span", { class: "kc" }, icon("check", 16, 2.6)));
          })),
      ))];
  }

  // ---- modal CENTRALE: modifica/nuovo alimento ----
  function foodEditModal(state) {
    const sh = state.sheet;
    if (!sh || sh.type !== "foodedit") return null;
    const d = sh.draft;
    const close = () => A().closeSheet && A().closeSheet();
    const num = (label, key) => h("label", { class: "fld" },
      h("span", {}, label),
      h("input", { type: "number", inputMode: "decimal", value: d[key] ?? "",
        oninput: (e) => A().setDraft({ [key]: e.target.value }) }));
    return [h("div", { class: "scrim", onClick: close },
      h("div", { class: "modal emodal", onClick: (e) => e.stopPropagation() },
        h("div", { class: "erow" },
          h("input", { class: "fld emoji", value: d.emoji || "", placeholder: "🍽️",
            oninput: (e) => A().setDraft({ emoji: e.target.value }) }),
          h("input", { class: "fld grow", value: d.label, placeholder: "Nome",
            oninput: (e) => A().setDraft({ label: e.target.value }) })),
        h("div", { class: "erow four" }, num("kcal", "kcal"), num("C", "carbs"), num("P", "protein"), num("F", "fat")),
        h("div", { class: "erow" },
          h("div", { class: "seg" },
            h("button", { class: d.kind === "sfuso" ? "on" : "", onClick: () => A().setDraft({ kind: "sfuso" }) }, "sfuso"),
            h("button", { class: d.kind === "fisso" ? "on" : "", onClick: () => A().setDraft({ kind: "fisso" }) }, "fisso"))),
        d.kind === "sfuso"
          ? h("div", { class: "erow two" }, num("min g", "rangeMin"), num("max g", "rangeMax"))
          : h("div", { class: "erow two" }, num("g fissi", "fixed")),
        h("button", { class: "go", onClick: () => A().saveDraft() }, icon("check", 18, 2.6)),
      ))];
  }

  // ---- modal CENTRALE: modifica/nuovo blocco ----
  function blockEditModal(state) {
    const sh = state.sheet;
    if (!sh || sh.type !== "blockedit") return null;
    const d = sh.draft;
    const { foods } = state;
    const close = () => A().closeSheet && A().closeSheet();
    return [h("div", { class: "scrim", onClick: close },
      h("div", { class: "modal emodal", onClick: (e) => e.stopPropagation() },
        h("input", { class: "fld grow", value: d.label, placeholder: "Nome blocco",
          oninput: (e) => A().setDraft({ label: e.target.value }) }),
        h("div", { class: "seg four" },
          ["colazione", "pranzo", "merenda", "cena"].map((s) =>
            h("button", { class: d.slot === s ? "on" : "", onClick: () => A().setDraft({ slot: s }) }, SLOT_NAME[s].slice(0, 3)))),
        h("div", { class: "mlist" },
          (d.items || []).map((it, idx) => h("div", { class: "srow" },
            h("span", { class: "em" }, (foods[it.food] || {}).emoji || "🍽️"),
            h("span", { class: "nm" }, (foods[it.food] || {}).label || it.food),
            h("button", { class: "stpb x", onClick: () => A().setDraft({ items: d.items.filter((_, i) => i !== idx) }) }, icon("x", 14, 2.6)))),
          // aggiungi alimento al blocco: mini-picker inline
          h("select", { class: "fld grow", onchange: (e) => { if (e.target.value) { A().setDraft({ items: (d.items || []).concat([{ food: e.target.value }]) }); e.target.value = ""; } } },
            h("option", { value: "" }, "+ alimento…"),
            Object.values(foods).sort((a, b) => a.label.localeCompare(b.label)).map((f) =>
              h("option", { value: f.id }, f.label))),
        ),
        h("button", { class: "go", onClick: () => A().saveDraft() }, icon("check", 18, 2.6)),
      ))];
  }

  // ---- modal CENTRALE: componi settimana con AI ----
  function aiModal(state) {
    const sh = state.sheet;
    if (!sh || sh.type !== "ai") return null;
    const close = () => A().closeSheet && A().closeSheet();
    const busy = state.aiBusy;
    return [h("div", { class: "scrim", onClick: busy ? () => {} : close },
      h("div", { class: "modal", onClick: (e) => e.stopPropagation() },
        h("textarea", { class: "field", rows: 3, disabled: busy,
          placeholder: "Es. settimana senza latticini, stanco della pasta…",
          oninput: (e) => A().setSheetText(e.target.value) }, sh.text || ""),
        h("button", { class: "go", disabled: busy,
          onClick: () => A().aiComposeWeek(sh.text || "") },
          icon("sparkles", 18, 2.2), busy ? "Compongo…" : "Componi la settimana"),
      ))];
  }

  // overlay comuni (modal + toast) da appendere a ogni vista
  function overlays(state, phone) {
    const pk = foodPickerModal(state); if (pk) phone.append(...pk);
    const bp = blockPickerModal(state); if (bp) phone.append(...bp);
    const gm = gramsModal(state); if (gm) phone.append(...gm);
    const fe = foodEditModal(state); if (fe) phone.append(...fe);
    const be = blockEditModal(state); if (be) phone.append(...be);
    const ai = aiModal(state); if (ai) phone.append(...ai);
    if (state.toast) phone.append(h("div", { class: "toast" }, state.toast));
  }

  // ---- vista OGGI ----
  function viewOggi(state) {
    const { today, foods, prefs } = state;
    // tinta fissa: la fascia attiva si riconosce dalla card, non dal colore schermo
    const phone = h("div", { class: "phone theme-magenta" });

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
      // le barre mostrano il MANGIATO (pasti spuntati) vs target
      inner.append(calbox(today.eaten || { kcal: 0, protein: 0, carbs: 0, fat: 0 }, today.target));
      inner.append(timeline(today, foods, state.openSlots || new Set(), state.editingSlot));
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
    const todayIso = window.MB_WEEK.iso(new Date());

    inner.append(h("div", { class: "head" },
      h("h1", {}, "SETTIMANA"),
      h("div", { class: "spacer" }),
      h("button", { class: "icobtn", title: "Componi con AI", onClick: () => A().openAiWeek && A().openAiWeek() }, icon("sparkles", 19, 2.2)),
      h("button", { class: "icobtn", title: "Rigenera", onClick: () => A().regenerateWeek && A().regenerateWeek() }, icon("refresh-cw", 19, 2.2)),
    ));

    if (!week) inner.append(h("div", { class: "boot", style: { color: "var(--ink)", opacity: .6 } }, "Nessuna settimana."));
    else {
      const SOLVER = window.MB_SOLVER;
      inner.append(h("div", { class: "wdays" },
        week.days.map((d) => {
          const isToday = d.date === todayIso;
          const dd = new Date(d.date + "T00:00:00").getDate();
          // risolvo il giorno per mostrare il CONTENUTO vero (alimenti + grammi)
          const solved = SOLVER.solveDay({ dayType: d.dayType, foods, blocks, prefs: state.prefs, selection: d.selection });
          return h("div", { class: "wday" + (isToday ? " today" : "") },
            // intestazione: giorno + ON/OFF
            h("div", { class: "wrow" },
              h("div", { class: "wdate" },
                h("span", { class: "dow" }, DOW_SHORT[d.dow]),
                h("span", { class: "num" }, dd)),
              h("div", { class: "spacer" }),
              h("span", { class: "wtype " + d.dayType.toLowerCase(),
                onClick: () => A().toggleWeekDayType && A().toggleWeekDayType(d.date) }, d.dayType),
            ),
            // tutto visibile: per ogni fascia, gli alimenti con grammatura
            h("div", { class: "wfoods open" },
              ["colazione", "pranzo", "merenda", "cena"].map((s) => {
                const mb = solved.blocks.find((b) => b.slot === s);
                if (!mb) return null;
                return h("div", { class: "wslot", onClick: () => A().openBlockPicker(d.date, s) },
                  h("span", { class: "ws" }, SLOT_NAME[s]),
                  h("div", { class: "witems" },
                    mb.items.map((it) => {
                      const f = foods[it.food] || {};
                      return h("div", { class: "witem" },
                        h("span", { class: "wn" }, f.label || it.food),
                        h("span", { class: "wg" }, (it.grams || 0) + " g"));
                    })),
                );
              })),
          );
        }),
      ));
    }

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

  // ---- vista GESTIONE (alimenti + blocchi + target) ----
  function viewGestione(state) {
    const { foods, blocks, prefs } = state;
    const phone = h("div", { class: "phone theme-magenta" });
    const scroll = h("div", { class: "screen" }, h("div", { class: "scroll" }));
    const inner = scroll.firstChild;
    const tab = state.gestTab || "alimenti";

    inner.append(h("div", { class: "head" },
      h("h1", {}, tab.toUpperCase()),
      h("div", { class: "spacer" }),
      h("button", { class: "icobtn", title: "Nuovo", onClick: () => A().newEntity && A().newEntity(tab) }, icon("plus", 20, 2.4)),
    ));

    // switch ALIMENTI / BLOCCHI
    inner.append(h("div", { class: "gtabs" },
      [["alimenti", "Alimenti"], ["blocchi", "Blocchi"]].map(([t, lab]) =>
        h("button", { class: t === tab ? "on" : "", onClick: () => A().setGestTab(t) }, lab))));

    if (tab === "alimenti") {
      const list = Object.values(foods).sort((a, b) => (a.label || "").localeCompare(b.label || ""));
      inner.append(h("div", { class: "glist" },
        list.map((f) => h("div", { class: "gitem glass", onClick: () => A().editFood(f.id) },
          h("span", { class: "gem" }, f.emoji || "🍽️"),
          h("div", { class: "gmain" },
            h("span", { class: "gname2" }, f.label),
            h("span", { class: "gsub" },
              f.kcal + " kcal · C" + f.carbs + " P" + f.protein + " F" + f.fat,
            )),
          h("span", { class: "gkind" }, f.kind === "fisso" ? (f.fixed + " g") : (f.rangeMin + "–" + f.rangeMax)),
        ))));
    } else {
      const SLOTS = ["colazione", "pranzo", "merenda", "cena"];
      inner.append(h("div", { class: "glist" },
        SLOTS.map((s) => [
          h("div", { class: "gslot" }, SLOT_NAME[s]),
          Object.values(blocks).filter((b) => b.slot === s).map((b) =>
            h("div", { class: "gitem glass" + (b.enabled === false ? " off" : ""), onClick: () => A().editBlock(b.id) },
              h("div", { class: "gmain" },
                h("span", { class: "gname2" }, b.label),
                h("span", { class: "gsub" }, b.items.map((it) => (foods[it.food] || {}).label || it.food).join(" · "))),
              h("span", { class: "gtoggle" + (b.enabled === false ? "" : " on"),
                onClick: (e) => { e.stopPropagation(); A().toggleBlockEnabled(b.id); } }),
            )),
        ].flat())));
    }

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
    profilo: viewGestione,
    activeSlot,
  };
})();

// ============================================================
//  MealBlock — APP (UI layer)
//  Lega l'engine al DOM + localStorage. Nessun calcolo macro qui.
// ============================================================
(function () {
  "use strict";
  const E = window.MB_ENGINE;
  const SEED = window.MB_SEED;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ---- meal slot icons (soft-filled) ----
  const SLOT_ICON = {
    colazione: `<svg width="22" height="22" viewBox="0 0 26 26"><circle cx="13" cy="14" r="7" fill="#e8b85a"/><circle cx="13" cy="14" r="3.5" fill="#f5d98a"/><path d="M13 3 v3 M6 6 l2 2 M20 6 l-2 2" stroke="#e8b85a" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    pranzo: `<svg width="22" height="22" viewBox="0 0 26 26"><path d="M6 16 q0 -7 7 -7 q7 0 7 7z" fill="#7bd88f"/><ellipse cx="13" cy="16" rx="8" ry="2" fill="#cfe7d6"/><path d="M11 9 q1 -3 2 0 M13 9 q1 -3 2 0" stroke="#cfe7d6" stroke-width="1.2" fill="none"/></svg>`,
    merenda: `<svg width="22" height="22" viewBox="0 0 26 26"><path d="M7 9 h12 l-1.5 11 a2 2 0 0 1 -2 1.8 h-5 a2 2 0 0 1 -2 -1.8z" fill="#7bb8d8"/><rect x="6" y="7" width="14" height="2.5" rx="1.2" fill="#a8d4e8"/></svg>`,
    cena: `<svg width="22" height="22" viewBox="0 0 26 26"><path d="M13 4 c5 0 8 4 8 9 c0 4 -3 8 -8 8 c-5 0 -8 -4 -8 -8 c0 -5 3 -9 8 -9z" fill="#b08d5a"/><ellipse cx="13" cy="12" rx="4.5" ry="3.5" fill="#d8b483"/></svg>`,
  };
  const SLOT_ORDER = ["colazione", "pranzo", "merenda", "cena"];
  const SLOT_LABEL = { colazione: "Colazione", pranzo: "Pranzo", merenda: "Merenda", cena: "Cena" };
  const DAYS_IT = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const RING_COLOR = { protein: "var(--pro)", carbs: "var(--carb)", fat: "var(--fat)", kcal: "var(--kcal)" };
  const RING_LABEL = { protein: "Pro", carbs: "Carb", fat: "Fat", kcal: "Kcal" };

  // ============================================================
  //  STORAGE
  // ============================================================
  const LS = {
    get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  // foods: vivo (seed + modifiche). Inizializza al primo avvio.
  let FOODS = LS.get("mb_foods", null);
  if (!FOODS) { FOODS = structuredClone(SEED.FOODS); LS.set("mb_foods", FOODS); }

  let settings = LS.get("mb_settings", { onDays: SEED.DEFAULT_ON_DAYS.slice() });

  // data bundle passato all'engine
  function data() {
    return {
      FOODS, BLOCKS: SEED.BLOCKS, BLOCK_OPTIONS: SEED.BLOCK_OPTIONS,
      TARGETS: SEED.TARGETS, TOLERANCE: SEED.TOLERANCE, SOLVER_WEIGHTS: SEED.SOLVER_WEIGHTS,
    };
  }

  // currentDay: { dayType, blocks:[{slot,blockId,label,items,done}], date }
  let currentDay = LS.get("mb_currentDay", null);
  let week = LS.get("mb_week", null);
  let shopChecks = LS.get("mb_shopChecks", {});

  function saveDay() { LS.set("mb_currentDay", currentDay); }
  function saveWeek() { LS.set("mb_week", week); }

  // ============================================================
  //  DAY MODEL
  // ============================================================
  // selezione di default DETERMINISTICA: combinazione ottimizzata che
  // centra meglio i target (vedi spec §4). La casualità è solo per "rigenera".
  const DEFAULT_SEL = { pranzo: "lunch_C", cena: "dinner_A" };
  function defaultSelection() { return { ...DEFAULT_SEL }; }
  function randomSelection() {
    return { pranzo: pick(SEED.BLOCK_OPTIONS.pranzo), cena: pick(SEED.BLOCK_OPTIONS.cena) };
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function buildDay(dayType, selection, frozenMap) {
    const gen = E.generateDay({ dayType, selection: selection || defaultSelection(), frozen: frozenMap || {}, data: data() });
    // marca done sui blocchi (default false, true se erano frozen passati)
    const blocks = gen.blocks
      .filter((b) => b.blockId !== "work_snack") // worksnack gestito a parte (snackbar)
      .map((b) => ({ ...b, done: !!(frozenMap && frozenMap[b.slot]) }));
    return { dayType, blocks, gen, date: todayKey() };
  }

  function todayKey() { const d = new Date(); return d.toISOString().slice(0, 10); }

  // ricalcola i totali/gap/status del currentDay rispettando i blocchi done
  function recalc() {
    const frozen = {};
    for (const b of currentDay.blocks) {
      if (b.done) frozen[b.slot] = { blockId: b.blockId, label: b.label, items: b.items };
    }
    const selection = {};
    for (const b of currentDay.blocks) if (!b.done) selection[b.slot] = b.blockId;
    const fresh = buildDay(currentDay.dayType, selection, frozen);
    // mantieni l'ordine e lo stato done; sostituisci items ricalcolati per i non-done
    const map = {}; fresh.blocks.forEach((b) => (map[b.slot] = b));
    currentDay.blocks.forEach((b) => {
      if (!b.done && map[b.slot]) b.items = map[b.slot].items;
    });
    currentDay.gen = fresh.gen;
    saveDay();
  }

  function ensureToday() {
    if (!currentDay || currentDay.date !== todayKey()) {
      const dt = onTypeForDate(new Date());
      currentDay = buildDay(dt);
      saveDay();
    }
  }
  function onTypeForDate(d) { return settings.onDays.includes(d.getDay()) ? "ON" : "OFF"; }

  // ============================================================
  //  RENDER: OGGI
  // ============================================================
  function renderHeader() {
    const d = new Date();
    $("#hsub").textContent = `${DAYS_IT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
    $("#htitle").innerHTML = `Oggi <em>· ${currentDay.dayType}</em>`;
    const tg = $("#dayToggle"); tg.hidden = false;
    $$("#dayToggle button").forEach((b) => b.classList.toggle("on", b.dataset.type === currentDay.dayType));
  }

  function renderRings() {
    const t = currentDay.gen.totals, st = currentDay.gen.status, tgt = currentDay.gen.target;
    const order = ["protein", "carbs", "fat", "kcal"];
    $("#rings").innerHTML = order.map((m) => {
      const v = t[m], target = tgt[m];
      const pct = Math.max(0, Math.min(1, v / target));
      const C = 2 * Math.PI * 24; // circonferenza r=24
      const off = C * (1 - pct);
      const stt = st[m].state;
      const cls = stt === "over" ? "over" : stt === "under" ? "under" : "";
      const col = stt === "over" ? "var(--warn)" : RING_COLOR[m];
      const arrow = stt === "over" ? " ▲" : stt === "under" ? " ▾" : "";
      const numFs = m === "kcal" ? "font-size:13px" : "";
      return `<div class="ring ${cls}">
        <div class="ringwrap">
          <svg viewBox="0 0 56 56"><circle class="track" cx="28" cy="28" r="24"/>
            <circle class="prog" cx="28" cy="28" r="24" stroke="${col}" stroke-dasharray="${C}" stroke-dashoffset="${off}"/></svg>
          <b style="${numFs}">${Math.round(v)}</b>
        </div>
        <span class="lab">${RING_LABEL[m]}${arrow}</span>
        <span class="sub">/ ${target}${m === "kcal" ? "" : "g"}</span>
      </div>`;
    }).join("");
  }

  function renderSnack() {
    const ws = SEED.BLOCKS.work_snack;
    const m = E.calcMacros(ws.items, FOODS);
    const f = FOODS[ws.items[0].food];
    const n = f.unit ? Math.round(ws.items[0].grams / f.unit.portion) : "";
    $("#snackbar").innerHTML = `<span>Work snack · <b>${f.label}</b></span>
      <span class="r">${n} ${f.unit ? f.unit.label : ""} · ${m.kcal} kcal</span>`;
  }

  function foodLine(it) {
    const f = FOODS[it.food];
    const label = f ? f.label : it.food;
    let amt;
    if (f && f.unit) { const n = Math.round(it.grams / f.unit.portion); amt = `${n} ${f.unit.label}`; }
    else amt = `${it.grams}g`;
    return `<div class="food" data-food="${it.food}"><span class="nm">${label}</span><span class="g">${amt}</span></div>`;
  }

  function renderGrid() {
    const html = SLOT_ORDER.map((slot) => {
      const b = currentDay.blocks.find((x) => x.slot === slot);
      if (!b) return "";
      return `<div class="cell ${b.done ? "done" : ""}" data-slot="${slot}">
        <h3><span class="micon">${SLOT_ICON[slot]}</span>${SLOT_LABEL[slot]}
          <button class="flag" data-flag="${slot}" title="Segna come fatto"></button></h3>
        <div class="foods">${b.items.map(foodLine).join("")}</div>
        <button class="change" data-change="${slot}">Cambia / aggiusta</button>
      </div>`;
    }).join("");
    $("#mealGrid").innerHTML = html;
  }

  function renderGapNote() {
    const st = currentDay.gen.status;
    const slot = $("#gapnote-slot");
    if (st.inTarget) { slot.innerHTML = ""; return; }
    const off = [];
    for (const m of ["protein", "carbs", "fat", "kcal"]) {
      if (st[m].state !== "ok") {
        const d = st[m].diff;
        off.push(`${RING_LABEL[m]} ${d > 0 ? "+" : ""}${Math.round(d)}${m === "kcal" ? "" : "g"}`);
      }
    }
    slot.innerHTML = `<div class="gapnote"><span>Fuori target: ${off.join(", ")}</span>
      <button class="btn primary sm" id="fixDayBtn">Proposte</button></div>`;
    $("#fixDayBtn").onclick = openDayFix;
  }

  function renderPrep() {
    const slot = $("#prep-slot");
    const dow = new Date().getDay(); // 0 Dom..6 Sab
    const cena = currentDay.blocks.find((b) => b.slot === "cena");
    // mostra solo dom(0)-gio(4), cena fatta
    if (!cena || !cena.done || dow === 5 || dow === 6) { slot.innerHTML = ""; return; }
    const tomorrow = nextDay();
    const lunch = tomorrow.blocks.find((b) => b.slot === "pranzo");
    slot.innerHTML = `<div class="pad" style="padding:0 16px 20px">
      <div class="blockcard" style="margin:0">
        <h4>🍱 Prep per domani <span class="slot">${tomorrow.dayType}</span></h4>
        <div style="font-size:12px;color:var(--dim);margin-bottom:8px">${DAYS_IT[(dow + 1) % 7]} · pranzo da preparare</div>
        ${lunch.items.map(foodLine).join("")}
        <button class="btn ghost sm" id="prepExpand" style="width:100%;margin-top:10px">Vedi giornata intera</button>
      </div></div>`;
    $("#prepExpand").onclick = () => openPrepFull(tomorrow);
  }

  function nextDay() {
    // usa la settimana se esiste, altrimenti genera al volo
    const d = new Date(); d.setDate(d.getDate() + 1);
    if (week) {
      const wd = week.days.find((x) => x.dow === d.getDay());
      if (wd) return wd;
    }
    return buildDay(onTypeForDate(d));
  }

  function renderOggi() {
    ensureToday();
    renderHeader(); renderRings(); renderSnack(); renderGapNote(); renderGrid(); renderPrep();
  }

  // ============================================================
  //  INTERACTIONS: OGGI
  // ============================================================
  function onGridClick(e) {
    const flag = e.target.closest("[data-flag]");
    if (flag) { toggleDone(flag.dataset.flag); return; }
    const change = e.target.closest("[data-change]");
    if (change) { openBlockEditor(change.dataset.change); return; }
    const food = e.target.closest(".food");
    if (food) { const slot = food.closest(".cell").dataset.slot; openFoodAdjust(slot, food.dataset.food); }
  }

  function toggleDone(slot) {
    const b = currentDay.blocks.find((x) => x.slot === slot);
    b.done = !b.done;
    recalc();
    renderOggi();
  }

  function switchDayType(type) {
    if (currentDay.dayType === type) return;
    currentDay.dayType = type;
    recalc();
    renderOggi();
  }

  function regen() {
    const keepDone = {};
    currentDay.blocks.forEach((b) => { if (b.done) keepDone[b.slot] = { blockId: b.blockId, label: b.label, items: b.items }; });
    const sel = randomSelection();
    currentDay = buildDay(currentDay.dayType, sel, keepDone);
    saveDay(); renderOggi();
  }

  // ---- block editor (cambia opzione blocco) ----
  function openBlockEditor(slot) {
    const b = currentDay.blocks.find((x) => x.slot === slot);
    const opts = SEED.BLOCK_OPTIONS[slot] || [];
    const body = `<h3>${SLOT_LABEL[slot]}</h3><div class="hint">Scegli un'opzione o aggiusta gli alimenti.</div>
      ${opts.map((id) => `<div class="prop ${id === b.blockId ? "best" : ""}" data-pick="${id}">
        <div class="pt"><span class="pn">${SEED.BLOCKS[id].label}</span>${id === b.blockId ? '<span class="badge">attuale</span>' : ""}</div>
      </div>`).join("")}
      <label>Oppure aggiusta un alimento</label>
      ${b.items.map((it) => `<div class="prop" data-adjust="${it.food}"><div class="pt"><span class="pn">${FOODS[it.food]?.label || it.food}</span><span class="pg">${it.grams}g ›</span></div></div>`).join("")}
      <div class="actions"><button class="btn ghost" data-close>Chiudi</button></div>`;
    openSheet(body, (sh) => {
      $$("[data-pick]", sh).forEach((el) => el.onclick = () => {
        b.blockId = el.dataset.pick; b.label = SEED.BLOCKS[el.dataset.pick].label;
        recalc(); closeSheet(); renderOggi();
      });
      $$("[data-adjust]", sh).forEach((el) => el.onclick = () => { closeSheet(); openFoodAdjust(slot, el.dataset.adjust); });
    });
  }

  // ---- food adjust + Top-3 substitution ----
  function openFoodAdjust(slot, food) {
    const b = currentDay.blocks.find((x) => x.slot === slot);
    const it = b.items.find((x) => x.food === food);
    if (!it) return;
    const f = FOODS[food];
    const body = `<h3>${f.label}</h3><div class="hint">${SLOT_LABEL[slot]} · cambia la grammatura</div>
      <label>Grammi</label>
      <input type="number" id="gInput" value="${it.grams}" min="0" step="5">
      <div id="subSlot"></div>
      <div class="actions">
        <button class="btn ghost" data-close>Annulla</button>
        <button class="btn primary" id="applyG">Applica</button>
      </div>`;
    openSheet(body, (sh) => {
      const input = $("#gInput", sh);
      const recompute = () => {
        const tmp = b.items.map((x) => x.food === food ? { ...x, grams: +input.value || 0 } : x);
        const target = perBlockTarget(slot);
        const sub = E.solveSubstitution({ items: tmp, target, data: data() });
        $("#subSlot", sh).innerHTML = renderProposals(sub.top3, "Per compensare aggiungi:");
        $$("[data-prop]", sh).forEach((el) => el.onclick = () => {
          const pid = el.dataset.prop, grams = +el.dataset.grams;
          // applica modifica grammatura + aggiungi/aggiorna l'alimento proposto
          it.grams = +input.value || 0;
          const ex = b.items.find((x) => x.food === pid);
          if (ex) ex.grams += grams; else b.items.push({ food: pid, grams });
          recalc(); closeSheet(); renderOggi();
        });
      };
      input.oninput = recompute; recompute();
      $("#applyG", sh).onclick = () => { it.grams = +input.value || 0; recalc(); closeSheet(); renderOggi(); };
    });
  }

  // target "ideale" per un singolo blocco = quota proporzionale del giorno
  function perBlockTarget(slot) {
    const tgt = currentDay.gen.target;
    // ripartizione semplice: pranzo/cena ~30% ciascuno, colazione 25%, merenda 15%
    const share = { colazione: 0.25, pranzo: 0.30, merenda: 0.15, cena: 0.30 }[slot] || 0.25;
    return { kcal: Math.round(tgt.kcal * share), protein: Math.round(tgt.protein * share),
             carbs: Math.round(tgt.carbs * share), fat: Math.round(tgt.fat * share) };
  }

  function renderProposals(top3, title) {
    if (!top3 || !top3.length) return "";
    return `<label>${title}</label>` + top3.map((s, i) => `
      <div class="prop ${i === 0 ? "best" : ""}" data-prop="${s.food}" data-grams="${s.grams}">
        <div class="pt"><span class="pn">${s.label}${i === 0 ? '<span class="badge">top</span>' : ""}</span>
          <span class="pg">+${s.grams}g</span></div>
        <div class="pd">→ ${s.result.kcal}kcal · P${Math.round(s.result.protein)} C${Math.round(s.result.carbs)} F${Math.round(s.result.fat)}</div>
      </div>`).join("");
  }

  function openDayFix() {
    const gap = E.diffMacros(currentDay.gen.target, currentDay.gen.totals);
    const top3 = E.solveGap({ gap, data: data() });
    const offTxt = ["protein", "carbs", "fat", "kcal"].filter((m) => currentDay.gen.status[m].state !== "ok")
      .map((m) => `${RING_LABEL[m]} ${gap[m] > 0 ? "+" : ""}${Math.round(gap[m])}${m === "kcal" ? "" : "g"}`).join(", ");
    const body = `<h3>Chiudi il gap</h3><div class="hint">Manca: ${offTxt}. Scegli dove aggiungerlo (va in merenda).</div>
      <div id="dfSlot">${renderProposals(top3, "Proposte")}</div>
      <div class="actions"><button class="btn ghost" data-close>Chiudi</button></div>`;
    openSheet(body, (sh) => {
      $$("[data-prop]", sh).forEach((el) => el.onclick = () => {
        const pid = el.dataset.prop, grams = +el.dataset.grams;
        const mer = currentDay.blocks.find((b) => b.slot === "merenda");
        const ex = mer.items.find((x) => x.food === pid);
        if (ex) ex.grams += grams; else mer.items.push({ food: pid, grams });
        recalc(); closeSheet(); renderOggi();
      });
    });
  }

  function openPrepFull(day) {
    const body = `<h3>Domani · ${day.dayType}</h3><div class="hint">Giornata completa — puoi modificarla.</div>
      ${SLOT_ORDER.map((slot) => {
        const b = day.blocks.find((x) => x.slot === slot);
        if (!b) return "";
        return `<div class="blockcard" style="margin:0 0 10px"><h4>${SLOT_LABEL[slot]}</h4>
          ${b.items.map((it) => `<div class="bi">${FOODS[it.food]?.label || it.food} · ${it.grams}g</div>`).join("")}</div>`;
      }).join("")}
      <div class="actions"><button class="btn ghost" data-close>Chiudi</button>
        <button class="btn primary" id="gotoWeek">Apri in Settimana</button></div>`;
    openSheet(body, (sh) => { $("#gotoWeek", sh).onclick = () => { closeSheet(); go("settimana"); }; });
  }

  // ============================================================
  //  RENDER: SETTIMANA
  // ============================================================
  function genWeek() {
    const days = [];
    // parte da oggi, 7 giorni
    const base = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(base); d.setDate(base.getDate() + i);
      const dt = onTypeForDate(d);
      const day = buildDay(dt);
      day.dow = d.getDay();
      day.dateLabel = `${DAYS_IT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
      days.push(day);
    }
    week = { generated: todayKey(), days };
    saveWeek();
  }

  function renderSettimana() {
    if (!week) { $("#weekList").innerHTML = `<div class="empty">Nessuna settimana generata.<br>Premi "Genera settimana".</div>`; return; }
    $("#weekList").innerHTML = week.days.map((day, idx) => {
      const t = day.gen.totals;
      return `<div class="weekday" data-wd="${idx}">
        <div class="wh"><span class="wname">${day.dateLabel}</span>
          <span class="wtype ${day.dayType}">${day.dayType}</span>
          <span class="wmacro">${t.kcal}kcal · P${Math.round(t.protein)}</span></div>
        <div class="wbody">
          ${SLOT_ORDER.map((slot) => {
            const b = day.blocks.find((x) => x.slot === slot);
            if (!b) return "";
            return `<div class="wmeal"><span class="ws">${SLOT_LABEL[slot]}</span>
              <span>${b.label.replace(/^.*· /, "")}</span></div>`;
          }).join("")}
          <div class="row" style="margin-top:10px">
            <button class="btn ghost sm" data-wswitch="${idx}">Switch ${day.dayType === "ON" ? "OFF" : "ON"}</button>
            <button class="btn ghost sm" data-wregen="${idx}">Rigenera</button>
          </div>
        </div></div>`;
    }).join("");
    $$(".weekday .wh").forEach((h) => h.onclick = () => h.parentElement.classList.toggle("open"));
    $$("[data-wswitch]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); switchWeekDay(+b.dataset.wswitch); });
    $$("[data-wregen]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); regenWeekDay(+b.dataset.wregen); });
  }

  function switchWeekDay(idx) {
    const day = week.days[idx];
    const nt = day.dayType === "ON" ? "OFF" : "ON";
    const fresh = buildDay(nt); fresh.dow = day.dow; fresh.dateLabel = day.dateLabel;
    week.days[idx] = fresh; saveWeek(); renderSettimana();
  }
  function regenWeekDay(idx) {
    const day = week.days[idx];
    const fresh = buildDay(day.dayType); fresh.dow = day.dow; fresh.dateLabel = day.dateLabel;
    week.days[idx] = fresh; saveWeek(); renderSettimana();
  }

  // ============================================================
  //  RENDER: SPESA
  // ============================================================
  function renderSpesa() {
    if (!week) { $("#shopList").innerHTML = `<div class="empty">Genera prima una settimana.</div>`; $("#shopMeta").textContent = ""; return; }
    const list = E.buildShoppingList(week.days, data());
    $("#shopMeta").textContent = `· settimana del ${week.generated}`;
    const catLabel = { protein: "Proteine", carb: "Carboidrati", fat: "Grassi", fruit: "Frutta", extra: "Extra", altro: "Altro" };
    const order = ["protein", "carb", "fat", "fruit", "extra", "altro"];
    let html = "";
    for (const cat of order) {
      if (!list[cat]) continue;
      html += `<div class="shop-cat">${catLabel[cat] || cat}</div>`;
      html += list[cat].map((x) => {
        const key = x.food, on = shopChecks[key];
        return `<div class="shop-item ${on ? "checked" : ""}" data-shop="${key}">
          <span class="chk"></span><span class="nm">${x.label}</span><span class="amt">${x.display}</span></div>`;
      }).join("");
    }
    $("#shopList").innerHTML = html || `<div class="empty">Lista vuota.</div>`;
    $$("[data-shop]").forEach((el) => el.onclick = () => {
      const k = el.dataset.shop; shopChecks[k] = !shopChecks[k]; LS.set("mb_shopChecks", shopChecks);
      el.classList.toggle("checked");
    });
  }

  // ============================================================
  //  RENDER: ALIMENTI
  // ============================================================
  function renderFoods() {
    const ids = Object.keys(FOODS).sort((a, b) => (FOODS[a].label || a).localeCompare(FOODS[b].label || b));
    $("#foodList").innerHTML = ids.map((id) => {
      const f = FOODS[id];
      return `<div class="fitem">
        <span class="nm">${f.label || id}</span>
        <span class="macros">${f.kcal} · P${f.protein} C${f.carbs} F${f.fat}</span>
        <span class="cat">${f.cat}</span>
        <button class="edit" data-edit="${id}">✎</button></div>`;
    }).join("");
    $$("[data-edit]").forEach((b) => b.onclick = () => openFoodEditor(b.dataset.edit));
  }

  function openFoodEditor(id) {
    const f = id ? FOODS[id] : { label: "", kcal: 0, carbs: 0, protein: 0, fat: 0, cat: "carb" };
    const cats = ["carb", "protein", "fat", "fruit", "extra"];
    const body = `<h3>${id ? "Modifica" : "Nuovo"} alimento</h3>
      <div class="hint">Valori per 100g.</div>
      <label>Nome</label><input id="fLabel" value="${f.label || ""}">
      <div class="grid2">
        <div><label>Kcal</label><input id="fKcal" type="number" value="${f.kcal}"></div>
        <div><label>Categoria</label><select id="fCat">${cats.map((c) => `<option ${c === f.cat ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      </div>
      <div class="grid2">
        <div><label>Proteine</label><input id="fP" type="number" step="0.1" value="${f.protein}"></div>
        <div><label>Carboidrati</label><input id="fC" type="number" step="0.1" value="${f.carbs}"></div>
      </div>
      <label>Grassi</label><input id="fF" type="number" step="0.1" value="${f.fat}">
      <div class="actions">
        ${id ? '<button class="btn ghost" id="delFood" style="flex:0 0 auto">Elimina</button>' : ""}
        <button class="btn ghost" data-close>Annulla</button>
        <button class="btn primary" id="saveFood">Salva</button>
      </div>`;
    openSheet(body, (sh) => {
      $("#saveFood", sh).onclick = () => {
        const label = $("#fLabel", sh).value.trim();
        if (!label) { $("#fLabel", sh).focus(); return; }
        const key = id || slugify(label);
        FOODS[key] = {
          label, cat: $("#fCat", sh).value,
          kcal: +$("#fKcal", sh).value || 0, protein: +$("#fP", sh).value || 0,
          carbs: +$("#fC", sh).value || 0, fat: +$("#fF", sh).value || 0,
          ...(f.unit ? { unit: f.unit } : {}),
        };
        LS.set("mb_foods", FOODS); closeSheet(); renderFoods();
      };
      const del = $("#delFood", sh);
      if (del) del.onclick = () => { if (confirm(`Eliminare ${f.label}?`)) { delete FOODS[id]; LS.set("mb_foods", FOODS); closeSheet(); renderFoods(); } };
    });
  }
  function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "food_" + Date.now(); }

  function renderBlocks() {
    const locks = LS.get("mb_lockedBlocks", {});
    const html = SLOT_ORDER.map((slot) => {
      const ids = SEED.BLOCK_OPTIONS[slot] || [];
      return ids.map((id) => {
        const b = SEED.BLOCKS[id];
        return `<div class="blockcard"><h4>${b.label.replace(/^.*· /, "") || b.label}
          <span class="slot">${slot}</span>
          <button class="lock ${locks[id] ? "on" : ""}" data-lock="${id}" title="Blocca">${locks[id] ? "🔒" : "🔓"}</button></h4>
          ${b.items.map((it) => `<div class="bi">${FOODS[it.food]?.label || it.food} · ${it.grams === "flex" ? "auto" : it.grams + "g"}</div>`).join("")}
          ${b.onExtras ? `<div class="bi" style="color:var(--acc)">+ ON: ${b.onExtras.map((x) => FOODS[x.food]?.label).join(", ")}</div>` : ""}
          ${b.offExtras ? `<div class="bi" style="color:var(--acc)">+ OFF: ${b.offExtras.map((x) => FOODS[x.food]?.label).join(", ")}</div>` : ""}
        </div>`;
      }).join("");
    }).join("");
    $("#blockList").innerHTML = html;
    $$("[data-lock]").forEach((b) => b.onclick = () => {
      const l = LS.get("mb_lockedBlocks", {}); l[b.dataset.lock] = !l[b.dataset.lock]; LS.set("mb_lockedBlocks", l); renderBlocks();
    });
  }

  // ============================================================
  //  SHEET helpers
  // ============================================================
  function openSheet(html, after) {
    const sh = $("#sheet"); sh.innerHTML = html;
    $("#sheetBg").classList.add("open");
    $$("[data-close]", sh).forEach((b) => b.onclick = closeSheet);
    if (after) after(sh);
  }
  function closeSheet() { $("#sheetBg").classList.remove("open"); }
  $("#sheetBg").addEventListener("click", (e) => { if (e.target.id === "sheetBg") closeSheet(); });

  // ============================================================
  //  NAV
  // ============================================================
  function go(screen) {
    $$(".screen").forEach((s) => s.classList.toggle("active", s.id === "screen-" + screen));
    $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.screen === screen));
    $("#dayToggle").style.visibility = screen === "oggi" ? "visible" : "hidden";
    if (screen === "oggi") renderOggi();
    if (screen === "settimana") renderSettimana();
    if (screen === "spesa") renderSpesa();
    if (screen === "alimenti") { renderFoods(); renderBlocks(); }
  }

  // ============================================================
  //  WIRE UP
  // ============================================================
  function init() {
    $("#mealGrid").addEventListener("click", onGridClick);
    $$("#dayToggle button").forEach((b) => b.onclick = () => switchDayType(b.dataset.type));
    $("#regenBtn").onclick = regen;
    $("#genWeekBtn").onclick = () => { genWeek(); renderSettimana(); };
    $("#clearChecks").onclick = () => { shopChecks = {}; LS.set("mb_shopChecks", {}); renderSpesa(); };
    $("#addFood").onclick = () => openFoodEditor(null);
    $("#resetFoods").onclick = () => { if (confirm("Ripristinare il database iniziale? Le tue modifiche andranno perse.")) { FOODS = structuredClone(SEED.FOODS); LS.set("mb_foods", FOODS); renderFoods(); } };
    $$("#nav button").forEach((b) => b.onclick = () => go(b.dataset.screen));
    $$("[data-ftab]").forEach((b) => b.onclick = () => {
      $$("[data-ftab]").forEach((x) => x.classList.toggle("on", x === b));
      $("#ftab-db").hidden = b.dataset.ftab !== "db";
      $("#ftab-blocks").hidden = b.dataset.ftab !== "blocks";
    });
    go("oggi");
  }
  init();
})();

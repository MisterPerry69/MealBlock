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
    snack: `<svg width="22" height="22" viewBox="0 0 26 26"><rect x="5" y="8" width="16" height="10" rx="2.5" fill="#c0a0e0"/><rect x="7.5" y="10.5" width="2.5" height="2.5" rx="1" fill="#e8d8f5"/><rect x="11.5" y="12" width="2.5" height="2.5" rx="1" fill="#e8d8f5"/><rect x="15.5" y="10.5" width="2.5" height="2.5" rx="1" fill="#e8d8f5"/></svg>`,
  };
  const SLOT_ORDER = ["colazione", "pranzo", "merenda", "cena"];
  const SLOT_LABEL = { colazione: "Colazione", pranzo: "Pranzo", merenda: "Merenda", cena: "Cena" };
  const DAYS_IT = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const RING_COLOR = { protein: "var(--pro)", carbs: "var(--carb)", fat: "var(--fat)", kcal: "var(--kcal)" };
  const RING_LABEL = { protein: "P", carbs: "C", fat: "F", kcal: "Kcal" };
  const RING_FULL = { protein: "Proteine", carbs: "Carbo", fat: "Fat", kcal: "Kcal" };
  const RING_ORDER = ["carbs", "protein", "fat", "kcal"]; // C P F Kcal

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

  // target macro editabili dal Profilo (default = seed)
  let TARGETS = LS.get("mb_targets", null);
  if (!TARGETS) { TARGETS = structuredClone(SEED.TARGETS); LS.set("mb_targets", TARGETS); }

  // data bundle passato all'engine
  function data() {
    return {
      FOODS, BLOCKS: SEED.BLOCKS, BLOCK_OPTIONS: SEED.BLOCK_OPTIONS,
      TARGETS, TOLERANCE: SEED.TOLERANCE, SOLVER_WEIGHTS: SEED.SOLVER_WEIGHTS,
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

  // selezione per VARIETÀ: ruota le opzioni in base all'indice del giorno,
  // sfasando pranzo e cena così la settimana non ripete sempre lo stesso pasto.
  function rotatedSelection(i) {
    const L = SEED.BLOCK_OPTIONS.pranzo, D = SEED.BLOCK_OPTIONS.cena;
    return { pranzo: L[i % L.length], cena: D[(i + 1) % D.length] };
  }

  function buildDay(dayType, selection, frozenMap) {
    const gen = E.generateDay({ dayType, selection: selection || defaultSelection(), frozen: frozenMap || {}, data: data() });
    // work snack come blocco a sé (toggle/cambiabile come gli altri)
    const wsGen = gen.blocks.find((b) => b.blockId === "work_snack");
    const workSnack = { slot: "snack", blockId: "work_snack", label: SEED.BLOCKS.work_snack.label,
      items: wsGen ? wsGen.items.map((it) => ({ ...it })) : [], done: false };
    const blocks = gen.blocks
      .filter((b) => b.blockId !== "work_snack")
      .map((b) => ({ ...b, done: !!(frozenMap && frozenMap[b.slot]) }));
    return { dayType, blocks, workSnack, gen, date: todayKey() };
  }

  function todayKey() { const d = new Date(); return d.toISOString().slice(0, 10); }

  // ricalcola SOLO i totali/status dai blocchi attuali, SENZA rigenerare gli
  // items (così le modifiche manuali NON vengono perse). Include il work snack.
  function recalcTotals(day) {
    day = day || currentDay;
    const target = TARGETS[day.dayType];
    let totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    const allBlocks = day.workSnack ? [...day.blocks, day.workSnack] : day.blocks;
    for (const b of allBlocks) totals = E.addMacros(totals, E.calcMacros(b.items, FOODS));
    totals = { kcal: Math.round(totals.kcal), protein: round1(totals.protein), carbs: round1(totals.carbs), fat: round1(totals.fat) };
    day.gen = { dayType: day.dayType, target, totals, status: E.status(totals, target, SEED.TOLERANCE) };
    saveDay();
  }
  function round1(n) { return Math.round(n * 10) / 10; }

  // RIGENERA/ridistribuisce le grammature (bottone ↻): rifà i blocchi non-done
  // dai blocchi attualmente scelti, poi ricalcola. Le modifiche manuali si
  // perdono SOLO qui, perché è esplicitamente richiesto dall'utente.
  function redistribute() {
    const frozen = {}, selection = {};
    for (const b of currentDay.blocks) {
      if (b.done) frozen[b.slot] = { blockId: b.blockId, label: b.label, items: b.items };
      else selection[b.slot] = b.blockId;
    }
    const fresh = buildDay(currentDay.dayType, selection, frozen);
    const map = {}; fresh.blocks.forEach((b) => (map[b.slot] = b));
    currentDay.blocks.forEach((b) => { if (!b.done && map[b.slot]) { b.items = map[b.slot].items; b.label = map[b.slot].label; } });
    recalcTotals();
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
    const tgt = TARGETS[currentDay.dayType];
    // le wheel mostrano ciò che è stato MANGIATO (blocchi flaggati done)
    const allBlocks = currentDay.workSnack ? [...currentDay.blocks, currentDay.workSnack] : currentDay.blocks;
    let eaten = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    for (const b of allBlocks) if (b.done) eaten = E.addMacros(eaten, E.calcMacros(b.items, FOODS));
    eaten = { kcal: Math.round(eaten.kcal), protein: Math.round(eaten.protein), carbs: Math.round(eaten.carbs), fat: Math.round(eaten.fat) };

    $("#rings").innerHTML = RING_ORDER.map((m) => {
      const v = eaten[m], target = tgt[m];
      const pct = Math.max(0, Math.min(1, target ? v / target : 0));
      const C = 2 * Math.PI * 24;
      const off = C * (1 - pct);
      const over = v > target * 1.02;
      const col = over ? "var(--warn)" : RING_COLOR[m];
      const numFs = m === "kcal" ? "font-size:15px" : "";
      return `<div class="ring ${over ? "over" : ""}">
        <div class="ringwrap">
          <svg viewBox="0 0 56 56"><circle class="track" cx="28" cy="28" r="24"/>
            <circle class="prog" cx="28" cy="28" r="24" stroke="${col}" stroke-dasharray="${C}" stroke-dashoffset="${off}"/></svg>
          <b style="${numFs}">${v}</b>
        </div>
        <span class="sub">/ ${target}${m === "kcal" ? "" : "g"}</span>
        <span class="lab" style="color:${m === "kcal" ? "var(--dim)" : RING_COLOR[m]}">${RING_FULL[m]}</span>
      </div>`;
    }).join("");
  }

  function foodLine(it) {
    const f = FOODS[it.food];
    const label = f ? f.label : it.food;
    let amt;
    if (f && f.unit) { const n = Math.round(it.grams / f.unit.portion); amt = `${n} ${f.unit.label}`; }
    else amt = `${it.grams} g`;
    return `<div class="food" data-food="${it.food}"><span class="nm">${label}</span><span class="g">${amt}</span></div>`;
  }

  function cellHTML(b, slot, label, icon) {
    return `<div class="cell ${b.done ? "done" : ""}" data-slot="${slot}" data-open="${slot}">
      <h3><span class="micon">${icon}</span>${label}
        <button class="flag" data-flag="${slot}" title="Segna come fatto"></button></h3>
      <div class="foods">${b.items.map(foodLine).join("")}</div>
    </div>`;
  }

  // ordine in griglia: Colazione, Pranzo, Merenda, Work snack, Cena
  function renderGrid() {
    let html = "";
    html += cellHTML(findBlock(currentDay, "colazione"), "colazione", "Colazione", SLOT_ICON.colazione);
    html += cellHTML(findBlock(currentDay, "pranzo"), "pranzo", "Pranzo", SLOT_ICON.pranzo);
    html += cellHTML(findBlock(currentDay, "merenda"), "merenda", "Merenda", SLOT_ICON.merenda);
    if (currentDay.workSnack) html += cellHTML(currentDay.workSnack, "snack", "Work snack", SLOT_ICON.snack);
    html += cellHTML(findBlock(currentDay, "cena"), "cena", "Cena", SLOT_ICON.cena);
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
    renderHeader(); renderRings(); renderGapNote(); renderGrid(); renderPrep();
  }

  // ============================================================
  //  INTERACTIONS: OGGI
  // ============================================================
  function onGridClick(e) {
    const flag = e.target.closest("[data-flag]");
    if (flag) { e.stopPropagation(); toggleDone(flag.dataset.flag); return; }
    const cell = e.target.closest("[data-open]");
    if (cell) {
      openBlockModal(cell.dataset.open, {
        day: currentDay,
        onChange: () => { recalcTotals(); renderOggi(); }, // NON rigenera: salva le modifiche
      });
    }
  }

  // trova un blocco del giorno per slot, incluso il work snack
  function findBlock(day, slot) {
    if (slot === "snack" && day.workSnack) return day.workSnack;
    return day.blocks.find((x) => x.slot === slot);
  }

  function toggleDone(slot) {
    const b = findBlock(currentDay, slot);
    b.done = !b.done;
    recalcTotals();
    renderOggi();
  }

  function switchDayType(type) {
    if (currentDay.dayType === type) return;
    currentDay.dayType = type;
    // cambia il target: ridistribuisce le grammature dei blocchi non-done
    redistribute();
    renderOggi();
  }

  // bottone ↻ : ridistribuisce/ricalcola le grammature sui blocchi attuali
  function regen() {
    redistribute();
    renderOggi();
    toast("Macro ridistribuiti ↻");
  }

  // ============================================================
  //  MODAL BLOCCO (grande) — tap su un blocco in Oggi/Settimana
  //  Mostra: opzioni blocco, ogni alimento coi suoi valori, e per
  //  ognuno: modifica grammi / sostituisci (Top-3 smart) / elimina.
  //  `ctx` = { day, onChange }  così funziona sia per oggi che per
  //  un giorno della settimana.
  // ============================================================
  function openBlockModal(slot, ctx) {
    const day = ctx.day;
    const b = day.blocks.find((x) => x.slot === slot);
    if (!b) return;

    const render = () => {
      const opts = SEED.BLOCK_OPTIONS[slot] || [];
      const bm = E.calcMacros(b.items, FOODS);
      const body = `
        <h3>${SLOT_ICON[slot]} ${SLOT_LABEL[slot]}</h3>
        <div class="modal-total">${macroPills(bm, { size: "md", showKcal: true })}</div>

        ${opts.length > 1 ? `<label>Opzione pasto</label>
        <div class="chiprow">${opts.map((id) => `<button class="chip ${id === b.blockId ? "on" : ""}" data-pick="${id}">${SEED.BLOCKS[id].label.replace(/^.*· /, "")}</button>`).join("")}</div>` : ""}

        <label>Alimenti</label>
        <div class="fooditems">
          ${b.items.map((it, idx) => {
            const f = FOODS[it.food] || { label: it.food, kcal: 0, protein: 0, carbs: 0, fat: 0 };
            const im = E.calcMacros([it], FOODS);
            const amt = f.unit ? `${Math.round(it.grams / f.unit.portion)} ${f.unit.label}` : `${it.grams}g`;
            return `<div class="fooditem" data-idx="${idx}">
              <div class="fi-main">
                <span class="fi-dot" style="background:${catColor(f.cat)}"></span>
                <span class="fi-name">${f.label}</span>
                <span class="fi-amt">${amt}</span>
              </div>
              <div class="fi-macros">${macroPills(im, { size: "sm", showKcal: true })}</div>
              <div class="fi-actions">
                <button class="btn ghost sm" data-edit="${idx}">Grammi</button>
                <button class="btn ghost sm" data-sub="${idx}">Sostituisci</button>
                <button class="btn ghost sm" data-del="${idx}">Elimina</button>
              </div>
            </div>`;
          }).join("")}
        </div>
        <button class="btn ghost sm" id="addItem" style="width:100%;margin-top:8px">+ Aggiungi alimento</button>
        <div class="actions"><button class="btn primary" data-close style="width:100%">Fatto</button></div>`;
      openSheet(body, wire);
    };

    const commit = () => { ctx.onChange(); render(); };

    const wire = (sh) => {
      $$("[data-pick]", sh).forEach((el) => el.onclick = () => {
        b.blockId = el.dataset.pick; b.label = SEED.BLOCKS[el.dataset.pick].label;
        b.items = E.resolveBlockItems(SEED.BLOCKS[el.dataset.pick], day.dayType);
        // risolvi i flex con un riempimento ragionevole (default)
        b.items = b.items.map((it) => it.grams === "flex" ? { ...it, grams: 100 } : it);
        commit();
      });
      $$("[data-edit]", sh).forEach((el) => el.onclick = () => editGrams(+el.dataset.edit));
      $$("[data-sub]", sh).forEach((el) => el.onclick = () => substitute(+el.dataset.sub));
      $$("[data-del]", sh).forEach((el) => el.onclick = () => {
        b.items.splice(+el.dataset.del, 1); commit();
      });
      $("#addItem", sh).onclick = () => pickFood((foodId) => { b.items.push({ food: foodId, grams: 50 }); commit(); });
    };

    // --- modifica grammi (con anteprima live dei macro del pasto) ---
    function editGrams(idx) {
      const it = b.items[idx];
      const f = FOODS[it.food];
      const body = `<h3>${f.label}</h3><div class="hint">Modifica la grammatura</div>
        <label>Grammi</label>
        <input type="number" id="gInput" value="${it.grams}" min="0" step="5" inputmode="numeric">
        <div class="prev" id="gPrev"></div>
        <div class="actions">
          <button class="btn ghost" data-back>Indietro</button>
          <button class="btn primary" id="applyG">Applica</button>
        </div>`;
      openSheet(body, (sh) => {
        const input = $("#gInput", sh);
        const prev = $("#gPrev", sh);
        const update = () => {
          const g = Math.max(0, +input.value || 0);
          const tmp = b.items.map((x, i) => i === idx ? { ...x, grams: g } : x);
          const m = E.calcMacros(tmp, FOODS);
          prev.innerHTML = `<span class="prev-lab">Pasto</span> ${macroPills(m, { size: "md", showKcal: true })}`;
        };
        input.oninput = update; update();
        input.focus();
        $("#applyG", sh).onclick = () => { it.grams = Math.max(0, +input.value || 0); commit(); };
        $("[data-back]", sh).onclick = render;
      });
    }

    // --- sostituisci alimento (Top-3 smart che mantengono i macro del pasto) ---
    function substitute(idx) {
      const it = b.items[idx];
      // gap = macro che l'alimento corrente apporta (per mantenere il pasto invariato)
      const gap = E.calcMacros([it], FOODS);
      const present = b.items.map((x) => x.food);
      const curCat = FOODS[it.food]?.cat;
      // candidati: tutti tranne i jolly; preferisci la stessa categoria
      const cands = Object.keys(FOODS).filter((id) => !FOODS[id].jolly);
      const top3 = E.solveGap({ gap, data: data(), exclude: present, candidates: cands, preferCat: curCat });
      const body = `<h3>Sostituisci ${FOODS[it.food].label}</h3>
        <div class="hint">Proposte che mantengono i macro del pasto. Oppure scegli liberamente.</div>
        <div id="subProps">${renderProposals(top3, "Migliori sostituti")}</div>
        <button class="btn ghost sm" id="freeChoice" style="width:100%;margin-top:6px">Scegli da tutti gli alimenti</button>
        <div class="actions"><button class="btn ghost" data-back style="width:100%">Indietro</button></div>`;
      openSheet(body, (sh) => {
        $$("[data-prop]", sh).forEach((el) => el.onclick = () => {
          b.items[idx] = { food: el.dataset.prop, grams: +el.dataset.grams }; commit();
        });
        $("#freeChoice", sh).onclick = () => pickFood((foodId) => {
          // mantieni circa gli stessi macro: scala i grammi per pari kcal
          const f = FOODS[foodId];
          const g = f.kcal > 0 ? Math.round((gap.kcal / f.kcal) * 100) : 50;
          b.items[idx] = { food: foodId, grams: Math.max(5, g) }; commit();
        });
        $("[data-back]", sh).onclick = render;
      });
    }

    render();
  }

  // selettore alimento generico (lista cercabile)
  function pickFood(onPick) {
    const ids = Object.keys(FOODS).sort((a, b) => (FOODS[a].label || a).localeCompare(FOODS[b].label || b));
    const body = `<h3>Scegli un alimento</h3>
      <input type="text" id="foodSearch" placeholder="Cerca…" autocomplete="off">
      <div id="foodPickList" class="picklist"></div>
      <div class="actions"><button class="btn ghost" data-close style="width:100%">Annulla</button></div>`;
    openSheet(body, (sh) => {
      const list = $("#foodPickList", sh), search = $("#foodSearch", sh);
      const draw = (q = "") => {
        list.innerHTML = ids.filter((id) => (FOODS[id].label || id).toLowerCase().includes(q.toLowerCase()))
          .map((id) => { const f = FOODS[id];
            return `<button class="pickrow" data-pf="${id}"><span class="fi-dot" style="background:${catColor(f.cat)}"></span>${f.label}<span class="pr-m">P${f.protein} C${f.carbs} F${f.fat}</span></button>`;
          }).join("");
        $$("[data-pf]", list).forEach((el) => el.onclick = () => onPick(el.dataset.pf));
      };
      search.oninput = () => draw(search.value); draw();
    });
  }

  function catColor(cat) {
    return { protein: "var(--pro)", carb: "var(--carb)", fat: "var(--fat)", fruit: "#c6e85a", extra: "#c0a0e0" }[cat] || "var(--dim)";
  }

  // pillole macro colorate, ordine C / P / F (+ kcal opzionale)
  // size: "sm" | "md". showKcal mostra anche le kcal a sinistra.
  function macroPills(m, opts = {}) {
    const s = opts.size || "";
    const k = `<span class="pill pill-k ${s}">${Math.round(m.kcal)} <i>kcal</i></span>`;
    const c = `<span class="pill pill-c ${s}"><b>C</b> ${Math.round(m.carbs)}</span>`;
    const p = `<span class="pill pill-p ${s}"><b>P</b> ${Math.round(m.protein)}</span>`;
    const f = `<span class="pill pill-f ${s}"><b>F</b> ${Math.round(m.fat)}</span>`;
    return `<span class="pills">${opts.showKcal ? k : ""}${c}${p}${f}</span>`;
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
        recalcTotals(); closeSheet(); renderOggi();
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
  // sceglie le opzioni della settimana rispettando i limiti di frequenza
  // (per blocco e per alimento) e massimizzando la varietà.
  function planWeekSelections() {
    const blockLimits = SEED.BLOCK_WEEK_LIMITS || {};
    const foodLimits = SEED.FOOD_WEEK_LIMITS || {};
    const blockCount = {}, foodCount = {}, lastUsed = {};
    const itemsOf = (id) => SEED.BLOCKS[id].items.map((x) => x.food);

    const choose = (slot, dayIdx) => {
      const opts = SEED.BLOCK_OPTIONS[slot] || [];
      // candidati che non sforano i limiti
      let avail = opts.filter((id) => {
        if ((blockCount[id] || 0) >= (blockLimits[id] ?? 99)) return false;
        for (const f of itemsOf(id)) if ((foodCount[f] || 0) >= (foodLimits[f] ?? 99)) return false;
        return true;
      });
      if (!avail.length) {
        // vincoli impossibili da rispettare (troppe poche opzioni): rilassa
        // scegliendo l'opzione MENO usata, così l'eccesso si spalma il più
        // uniformemente possibile invece di accanirsi su un blocco.
        avail = opts.slice().sort((a, b) => (blockCount[a] || 0) - (blockCount[b] || 0));
      } else {
        // preferisci il meno usato di recente, poi il meno usato in assoluto
        avail.sort((a, b) => (lastUsed[a] ?? -9) - (lastUsed[b] ?? -9) || (blockCount[a] || 0) - (blockCount[b] || 0));
      }
      const pickId = avail[0];
      blockCount[pickId] = (blockCount[pickId] || 0) + 1;
      lastUsed[pickId] = dayIdx;
      for (const f of itemsOf(pickId)) foodCount[f] = (foodCount[f] || 0) + 1;
      return pickId;
    };

    const sels = [];
    for (let i = 0; i < 7; i++) sels.push({ pranzo: choose("pranzo", i), cena: choose("cena", i) });
    return sels;
  }

  function genWeek() {
    const days = [];
    const base = new Date();
    const sels = planWeekSelections();
    for (let i = 0; i < 7; i++) {
      const d = new Date(base); d.setDate(base.getDate() + i);
      const dt = onTypeForDate(d);
      const day = buildDay(dt, sels[i]);
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
        <div class="wh" data-drag="${idx}">
          <span class="grip">⋮⋮</span>
          <span class="wname">${day.dateLabel}</span>
          <button class="wtype ${day.dayType}" data-wswitch="${idx}" title="Switch ON/OFF">${day.dayType}</button>
          <span class="wmacro">${t.kcal} · P${Math.round(t.protein)}</span>
        </div>
        <div class="wmeals">
          ${SLOT_ORDER.map((slot) => {
            const b = day.blocks.find((x) => x.slot === slot);
            if (!b) return "";
            const m = E.calcMacros(b.items, FOODS);
            return `<button class="wmeal" data-wmeal="${idx}:${slot}">
              <span class="wm-ic">${SLOT_ICON[slot]}</span>
              <span class="wm-name">${b.label.replace(/^.*· /, "")}</span>
              <span class="wm-k">${m.kcal}</span>
            </button>`;
          }).join("")}
        </div>
        <div class="pad" style="padding:2px 12px 12px"><button class="btn ghost sm" data-wregen="${idx}" style="width:100%">↻ Rigenera giorno</button></div>
      </div>`;
    }).join("");
    $$("[data-wswitch]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); switchWeekDay(+b.dataset.wswitch); });
    $$("[data-wregen]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); regenWeekDay(+b.dataset.wregen); });
    $$("[data-wmeal]").forEach((b) => b.onclick = () => {
      const [i, slot] = b.dataset.wmeal.split(":");
      openBlockModal(slot, { day: week.days[+i], onChange: () => {
        week.days[+i].gen = E.generateDay({ dayType: week.days[+i].dayType,
          selection: selFromDay(week.days[+i]), frozen: frozenFromDay(week.days[+i]), data: data() });
        saveWeek(); renderSettimana();
      }});
    });
    setupWeekDrag();
  }

  function selFromDay(day) {
    const s = {}; day.blocks.forEach((b) => { if (!b.done) s[b.slot] = b.blockId; }); return s;
  }
  function frozenFromDay(day) {
    const f = {}; day.blocks.forEach((b) => { if (b.done) f[b.slot] = { blockId: b.blockId, label: b.label, items: b.items }; }); return f;
  }

  // --- drag & drop (Pointer Events: dito + mouse) per scambiare giorni ---
  function setupWeekDrag() {
    let dragIdx = null, ghost = null, moved = false;
    // blocca il menu contestuale (long-press) sull'intera lista durante il drag
    const list = $("#weekList");
    list.addEventListener("contextmenu", (e) => { if (dragIdx !== null) e.preventDefault(); });

    $$("[data-drag]").forEach((handle) => {
      handle.style.touchAction = "none"; // impedisce lo scroll/gesti del browser sul grip
      handle.addEventListener("pointerdown", (e) => {
        if (e.target.closest("[data-wswitch]")) return;
        e.preventDefault();
        dragIdx = +handle.dataset.drag; moved = false;
        ghost = handle.closest(".weekday"); ghost.classList.add("dragging");
        handle.setPointerCapture(e.pointerId);
      });
      handle.addEventListener("pointermove", (e) => {
        if (dragIdx === null) return;
        e.preventDefault(); moved = true;
        const over = $$(".weekday").find((c) => {
          const r = c.getBoundingClientRect();
          return e.clientY >= r.top && e.clientY <= r.bottom;
        });
        $$(".weekday").forEach((c) => c.classList.toggle("droptarget", c === over && +c.dataset.wd !== dragIdx));
      });
      const finish = (e) => {
        if (dragIdx === null) return;
        const over = $$(".weekday").find((c) => {
          const r = c.getBoundingClientRect();
          return e.clientY >= r.top && e.clientY <= r.bottom;
        });
        const from = dragIdx; dragIdx = null;
        if (ghost) ghost.classList.remove("dragging");
        if (moved && over && +over.dataset.wd !== from) swapDays(from, +over.dataset.wd);
        else renderSettimana();
      };
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", () => { dragIdx = null; renderSettimana(); });
    });
  }

  // scambia i CONTENUTI dei due giorni (i blocchi/tipo), mantenendo le date fisse
  function swapDays(a, b) {
    const da = week.days[a], db = week.days[b];
    // scambia il CONTENUTO (tipo + blocchi + workSnack + gen) tenendo fisse le date
    const swapKeys = ["dayType", "blocks", "workSnack", "gen"];
    swapKeys.forEach((k) => { const tmp = da[k]; da[k] = db[k]; db[k] = tmp; });
    saveWeek();
    renderSettimana();
    toast(`Scambiati ${da.dateLabel.split(" ")[0]} ↔ ${db.dateLabel.split(" ")[0]}`);
  }

  function switchWeekDay(idx) {
    const day = week.days[idx];
    const nt = day.dayType === "ON" ? "OFF" : "ON";
    const fresh = buildDay(nt, rotatedSelection(idx)); fresh.dow = day.dow; fresh.dateLabel = day.dateLabel;
    week.days[idx] = fresh; saveWeek(); renderSettimana();
  }
  function regenWeekDay(idx) {
    const day = week.days[idx];
    const fresh = buildDay(day.dayType, randomSelection()); fresh.dow = day.dow; fresh.dateLabel = day.dateLabel;
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
  //  RENDER: DATABASE (card colorate per categoria)
  // ============================================================
  const FOOD_EMOJI = {
    oats: "🌾", whey: "🥤", skyr: "🍦", pollo: "🍗", tonno: "🐟", uova: "🥚",
    mozzarella_light: "🧀", burger_vegetali: "🍔", fusilli_integrali: "🍝", couscous: "🍚",
    corn_flakes: "🥣", fette_biscottate: "🍞", pure: "🥔", pane: "🍞", marmellata: "🍓",
    olio_oliva: "🫒", peanut_butter: "🥜", cioccolato_74: "🍫", banana: "🍌", mela: "🍎",
    pizza_lidl: "🍕", kinder_cereali: "🍫",
  };
  const CAT_EMOJI = { protein: "🥩", carb: "🌾", fat: "🫒", fruit: "🍎", extra: "🍫" };
  function foodEmoji(id, f) { return f.emoji || FOOD_EMOJI[id] || CAT_EMOJI[f.cat] || "🍽️"; }

  function renderFoods() {
    const ids = Object.keys(FOODS).sort((a, b) => (FOODS[a].label || a).localeCompare(FOODS[b].label || b));
    $("#foodList").innerHTML = ids.map((id) => {
      const f = FOODS[id];
      const col = catColor(f.cat);
      return `<button class="foodcard" data-edit="${id}" style="--cc:${col}">
        <span class="fc-top"><span class="fc-emoji">${foodEmoji(id, f)}</span>${f.jolly ? '<span class="jolly-tag">jolly</span>' : ""}</span>
        <span class="fc-name">${f.label || id}</span>
        <span class="fc-sub">${f.kcal} kcal · 100g</span>
        ${macroPills(f, { size: "sm" })}
      </button>`;
    }).join("");
    $$("[data-edit]").forEach((b) => b.onclick = () => openFoodEditor(b.dataset.edit));
  }

  function openFoodEditor(id) {
    const f = id ? FOODS[id] : { label: "", kcal: 0, carbs: 0, protein: 0, fat: 0, cat: "carb" };
    const cats = [["carb", "Carboidrato"], ["protein", "Proteina"], ["fat", "Grasso"], ["fruit", "Frutta"], ["extra", "Extra"]];
    const body = `<h3>${id ? "Modifica" : "Nuovo"} alimento</h3>
      <div class="hint">Valori nutrizionali per 100g.</div>
      <div class="grid-emoji">
        <div><label>Emoji</label><input id="fEmoji" value="${f.emoji || ""}" placeholder="🍽️" maxlength="2" style="text-align:center;font-size:24px"></div>
        <div><label>Nome</label><input id="fLabel" value="${f.label || ""}" placeholder="es. Riso basmati"></div>
      </div>
      <div class="grid2">
        <div><label>Calorie (kcal)</label><input id="fKcal" type="number" inputmode="numeric" value="${f.kcal}"></div>
        <div><label>Categoria</label><select id="fCat">${cats.map(([c, l]) => `<option value="${c}" ${c === f.cat ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      </div>
      <div class="grid3">
        <div><label>Carbo (g)</label><input id="fC" type="number" step="0.1" inputmode="decimal" value="${f.carbs}"></div>
        <div><label>Prot (g)</label><input id="fP" type="number" step="0.1" inputmode="decimal" value="${f.protein}"></div>
        <div><label>Fat (g)</label><input id="fF" type="number" step="0.1" inputmode="decimal" value="${f.fat}"></div>
      </div>
      <label class="check"><input type="checkbox" id="fJolly" ${f.jolly ? "checked" : ""}>
        <span><b>Jolly</b> — non usarlo nelle giornate generate (lo aggiungo io quando voglio)</span></label>
      <div class="actions">
        ${id ? '<button class="btn danger" id="delFood">Elimina</button>' : ""}
        <button class="btn ghost" data-close>Annulla</button>
        <button class="btn primary" id="saveFood">Salva</button>
      </div>`;
    openSheet(body, (sh) => {
      $("#saveFood", sh).onclick = () => {
        const label = $("#fLabel", sh).value.trim();
        if (!label) { $("#fLabel", sh).focus(); return; }
        const key = id || slugify(label);
        const emoji = $("#fEmoji", sh).value.trim();
        FOODS[key] = {
          label, cat: $("#fCat", sh).value,
          kcal: +$("#fKcal", sh).value || 0, protein: +$("#fP", sh).value || 0,
          carbs: +$("#fC", sh).value || 0, fat: +$("#fF", sh).value || 0,
          ...(emoji ? { emoji } : {}),
          ...($("#fJolly", sh).checked ? { jolly: true } : {}),
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
      const cards = ids.map((id) => {
        const b = SEED.BLOCKS[id];
        // macro indicativi (flex contati a 100g per dare un'idea)
        const probe = b.items.map((it) => ({ food: it.food, grams: it.grams === "flex" ? 100 : it.grams }));
        const m = E.calcMacros(probe, FOODS);
        return `<div class="blockcard">
          <h4>${SLOT_ICON[slot]} ${b.label.replace(/^.*· /, "") || b.label}
            <button class="lock ${locks[id] ? "on" : ""}" data-lock="${id}" title="Blocca questo blocco">${locks[id] ? "🔒" : "🔓"}</button></h4>
          ${b.items.map((it) => `<div class="bi"><span class="fi-dot" style="background:${catColor(FOODS[it.food]?.cat)}"></span>${FOODS[it.food]?.label || it.food} · ${it.grams === "flex" ? "auto" : it.grams + "g"}</div>`).join("")}
          ${b.onExtras ? `<div class="bi extra">+ ON: ${b.onExtras.map((x) => FOODS[x.food]?.label).join(", ")}</div>` : ""}
          ${b.offExtras ? `<div class="bi extra">+ OFF: ${b.offExtras.map((x) => FOODS[x.food]?.label).join(", ")}</div>` : ""}
          <div class="bmacro">${macroPills(m, { size: "sm", showKcal: true })}</div>
        </div>`;
      }).join("");
      return `<div class="slot-group"><div class="slot-head">${SLOT_ICON[slot]} ${SLOT_LABEL[slot]}</div>${cards}</div>`;
    }).join("");
    $("#blockList").innerHTML = html;
    $$("[data-lock]").forEach((b) => b.onclick = () => {
      const l = LS.get("mb_lockedBlocks", {}); l[b.dataset.lock] = !l[b.dataset.lock]; LS.set("mb_lockedBlocks", l); renderBlocks();
    });
  }

  // ============================================================
  //  RENDER: PROFILO — target macro editabili (4 valori per ON/OFF)
  // ============================================================
  function renderProfile() {
    const card = (type) => {
      const t = TARGETS[type];
      const derived = t.protein * 4 + t.carbs * 4 + t.fat * 9;
      const mismatch = Math.abs(derived - t.kcal) > 20;
      const field = (m, lab, cls) => `<div class="proffield ${cls}">
        <label>${lab}</label><input type="number" inputmode="numeric" data-t="${type}" data-m="${m}" value="${t[m]}"></div>`;
      return `<div class="profcard">
        <div class="profhead"><span class="wtype ${type}">${type}</span> <span class="dim">${type === "ON" ? "giorni di allenamento" : "giorni di riposo"}</span></div>
        <div class="profgrid">
          ${field("carbs", "Carbo (g)", "f-c")}
          ${field("protein", "Prot (g)", "f-p")}
          ${field("fat", "Fat (g)", "f-f")}
          ${field("kcal", "Calorie (kcal)", "f-k")}
        </div>
        <div class="profcheck ${mismatch ? "warn" : ""}">C·4 + P·4 + F·9 = <b>${derived}</b> kcal ${mismatch ? `≠ ${t.kcal} impostate ⚠️` : "✓ coerente"}</div>
      </div>`;
    };
    $("#profileBody").innerHTML = `
      <div class="hint" style="padding:0 18px 6px;font-size:14px">Imposta i tuoi target macro. Le giornate verranno ricalcolate su questi valori.</div>
      ${card("ON")}${card("OFF")}
      <div class="pad" style="padding:8px 16px 24px"><button class="btn primary" id="saveProfile" style="width:100%;padding:15px;font-size:16px">Salva target</button></div>`;
    const refreshChecks = () => {
      $$("#profileBody .profcard").forEach((cardEl, i) => {
        const type = i === 0 ? "ON" : "OFF"; const t = TARGETS[type];
        const derived = t.protein * 4 + t.carbs * 4 + t.fat * 9;
        const mismatch = Math.abs(derived - t.kcal) > 20;
        const chk = cardEl.querySelector(".profcheck");
        chk.className = "profcheck" + (mismatch ? " warn" : "");
        chk.innerHTML = `C·4 + P·4 + F·9 = <b>${derived}</b> kcal ${mismatch ? `≠ ${t.kcal} impostate ⚠️` : "✓ coerente"}`;
      });
    };
    $$("#profileBody input").forEach((inp) => inp.oninput = () => {
      TARGETS[inp.dataset.t][inp.dataset.m] = +inp.value || 0;
      refreshChecks(); // aggiorna solo la riga di coerenza, mantiene il focus
    });
    $("#saveProfile").onclick = () => {
      LS.set("mb_targets", TARGETS);
      // ricalcola oggi e settimana coi nuovi target (ridistribuendo le grammature)
      if (currentDay) { redistribute(); }
      if (week) { week.days.forEach((d, i) => { const nd = buildDay(d.dayType, selFromDay(d)); nd.dow = d.dow; nd.dateLabel = d.dateLabel; week.days[i] = nd; }); saveWeek(); }
      toast("Target salvati ✓");
    };
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

  // mini toast
  let toastTO;
  function toast(msg) {
    let el = $("#toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toastTO); toastTO = setTimeout(() => el.classList.remove("show"), 1800);
  }

  // ============================================================
  //  NAV
  // ============================================================
  function dbTabActive() {
    return $("#screen-blocks").classList.contains("active") && !$("#ftab-db").hidden;
  }
  function go(screen) {
    $$(".screen").forEach((s) => s.classList.toggle("active", s.id === "screen-" + screen));
    $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.screen === screen));
    $("#dayToggle").style.visibility = screen === "oggi" ? "visible" : "hidden";
    if (screen === "oggi") renderOggi();
    if (screen === "settimana") renderSettimana();
    if (screen === "spesa") renderSpesa();
    if (screen === "blocks") { renderBlocks(); renderFoods(); }
    if (screen === "profilo") renderProfile();
    $("#fab").hidden = !dbTabActive();
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
    $("#fab").onclick = () => openFoodEditor(null);
    $$("#nav button").forEach((b) => b.onclick = () => go(b.dataset.screen));
    $$("[data-ftab]").forEach((b) => b.onclick = () => {
      $$("[data-ftab]").forEach((x) => x.classList.toggle("on", x === b));
      $("#ftab-db").hidden = b.dataset.ftab !== "db";
      $("#ftab-blocks").hidden = b.dataset.ftab !== "blocks";
      $("#fab").hidden = !dbTabActive();
    });
    go("oggi");
  }
  init();
})();

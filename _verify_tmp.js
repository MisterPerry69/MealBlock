const { JSDOM } = require("jsdom");
const fs = require("fs"), path = require("path");
const APP = __dirname;
const dom = new JSDOM(fs.readFileSync(path.join(APP, "index.html"), "utf8"), { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost:8753/" });
const { window } = dom; const { document } = window;
window.structuredClone = window.structuredClone || ((x) => JSON.parse(JSON.stringify(x)));
window.confirm = () => true;
const store = {};
window.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k], clear: () => {} };
const errors = []; window.addEventListener("error", (e) => errors.push(e.message));
["data.js", "engine.js", "app.js"].forEach((f) => { try { window.eval(fs.readFileSync(path.join(APP, f), "utf8")); } catch (e) { console.log("LOAD ERR", f, e.message); process.exit(2); } });
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const click = (el) => el && el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const setval = (el, v) => { el.value = v; el.dispatchEvent(new window.Event("input", { bubbles: true })); };
const blk = () => store["mb_blocks"] ? JSON.parse(store["mb_blocks"]) : {};
let step = 0; const log = (s) => console.log(`\n[${++step}] ${s}`);

log("Crea nuovo pasto (pranzo)");
click($$('#nav button').find(b => b.dataset.screen === "blocks"));
click($('[data-addblock="pranzo"]'));
setval($("#mLabel"), "Pranzo · Riso e pollo");
click($("#mAdd")); click($$("[data-pf]").find(b => /Pollo/i.test(b.textContent)));
click($("#mAdd")); click($$("[data-pf]").find(b => /Couscous/i.test(b.textContent)));
click($("#mSave"));
console.log("  mb_blocks salvato:", !!store["mb_blocks"]);
const bks = blk();
const newId = Object.keys(bks).find(k => /Riso e pollo/.test(bks[k] && bks[k].label));
console.log("  nuovo pasto persistito:", !!newId, "| slot:", newId && bks[newId].slot, "| items:", newId && bks[newId].items.length);
console.log("  custom flag:", newId && bks[newId].custom);

log("Disabilita lunch_C, genera settimana -> escluso");
click($('[data-bedit="lunch_C"]'));
click($("#mToggle")); click($("#mSave"));
console.log("  lunch_C disabled:", blk().lunch_C.disabled === true ? "✓" : "✗");
click($$('#nav button').find(b => b.dataset.screen === "settimana"));
click($("#genWeekBtn"));
const hasTonno = $$(".weekday").some(w => /Tonno/.test(w.textContent));
console.log("  tonno (lunch_C) in settimana:", hasTonno ? "presente ✗" : "escluso ✓");
// e il nuovo pasto può comparire
const hasNew = $$(".weekday").some(w => /Riso e pollo|Couscous|Pollo/.test(w.textContent));
console.log("  varianti pranzo in settimana includono nuovi/altri:", hasNew ? "✓" : "(non per forza)");

log("Modifica un seed (cambia nome dinner_B) e verifica persistenza");
click($$('#nav button').find(b => b.dataset.screen === "blocks"));
click($('[data-bedit="dinner_B"]'));
setval($("#mLabel"), "Cena · Frittata e pane");
click($("#mSave"));
console.log("  dinner_B rinominato:", /Frittata/.test(blk().dinner_B.label) ? "✓" : "✗", "| edited flag:", blk().dinner_B.edited);

log("Ripristina pasti iniziali");
click($("#resetBlocks"));
const after = blk();
console.log("  pasti custom rimossi:", !Object.values(after).some(b => /Riso e pollo/.test(b.label)) ? "✓" : "✗");
console.log("  lunch_C riattivato:", after.lunch_C.disabled !== true ? "✓" : "✗");
console.log("  dinner_B nome ripristinato:", !/Frittata/.test(after.dinner_B.label) ? "✓" : "✗");

console.log("\n=== JS errors:", errors.length ? errors.join("; ") : "NESSUNO", "===");

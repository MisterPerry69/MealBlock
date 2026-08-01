import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizePlan } from './optimize.js';

const raw = {
  proteine:  { kcal:373, carbo:8,  prot:70, fat:8 },
  mela:      { kcal:52,  carbo:14, prot:0,  fat:0 },
  fusilli:   { kcal:344, carbo:65, prot:13, fat:1.5 },
  tonno:     { kcal:114, carbo:1,  prot:25, fat:2 },
  skyr:      { kcal:64,  carbo:4,  prot:11, fat:0.4 },
  marmellata:{ kcal:183, carbo:43, prot:0,  fat:0 },
  fette:     { kcal:388, carbo:70, prot:12, fat:5 },
  burro_ar:  { kcal:618, carbo:15, prot:25, fat:50, rangeGrammatura:{min:10,max:60} },
  cioccolato:{ kcal:580, carbo:20, prot:10, fat:47 },
  drink:     { kcal:64,  carbo:5,  prot:10, fat:0.3 },
  olio:      { kcal:884, carbo:0,  prot:0,  fat:100, rangeGrammatura:{min:5,max:40} },
  tagliata:  { kcal:223, carbo:6,  prot:22, fat:12 },
};
const foods = Object.fromEntries(Object.entries(raw).map(([id,v])=>[id,{id,...v}]));

function mk() {
  return { target:{kcal:2330,carbo:200,prot:180,fat:90}, meals:[
    {id:'colazione',nome:'Colazione',righe:[{foodId:'proteine',grammatura:40}]},
    {id:'pranzo',nome:'Pranzo',righe:[{foodId:'mela',grammatura:130},{foodId:'fusilli',grammatura:130},{foodId:'tonno',grammatura:150}]},
    {id:'spuntino',nome:'Spuntino',righe:[{foodId:'skyr',grammatura:250},{foodId:'marmellata',grammatura:30},{foodId:'fette',grammatura:60},{foodId:'burro_ar',grammatura:40},{foodId:'cioccolato',grammatura:30},{foodId:'drink',grammatura:330}]},
    {id:'cena',nome:'Cena',righe:[{foodId:'olio',grammatura:15},{foodId:'tagliata',grammatura:160}]},
  ]};
}
function tot(ms){const t={kcal:0,carbo:0,prot:0,fat:0};for(const m of ms)for(const r of m.righe){const f=foods[r.foodId],k=r.grammatura/100;for(const x of['kcal','carbo','prot','fat'])t[x]+=f[x]*k;}return t;}

test('v5 — POCHE mosse, non tocca tutti i 12 cibi', () => {
  const { changes, additions } = optimizePlan(mk(), foods);
  const totMosse = changes.length + additions.length;
  assert.ok(totMosse <= 3, `troppe mosse: ${totMosse} (deve essere <=3, non 12)`);
});

test('v5 — proteine in eccesso: riduce un cibo proteico ad alto contributo, non sparge', () => {
  // proteine 198 vs 180 (+18). Deve RIDURRE un cibo ricco di proteine (tonno o
  // drink), con poche mosse, portando le proteine in fascia.
  const { changes, totalsIfApplied } = optimizePlan(mk(), foods);
  const protCuts = changes.filter((c) => c.aG < c.daG && (foods[c.foodId].prot > 15));
  assert.ok(protCuts.length >= 1, 'riduce almeno un cibo proteico');
  assert.ok(Math.abs(totalsIfApplied.prot - 180) <= 5, `proteine ${Math.round(totalsIfApplied.prot)} rientrano in fascia`);
});

test('v5 — non tocca i cibi gia in fascia con micro-aggiustamenti inutili', () => {
  // fusilli, tonno, skyr ecc. non devono cambiare di 1-2g a caso
  const { changes } = optimizePlan(mk(), foods);
  const micro = changes.filter((c) => Math.abs(c.aG - c.daG) <= 3);
  assert.equal(micro.length, 0, `modifiche micro inutili: ${JSON.stringify(micro)}`);
});

test('v5 — se tutto in fascia (±5), nessuna proposta', () => {
  const plan = mk();
  const t = tot(plan.meals);
  // imposto il target = totale attuale -> gia perfetto
  plan.target = { kcal: Math.round(t.kcal), carbo: Math.round(t.carbo), prot: Math.round(t.prot), fat: Math.round(t.fat) };
  const { changes, additions } = optimizePlan(plan, foods);
  assert.equal(changes.length + additions.length, 0, 'niente da proporre se sei a target');
});

test('v5 — riduce PRIMA i cibi accessori (bevanda) rispetto ai principali (tonno)', () => {
  const f2 = { ...foods, drink: { ...foods.drink, accessorio: true } };
  const { changes } = optimizePlan(mk(), f2);
  const drink = changes.find((c) => c.foodId === 'drink' && c.aG < c.daG);
  const tonno = changes.find((c) => c.foodId === 'tonno' && c.aG < c.daG);
  // il drink (accessorio) deve essere ridotto; il tonno (principale) preferibilmente no
  assert.ok(drink, 'riduce la bevanda accessoria');
  assert.ok(!tonno, 'non tocca il tonno principale');
});

test('v5 — rispetta i range e i cibi bloccati', () => {
  const plan = mk();
  plan.meals[2].righe[5].locked = true; // blocca il drink
  const { changes } = optimizePlan(plan, foods);
  assert.ok(!changes.some((c) => c.foodId === 'drink'), 'il drink bloccato non si tocca');
});

test('v6 — aggiunta rispetta il range max del cibo (no mandorle 111g)', () => {
  const foods = {
    pollo:    { id:'pollo', kcal:165, carbo:0, prot:31, fat:3.6 },
    mandorle: { id:'mandorle', kcal:579, carbo:22, prot:21, fat:49, rangeGrammatura:{min:0,max:30} },
  };
  const usage = { mandorle: { perMeal: { cena: { count: 3 } }, total: 3 } }; // note a cena
  const plan = {
    target: { kcal: 2000, carbo: 50, prot: 120, fat: 90 }, // mancano tanti grassi
    meals: [
      { id:'pranzo', nome:'Pra', righe:[{ foodId:'pollo', grammatura:300, locked:true }] },
      { id:'cena', nome:'Cena', righe:[] },
    ],
  };
  const { additions } = optimizePlan(plan, foods, { usage });
  const m = additions.find((a) => a.foodId === 'mandorle');
  if (m) assert.ok(m.grammatura <= 30, `mandorle ${m.grammatura}g non deve superare il max 30`);
});

test('v6 — aggiunge SOLO cibi noti per il pasto (no bevanda a cena se non nota)', () => {
  const foods = {
    pollo:   { id:'pollo', kcal:165, carbo:0, prot:31, fat:3.6 },
    bevanda: { id:'bevanda', kcal:64, carbo:5, prot:10, fat:0.3 },
    olio:    { id:'olio', kcal:884, carbo:0, prot:0, fat:100, rangeGrammatura:{min:5,max:30} },
  };
  // a cena l'utente usa OLIO, mai la bevanda
  const usage = { olio: { perMeal: { cena: { count: 5 } }, total: 5 } };
  const plan = {
    target: { kcal: 1500, carbo: 0, prot: 100, fat: 60 },
    meals: [
      { id:'pranzo', nome:'Pra', righe:[{ foodId:'pollo', grammatura:200, locked:true }] },
      { id:'cena', nome:'Cena', righe:[] },
    ],
  };
  const { additions } = optimizePlan(plan, foods, { usage });
  assert.ok(!additions.some((a) => a.foodId === 'bevanda'), 'non aggiunge la bevanda (non nota a cena)');
});

test('v6 — senza usage, nessuna aggiunta automatica', () => {
  const foods = { pollo:{ id:'pollo', kcal:165, carbo:0, prot:31, fat:3.6 } };
  const plan = { target:{ kcal:2000, carbo:200, prot:180, fat:70 }, meals:[{ id:'cena', nome:'Cena', righe:[] }] };
  const { additions } = optimizePlan(plan, foods); // niente opts
  assert.equal(additions.length, 0, 'nessuna aggiunta se non conosco i cibi del pasto');
});

test('v6 — deficit di proteine: aumenta cibi PROTEICI, non carbo, e non sfora le kcal', () => {
  const foods = {
    pollo:  { id:'pollo', kcal:165, carbo:0, prot:31, fat:3.6, rangeGrammatura:{min:100,max:400} },
    fusilli:{ id:'fusilli', kcal:344, carbo:65, prot:13, fat:1.5, rangeGrammatura:{min:50,max:300} },
    cornflakes:{ id:'cornflakes', kcal:375, carbo:84, prot:7, fat:1, rangeGrammatura:{min:30,max:300} },
  };
  // sotto su tutto ma soprattutto proteine (-46). kcal -450.
  const plan = {
    target: { kcal: 2330, carbo: 200, prot: 180, fat: 90 },
    meals: [{ id:'pranzo', nome:'Pra', righe:[
      { foodId:'pollo', grammatura:150 },
      { foodId:'fusilli', grammatura:130 },
      { foodId:'cornflakes', grammatura:60 },
    ]}],
  };
  const before = { prot: 150*0.31 + 130*0.13 + 60*0.07 }; // ~64
  const { changes, totalsIfApplied } = optimizePlan(plan, foods, { usage: {} });
  // deve aver aumentato il pollo (proteico), non gonfiato i carbo
  const pollo = changes.find((c) => c.foodId === 'pollo');
  assert.ok(pollo && pollo.aG > 150, 'aumenta il pollo (proteico)');
  // le proteine devono salire verso il target
  assert.ok(totalsIfApplied.prot > before.prot + 15, `proteine ${Math.round(totalsIfApplied.prot)} devono salire`);
  // NON deve sforare pesantemente le kcal (tetto ~2450)
  assert.ok(totalsIfApplied.kcal <= 2330 + 130, `kcal ${Math.round(totalsIfApplied.kcal)} non deve sforare il tetto`);
});

test('v6 — cibo con range min==max e FISSO (pizza 390/390 non si tocca)', () => {
  const foods = {
    pizza: { id:'pizza', kcal:270, carbo:33, prot:11, fat:10, rangeGrammatura:{min:390,max:390} },
    pollo: { id:'pollo', kcal:165, carbo:0, prot:31, fat:3.6, rangeGrammatura:{min:100,max:300} },
  };
  const plan = {
    target: { kcal: 2000, carbo: 150, prot: 180, fat: 60 },
    meals: [{ id:'cena', nome:'Cena', righe:[{ foodId:'pizza', grammatura:390 }, { foodId:'pollo', grammatura:150 }] }],
  };
  const { changes } = optimizePlan(plan, foods, { usage: {} });
  assert.ok(!changes.some((c) => c.foodId === 'pizza'), 'la pizza fissa (390/390) non viene scalata');
});

test('v6 — senza range esplicito, tetto default +30% (no esplosioni)', () => {
  const foods = { riso: { id:'riso', kcal:130, carbo:28, prot:2.7, fat:0.3 } }; // niente range
  const plan = {
    target: { kcal: 3000, carbo: 600, prot: 20, fat: 5 }, // deficit carbo enorme
    meals: [{ id:'pranzo', nome:'Pra', righe:[{ foodId:'riso', grammatura:100 }] }],
  };
  const { changes } = optimizePlan(plan, foods, { usage: {} });
  const riso = changes.find((c) => c.foodId === 'riso');
  if (riso) assert.ok(riso.aG <= 130, `riso ${riso.aG}g non deve superare +30% (130g)`);
});

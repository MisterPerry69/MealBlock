import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeUsage, suggestGrams, rankFoodsForMeal } from './usage.js';

// storico di esempio: alcuni giorni con cibi in pasti diversi
const logs = [
  { data: '2026-07-28', meals: [
    { id: 'colazione', righe: [{ foodId: 'avena', grammatura: 80 }, { foodId: 'whey', grammatura: 40 }] },
    { id: 'cena', righe: [{ foodId: 'pollo', grammatura: 200 }] },
  ]},
  { data: '2026-07-29', meals: [
    { id: 'colazione', righe: [{ foodId: 'avena', grammatura: 90 }] },
    { id: 'pranzo', righe: [{ foodId: 'pollo', grammatura: 180 }] },
  ]},
];

test('computeUsage: conta gli usi di ogni cibo per pasto e le grammature', () => {
  const u = computeUsage(logs);
  // avena usata 2 volte a colazione
  assert.equal(u.avena.perMeal.colazione.count, 2);
  // pollo: 1 a cena, 1 a pranzo
  assert.equal(u.pollo.perMeal.cena.count, 1);
  assert.equal(u.pollo.perMeal.pranzo.count, 1);
});

test('suggestGrams: propone la grammatura tipica di un cibo in un pasto', () => {
  const u = computeUsage(logs);
  // avena a colazione: 80 e 90 -> mediana/ultima ~ 90 (usiamo l\'ultima usata)
  assert.equal(suggestGrams(u, 'avena', 'colazione'), 90);
  // cibo mai visto: null
  assert.equal(suggestGrams(u, 'sconosciuto', 'colazione'), null);
});

test('rankFoodsForMeal: mette prima i cibi piu usati in quel pasto', () => {
  const u = computeUsage(logs);
  const foods = { avena:{id:'avena'}, whey:{id:'whey'}, pollo:{id:'pollo'}, mela:{id:'mela'} };
  const ranked = rankFoodsForMeal(Object.values(foods), u, 'colazione');
  // avena (2 usi a colazione) e whey (1) devono precedere pollo/mela (0 a colazione)
  const ids = ranked.map((f) => f.id);
  assert.ok(ids.indexOf('avena') < ids.indexOf('pollo'), 'avena prima di pollo a colazione');
  assert.ok(ids.indexOf('whey') < ids.indexOf('mela'), 'whey prima di mela a colazione');
});

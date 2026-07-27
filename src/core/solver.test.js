import { test } from 'node:test';
import assert from 'node:assert/strict';
import { macrosOfRows, remainingTarget, redistribute } from './solver.js';

// Repertorio di prova: valori per 100g
const foods = {
  pollo: { kcal: 165, carbo: 0, prot: 31, fat: 3.6 },
  riso: { kcal: 130, carbo: 28, prot: 2.7, fat: 0.3 },
};

test('macrosOfRows somma i macro di piu righe scalati per grammatura', () => {
  const rows = [
    { foodId: 'pollo', grammatura: 200 }, // 2x i valori/100g
    { foodId: 'riso', grammatura: 100 },  // 1x i valori/100g
  ];

  const result = macrosOfRows(rows, foods);

  assert.deepEqual(result, {
    kcal: 165 * 2 + 130,
    carbo: 0 * 2 + 28,
    prot: 31 * 2 + 2.7,
    fat: 3.6 * 2 + 0.3,
  });
});

test('remainingTarget sottrae i macro bloccati dal target', () => {
  const target = { kcal: 2000, carbo: 200, prot: 150, fat: 60 };
  const locked = [
    { foodId: 'pollo', grammatura: 200 }, // 330 kcal, 0 C, 62 P, 7.2 F
  ];

  const result = remainingTarget(target, locked, foods);

  assert.deepEqual(result, {
    kcal: 2000 - 330,
    carbo: 200 - 0,
    prot: 150 - 62,
    fat: 60 - 7.2,
  });
});

test('redistribute scala una singola riga aperta per centrare il resto (dentro range)', () => {
  // Resto da coprire: 260 kcal. Riso = 130 kcal/100g -> servono 200g.
  // Partenza 150g, range +/-90% -> [15, 285]. 200g e dentro range.
  const rest = macrosOfRows([{ foodId: 'riso', grammatura: 200 }], foods);
  const openRows = [{ foodId: 'riso', grammatura: 150 }];

  const { rows } = redistribute({ rest, openRows, foods, defaultRangePct: 0.9 });

  assert.equal(rows[0].grammatura, 200);
});

test('redistribute non supera il range: clamp invece di salti assurdi', () => {
  // Serve tantissimo riso (2000 kcal), ma partiamo da 100g con range +/-40%.
  // Max consentito = 140g. Il motore deve fermarsi li, non sparare a 1500g.
  const rest = { kcal: 2000, carbo: 400, prot: 40, fat: 5 };
  const openRows = [{ foodId: 'riso', grammatura: 100 }];

  const { rows } = redistribute({ rest, openRows, foods, defaultRangePct: 0.4 });

  assert.equal(rows[0].grammatura, 140); // clampato al massimo del range
});

test('redistribute riporta lo scarto residuo onesto quando non copre il resto', () => {
  const rest = { kcal: 2000, carbo: 400, prot: 40, fat: 5 };
  const openRows = [{ foodId: 'riso', grammatura: 100 }];

  const { residual } = redistribute({ rest, openRows, foods, defaultRangePct: 0.4 });

  // A 140g di riso: 182 kcal, 39.2 C, 3.78 P, 0.42 F. Residuo = rest - coperto.
  assert.equal(Math.round(residual.kcal), 2000 - 182);
  assert.equal(Math.round(residual.carbo), Math.round(400 - 39.2));
});

test('redistribute bilancia due righe su piu macro (caso realistico)', () => {
  // Obiettivo: coprire esattamente 200g pollo + 300g riso.
  // Partiamo da grammature diverse; con range ampio il motore deve ritrovare
  // la combinazione che azzera lo scarto.
  const rest = macrosOfRows(
    [{ foodId: 'pollo', grammatura: 200 }, { foodId: 'riso', grammatura: 300 }],
    foods
  );
  const openRows = [
    { foodId: 'pollo', grammatura: 150 },
    { foodId: 'riso', grammatura: 150 },
  ];

  const { rows, residual } = redistribute({
    rest, openRows, foods, defaultRangePct: 1.5,
  });

  assert.equal(rows[0].grammatura, 200);
  assert.equal(rows[1].grammatura, 300);
  for (const m of ['kcal', 'carbo', 'prot', 'fat']) {
    assert.ok(Math.abs(residual[m]) < 1, `residuo ${m} vicino a zero`);
  }
});

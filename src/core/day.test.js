import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekdayKey, buildLog, recalcLog, switchDayType, recalcPlan, markSgarroDay, isSgarroDay, dayStatus, weekDays } from './day.js';

const foods = {
  pollo: { id: 'pollo', per100g: { kcal: 165, carbo: 0, prot: 31, fat: 3.6 } },
  riso:  { id: 'riso',  per100g: { kcal: 130, carbo: 28, prot: 2.7, fat: 0.3 } },
};

const template = {
  tipo: 'ON',
  target: { kcal: 1000, carbo: 100, prot: 100, fat: 20 },
  meals: [
    { id: 'pranzo', nome: 'Pranzo', righe: [{ foodId: 'pollo', grammatura: 200 }] },
    { id: 'cena',   nome: 'Cena',   righe: [{ foodId: 'riso',  grammatura: 100 }] },
  ],
};

test('weekdayKey mappa una data ISO alla chiave giorno (lun..dom)', () => {
  // 2026-07-27 e un lunedi.
  assert.equal(weekdayKey('2026-07-27'), 'lun');
  assert.equal(weekdayKey('2026-07-26'), 'dom');
});

test('buildLog crea un log dal template, con pranzo lavorativo bloccato di default', () => {
  // 2026-07-27 = lunedi (giorno lavorativo) -> pranzo bloccato.
  const log = buildLog('2026-07-27', template);

  assert.equal(log.data, '2026-07-27');
  assert.equal(log.tipo, 'ON');
  const pranzo = log.meals.find((m) => m.id === 'pranzo');
  const cena = log.meals.find((m) => m.id === 'cena');
  assert.equal(pranzo.righe[0].stato, 'bloccata'); // lavorativo -> default bloccato
  assert.equal(cena.righe[0].stato, 'aperta');
});

test('buildLog nel weekend non blocca il pranzo di default', () => {
  // 2026-07-26 = domenica.
  const log = buildLog('2026-07-26', template);
  const pranzo = log.meals.find((m) => m.id === 'pranzo');
  assert.equal(pranzo.righe[0].stato, 'aperta');
});

test('recalcLog ridistribuisce le righe aperte lasciando fisse le bloccate', () => {
  // Pranzo bloccato (pollo 200g = 330 kcal). Target 1000 kcal.
  // La cena (riso, aperta) deve scalare per avvicinarsi al resto.
  const log = buildLog('2026-07-27', template); // pranzo bloccato
  const result = recalcLog(log, template.target, foods);

  const pranzo = result.meals.find((m) => m.id === 'pranzo');
  const cena = result.meals.find((m) => m.id === 'cena');

  assert.equal(pranzo.righe[0].grammatura, 200); // bloccato: invariato
  assert.notEqual(cena.righe[0].grammatura, 100); // aperto: aggiustato
  assert.ok(result.residual, 'lo scarto residuo e riportato');
});

test('switchDayType: un pasto bloccato NON cambia contenuto cambiando ON/OFF', () => {
  const templateON = template; // pranzo pollo 200g, cena riso 100g
  const templateOFF = {
    tipo: 'OFF',
    target: { kcal: 800, carbo: 20, prot: 120, fat: 30 },
    meals: [
      // Nel template OFF il pranzo e DIVERSO (riso al posto del pollo).
      { id: 'pranzo', nome: 'Pranzo', righe: [{ foodId: 'riso', grammatura: 50 }] },
      { id: 'cena',   nome: 'Cena',   righe: [{ foodId: 'pollo', grammatura: 100 }] },
    ],
  };

  // Log ON con pranzo bloccato (pollo 200g, gia cucinato).
  const logON = buildLog('2026-07-27', templateON);
  assert.equal(logON.meals.find((m) => m.id === 'pranzo').righe[0].stato, 'bloccata');

  // Passo a OFF.
  const logOFF = switchDayType(logON, templateOFF);

  const pranzo = logOFF.meals.find((m) => m.id === 'pranzo');
  const cena = logOFF.meals.find((m) => m.id === 'cena');

  assert.equal(logOFF.tipo, 'OFF');
  // Il pranzo bloccato resta pollo 200g (cucinato), NON diventa riso del template OFF.
  assert.equal(pranzo.righe[0].foodId, 'pollo');
  assert.equal(pranzo.righe[0].grammatura, 200);
  assert.equal(pranzo.righe[0].stato, 'bloccata');
  // La cena (aperta) prende invece il contenuto del template OFF.
  assert.equal(cena.righe[0].foodId, 'pollo'); // template OFF ha pollo a cena
  assert.equal(cena.righe[0].stato, 'aperta');
});

test('recalcPlan: dimensiona le righe auto verso il target, lascia fisse le manuali', () => {
  // Banco da lavoro: pranzo con pollo grammatura FISSA (manuale) + riso AUTO.
  // Target: coprire 200g pollo + una certa quota di carbo dal riso.
  const target = { kcal: 590, carbo: 56, prot: 67.4, fat: 7.5 };
  const plan = {
    tipo: 'ON',
    target,
    meals: [
      { id: 'pranzo', nome: 'Pranzo', righe: [
        { foodId: 'pollo', grammatura: 200, auto: false }, // manuale, fissa
        { foodId: 'riso', grammatura: 100, auto: true },   // auto, da dimensionare
      ] },
    ],
  };

  const { plan: out, totals } = recalcPlan(plan, foods);
  const righe = out.meals[0].righe;

  assert.equal(righe[0].grammatura, 200);          // manuale: invariata
  assert.equal(righe[0].foodId, 'pollo');
  assert.notEqual(righe[1].grammatura, 100);        // auto: dimensionata
  assert.ok(totals, 'ritorna i totali per le barre');
  // totali vicini al target dopo il dimensionamento
  assert.ok(Math.abs(totals.kcal - target.kcal) < 60, 'kcal vicino al target');
});

test('recalcPlan: totali riflettono TUTTI i cibi (manuali + auto)', () => {
  const plan = {
    tipo: 'ON',
    target: { kcal: 1000, carbo: 100, prot: 100, fat: 20 },
    meals: [
      { id: 'colazione', nome: 'Colazione', righe: [
        { foodId: 'pollo', grammatura: 100, auto: false },
      ] },
    ],
  };
  const { totals } = recalcPlan(plan, foods);
  // 100g pollo = 165 kcal, 0 C, 31 P, 3.6 F
  assert.equal(Math.round(totals.kcal), 165);
  assert.equal(Math.round(totals.prot), 31);
});

test('markSgarroDay: blank canvas — stessi pasti ma svuotati', () => {
  const log = buildLog('2026-07-27', template);
  const s = markSgarroDay(log, true);
  assert.equal(s.tipo, 'SGARRO');
  assert.equal(s.tipoBase, 'ON');
  assert.equal(s.meals.length, log.meals.length);   // stessi contenitori
  assert.ok(s.meals.every((m) => m.righe.length === 0)); // ma vuoti
  assert.ok(isSgarroDay(s));
  assert.ok(!isSgarroDay(log));
});

test('markSgarroDay(false): ripristina pasti e tipo originali', () => {
  const log = buildLog('2026-07-27', template); // ON, con alimenti
  const s = markSgarroDay(log, true);
  const back = markSgarroDay(s, false);
  assert.equal(back.tipo, 'ON');
  assert.ok(!isSgarroDay(back));
  // i pasti originali sono tornati (pranzo aveva pollo)
  assert.equal(back.meals.find((m) => m.id === 'pranzo').righe[0].foodId, 'pollo');
});

test('dayStatus: non tracciato se nessun cibo spuntato', () => {
  const log = buildLog('2026-07-27', template);
  assert.equal(dayStatus(log, foods).stato, 'vuoto');
});

test('dayStatus: sgarro se giornata SGARRO o ha righe sgarro', () => {
  const s = markSgarroDay(buildLog('2026-07-27', template), true);
  assert.equal(dayStatus(s, foods).stato, 'sgarro');
  const log = buildLog('2026-07-27', template);
  log.meals[0].righe.push({ foodId: 'pollo', grammatura: 100, stato: 'bloccata', isSgarro: true, eaten: true });
  assert.equal(dayStatus(log, foods).stato, 'sgarro');
});

test('dayStatus: completo se ho spuntato qualcosa e nessuno sgarro', () => {
  const log = buildLog('2026-07-27', template);
  log.meals[0].righe[0].eaten = true;
  assert.equal(dayStatus(log, foods).stato, 'ok');
});

test('weekDays: ritorna i 7 giorni ISO (lun-dom) della settimana di una data', () => {
  // 2026-07-30 e giovedi -> la settimana va da lun 27 a dom 2 ago
  const days = weekDays('2026-07-30');
  assert.equal(days.length, 7);
  assert.equal(days[0], '2026-07-27'); // lunedi
  assert.equal(days[6], '2026-08-02'); // domenica
  assert.ok(days.includes('2026-07-30'));
});

test('weekDays: gestisce il cambio mese', () => {
  const days = weekDays('2026-08-01'); // sabato
  assert.equal(days[0], '2026-07-27');
  assert.equal(days[6], '2026-08-02');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekdayKey, buildLog, switchDayType, markSgarroDay, isSgarroDay, dayStatus, weekDays } from './day.js';

const foods = {
  pollo: { id: 'pollo', per100g: { kcal: 165, carbo: 0, prot: 31, fat: 3.6 } },
  riso:  { id: 'riso',  per100g: { kcal: 130, carbo: 28, prot: 2.7, fat: 0.3 } },
};

const template = {
  tipo: 'ON',
  meals: [
    { id: 'pranzo', nome: 'Pranzo', righe: [{ foodId: 'pollo', grammatura: 200 }] },
    { id: 'cena',   nome: 'Cena',   righe: [{ foodId: 'riso',  grammatura: 100 }] },
  ],
};
const targetON = { kcal: 1000, carbo: 100, prot: 100, fat: 20 };
const targetOFF = { kcal: 800, carbo: 20, prot: 120, fat: 30 };

test('weekdayKey mappa una data ISO alla chiave giorno (lun..dom)', () => {
  // 2026-07-27 e un lunedi.
  assert.equal(weekdayKey('2026-07-27'), 'lun');
  assert.equal(weekdayKey('2026-07-26'), 'dom');
});

test('buildLog crea un log dal template, con pranzo lavorativo bloccato di default', () => {
  // 2026-07-27 = lunedi (giorno lavorativo) -> pranzo bloccato.
  const log = buildLog('2026-07-27', template, targetON);

  assert.equal(log.data, '2026-07-27');
  assert.equal(log.tipo, 'ON');
  assert.deepEqual(log.target, targetON); // il target e copiato nel log, non un riferimento al piano
  const pranzo = log.meals.find((m) => m.id === 'pranzo');
  const cena = log.meals.find((m) => m.id === 'cena');
  assert.equal(pranzo.righe[0].stato, 'bloccata'); // lavorativo -> default bloccato
  assert.equal(cena.righe[0].stato, 'aperta');
});

test('buildLog nel weekend non blocca il pranzo di default', () => {
  // 2026-07-26 = domenica.
  const log = buildLog('2026-07-26', template, targetON);
  const pranzo = log.meals.find((m) => m.id === 'pranzo');
  assert.equal(pranzo.righe[0].stato, 'aperta');
});

test('buildLog: il target del log e un clone, non condivide riferimento con quello passato', () => {
  const log = buildLog('2026-07-27', template, targetON);
  log.target.kcal = 999;
  assert.equal(targetON.kcal, 1000); // l'originale non e stato mutato
});

test('switchDayType: cambia tipo E target, i pasti restano identici', () => {
  const log = buildLog('2026-07-27', template, targetON); // ON, pranzo pollo 200g bloccato, cena riso 100g aperta
  const out = switchDayType(log, 'OFF', targetOFF);

  assert.equal(out.tipo, 'OFF');
  assert.deepEqual(out.target, targetOFF); // il target ora e quello OFF
  assert.deepEqual(out.meals, log.meals); // contenuto identico, nessuna ricostruzione dal template
  assert.notEqual(out, log); // nuovo oggetto, non mutazione in place
});

test('switchDayType: non muta il log originale', () => {
  const log = buildLog('2026-07-27', template, targetON);
  const originalTipo = log.tipo;
  switchDayType(log, 'OFF', targetOFF);
  assert.equal(log.tipo, originalTipo); // il log passato resta invariato
  assert.deepEqual(log.target, targetON); // idem per il target
});

test('markSgarroDay: blank canvas — stessi pasti ma svuotati', () => {
  const log = buildLog('2026-07-27', template, targetON);
  const s = markSgarroDay(log, true);
  assert.equal(s.tipo, 'SGARRO');
  assert.equal(s.tipoBase, 'ON');
  assert.equal(s.meals.length, log.meals.length);   // stessi contenitori
  assert.ok(s.meals.every((m) => m.righe.length === 0)); // ma vuoti
  assert.ok(isSgarroDay(s));
  assert.ok(!isSgarroDay(log));
});

test('markSgarroDay(false): ripristina pasti e tipo originali', () => {
  const log = buildLog('2026-07-27', template, targetON); // ON, con alimenti
  const s = markSgarroDay(log, true);
  const back = markSgarroDay(s, false);
  assert.equal(back.tipo, 'ON');
  assert.ok(!isSgarroDay(back));
  // i pasti originali sono tornati (pranzo aveva pollo)
  assert.equal(back.meals.find((m) => m.id === 'pranzo').righe[0].foodId, 'pollo');
});

test('dayStatus: non tracciato se nessun cibo spuntato', () => {
  const log = buildLog('2026-07-27', template, targetON);
  assert.equal(dayStatus(log, foods).stato, 'vuoto');
});

test('dayStatus: sgarro se giornata SGARRO o ha righe sgarro', () => {
  const s = markSgarroDay(buildLog('2026-07-27', template, targetON), true);
  assert.equal(dayStatus(s, foods).stato, 'sgarro');
  const log = buildLog('2026-07-27', template, targetON);
  log.meals[0].righe.push({ foodId: 'pollo', grammatura: 100, stato: 'bloccata', isSgarro: true, eaten: true });
  assert.equal(dayStatus(log, foods).stato, 'sgarro');
});

test('dayStatus: completo se ho spuntato qualcosa e nessuno sgarro', () => {
  const log = buildLog('2026-07-27', template, targetON);
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

// seed.js — dati di esempio per far girare l'app subito con lo store mock.
// Sono valori PLACEHOLDER: li sostituirai dalle schermate Piani e Repertorio.

export const seedFoods = {
  avena:      { id: 'avena',      nome: 'Fiocchi d\'avena', per100g: { kcal: 370, carbo: 60, prot: 13, fat: 7 } },
  albume:     { id: 'albume',     nome: 'Albume',           per100g: { kcal: 52,  carbo: 1,  prot: 11, fat: 0.2 } },
  uovo:       { id: 'uovo',       nome: 'Uovo intero',      per100g: { kcal: 143, carbo: 0.7, prot: 13, fat: 10 } },
  pollo:      { id: 'pollo',      nome: 'Petto di pollo',   per100g: { kcal: 165, carbo: 0,  prot: 31, fat: 3.6 } },
  riso:       { id: 'riso',       nome: 'Riso bianco',      per100g: { kcal: 130, carbo: 28, prot: 2.7, fat: 0.3 } },
  patate:     { id: 'patate',     nome: 'Patate',           per100g: { kcal: 77,  carbo: 17, prot: 2,  fat: 0.1 } },
  olio:       { id: 'olio',       nome: 'Olio d\'oliva',    per100g: { kcal: 884, carbo: 0,  prot: 0,  fat: 100 } },
  mandorle:   { id: 'mandorle',   nome: 'Mandorle',         per100g: { kcal: 579, carbo: 22, prot: 21, fat: 49 } },
  yogurt:     { id: 'yogurt',     nome: 'Yogurt greco 0%',  per100g: { kcal: 59,  carbo: 3.6, prot: 10, fat: 0.4 } },
};

// Due giornate-tipo: ON (piu carbo, meno grassi) e OFF (meno carbo, piu grassi).
// Ogni pasto ha righe {foodId, grammatura}. Le grammature sono un punto di
// partenza: il motore le aggiusta entro range quando qualcosa cambia.
export const seedTemplates = {
  ON: {
    tipo: 'ON',
    target: { kcal: 1620, carbo: 145, prot: 180, fat: 32 },
    meals: [
      { id: 'colazione', nome: 'Colazione', righe: [
        { foodId: 'avena', grammatura: 80 },
        { foodId: 'albume', grammatura: 200 },
      ] },
      { id: 'pranzo', nome: 'Pranzo', righe: [
        { foodId: 'pollo', grammatura: 200 },
        { foodId: 'riso', grammatura: 120 },
      ] },
      { id: 'spuntino', nome: 'Spuntino', righe: [
        { foodId: 'yogurt', grammatura: 200 },
      ] },
      { id: 'cena', nome: 'Cena', righe: [
        { foodId: 'pollo', grammatura: 180 },
        { foodId: 'patate', grammatura: 300 },
        { foodId: 'olio', grammatura: 10 },
      ] },
    ],
  },
  OFF: {
    tipo: 'OFF',
    target: { kcal: 1245, carbo: 12, prot: 155, fat: 64 },
    meals: [
      { id: 'colazione', nome: 'Colazione', righe: [
        { foodId: 'uovo', grammatura: 150 },
        { foodId: 'albume', grammatura: 100 },
      ] },
      { id: 'pranzo', nome: 'Pranzo', righe: [
        { foodId: 'pollo', grammatura: 200 },
        { foodId: 'olio', grammatura: 10 },
      ] },
      { id: 'spuntino', nome: 'Spuntino', righe: [
        { foodId: 'mandorle', grammatura: 30 },
      ] },
      { id: 'cena', nome: 'Cena', righe: [
        { foodId: 'pollo', grammatura: 180 },
        { foodId: 'olio', grammatura: 10 },
      ] },
    ],
  },
};

// Schema settimanale: lun-mar-mer-gio-ven-sab-dom. ON = allenamento.
// Placeholder: 3 ON / 4 OFF. Lo cambierai dalle impostazioni.
export const seedSchedule = {
  mappa: { lun: 'ON', mar: 'OFF', mer: 'ON', gio: 'OFF', ven: 'ON', sab: 'OFF', dom: 'OFF' },
};

// ============================================================
//  MealBlock — DATA LAYER (seed)
//  Fonte di verità iniziale. Al primo avvio FOODS viene copiato
//  in localStorage e diventa il database "vivo" editabile.
//  TARGETS e BLOCKS restano qui (CRUD blocchi = fase 2).
//
//  Tutti i macro sono PER 100g. I prodotti "a porzione"
//  (pizza_lidl, kinder_cereali) sono normalizzati a 100g e
//  portano un campo `unit` con la porzione di riferimento,
//  usato solo per la UI: l'engine ragiona sempre in grammi.
// ============================================================

const SEED_FOODS = {
  // ---- CARB ----
  oats:              { label: "Avena",              kcal: 372, carbs: 58.7, protein: 13.5, fat: 7,   cat: "carb", snackOk: true },
  fusilli_integrali: { label: "Fusilli integrali",  kcal: 344, carbs: 65,   protein: 13,   fat: 1.9, cat: "carb" },
  couscous:          { label: "Couscous",           kcal: 349, carbs: 70,   protein: 12,   fat: 1.5, cat: "carb" },
  corn_flakes:       { label: "Corn flakes",        kcal: 370, carbs: 84,   protein: 7,    fat: 0.5, cat: "carb", snackOk: true },
  fette_biscottate:  { label: "Fette biscottate",   kcal: 389, carbs: 70.8, protein: 11.7, fat: 4.9, cat: "carb" },
  pure:              { label: "Purè",               kcal: 65,  carbs: 11.5, protein: 2.2,  fat: 0.6, cat: "carb", softMax: 500 },
  pane:              { label: "Pane",               kcal: 265, carbs: 49,   protein: 9,    fat: 3.2, cat: "carb" }, // standard, da ritoccare
  marmellata:        { label: "Marmellata",         kcal: 183, carbs: 44.3, protein: 0.4,  fat: 0.1, cat: "carb" },

  // ---- PROTEIN ----
  whey:              { label: "Whey",               kcal: 372, carbs: 6.9,  protein: 70,   fat: 6.5, cat: "protein", snackOk: true },
  skyr:              { label: "Skyr",               kcal: 64,  carbs: 4,    protein: 11,   fat: 0.2, cat: "protein", snackOk: true, pack: { size: 350, label: "vasetto" } },
  pollo:             { label: "Pollo",              kcal: 99,  carbs: 0,    protein: 23,   fat: 0.8, cat: "protein" },
  tonno:             { label: "Tonno",              kcal: 166, carbs: 0,    protein: 28,   fat: 6,   cat: "protein", pack: { size: 80, label: "scatoletta" } },
  uova:              { label: "Uova",               kcal: 143, carbs: 1,    protein: 13,   fat: 10,  cat: "protein", pack: { size: 60, label: "uovo" } },
  mozzarella_light:  { label: "Mozzarella light",   kcal: 206, carbs: 1.3,  protein: 25,   fat: 11.3,cat: "protein", pack: { size: 125, label: "panetto" } },
  burger_vegetali:   { label: "Burger vegetali",    kcal: 292, carbs: 17,   protein: 27,   fat: 12,  cat: "protein" },

  // ---- FAT ---- (softMax = porzione realistica oltre cui il solver penalizza)
  olio_oliva:        { label: "Olio d'oliva",       kcal: 884, carbs: 0,    protein: 0,    fat: 100, cat: "fat", softMax: 15 },
  peanut_butter:     { label: "Burro d'arachidi",   kcal: 617, carbs: 14,   protein: 25.8, fat: 49,  cat: "fat", snackOk: true, softMax: 25 },
  cioccolato_74:     { label: "Cioccolato 74%",     kcal: 571, carbs: 32,   protein: 9.9,  fat: 42,  cat: "fat", snackOk: true, softMax: 30 },

  // ---- FRUIT ----
  banana:            { label: "Banana",             kcal: 89,  carbs: 23,   protein: 1.1,  fat: 0.3, cat: "fruit", snackOk: true }, // standard, da ritoccare
  mela:              { label: "Mela",               kcal: 52,  carbs: 14,   protein: 0.3,  fat: 0.2, cat: "fruit", snackOk: true }, // standard, da ritoccare

  // ---- EXTRA (prodotti a porzione) ----
  pizza_lidl:        { label: "Pizza proteica Lidl", kcal: 187, carbs: 27.1, protein: 12.9, fat: 2.3, cat: "extra",
                       unit: { portion: 390, label: "porzione" } }, // Taverna Giuseppe 390g = 729kcal/105.7C/50.3P/9F
  kinder_cereali:    { label: "Kinder Cereali",     kcal: 561, carbs: 53.2, protein: 7.2,  fat: 35.3,cat: "extra",
                       unit: { portion: 23.5, label: "barretta" } }, // 1 barretta 23.5g = 132kcal/12.5C/1.7P/8.3F
};

// ------------------------------------------------------------
//  TARGETS — i due profili giornata
//  (coerenti: P*4 + C*4 + F*9 = kcal)
// ------------------------------------------------------------
const TARGETS = {
  ON:  { kcal: 2630, protein: 180, carbs: 320, fat: 70 },
  OFF: { kcal: 2330, protein: 180, carbs: 200, fat: 90 },
};

// tolleranze "in target" per il semaforo
const TOLERANCE = { protein: 5, carbs: 10, fat: 10, kcal: 50 };

// pesi del solver (proteine e kcal contano di più)
const SOLVER_WEIGHTS = { protein: 3, kcal: 2, carbs: 1, fat: 1 };

// ------------------------------------------------------------
//  BLOCKS — moduli pasto.
//  Ogni item: { food, grams } dove grams è un numero (fixed)
//  oppure "flex" (valvola che l'engine regola).
//  `slot` = fascia UI: colazione | pranzo | merenda | cena | snack
//  `default` (su breakfast/snack) = grammature base per ON/OFF.
//  Grammature derivate dall'ottimizzazione (vedi spec §4).
// ------------------------------------------------------------
// Nei blocchi: { food, grams:N } = fisso; { food, range:[min,max] } = il solver
// sceglie la grammatura entro il range (step 5g). I prodotti a porzione e i
// condimenti restano fissi o con range stretto.
const BLOCKS = {
  // ---- COLAZIONE ----
  breakfast: {
    label: "Colazione", slot: "colazione",
    items: [
      { food: "oats",  range: [60, 120] },
      { food: "whey",  range: [30, 50] },
    ],
    onExtras:  [{ food: "banana", range: [80, 150] }, { food: "peanut_butter", range: [0, 25] }],
    offExtras: [{ food: "cioccolato_74", range: [10, 30] }, { food: "peanut_butter", range: [0, 25] }],
  },

  // ---- WORK SNACK (fisso quotidiano) ----
  work_snack: {
    label: "Work snack", slot: "snack", fixedDaily: true,
    items: [{ food: "kinder_cereali", grams: 23.5 }],
  },

  // ---- MERENDA ----
  snack: {
    label: "Merenda", slot: "merenda",
    items: [
      { food: "skyr",       range: [200, 300] },
      { food: "marmellata", range: [15, 30] },
    ],
    onExtras:  [{ food: "corn_flakes", range: [20, 60] }, { food: "peanut_butter", range: [0, 25] }],
    offExtras: [{ food: "peanut_butter", range: [10, 25] }, { food: "cioccolato_74", range: [0, 25] }],
  },

  // ---- PRANZO ----
  lunch_A: { label: "Pranzo · Couscous + Mozzarella", slot: "pranzo",
    items: [{ food: "couscous", range: [60, 160] }, { food: "mozzarella_light", range: [80, 150] }] },
  lunch_B: { label: "Pranzo · Pasta + Mozzarella", slot: "pranzo",
    items: [{ food: "fusilli_integrali", range: [70, 180] }, { food: "mozzarella_light", range: [80, 150] }] },
  lunch_C: { label: "Pranzo · Pasta + Tonno", slot: "pranzo",
    items: [{ food: "fusilli_integrali", range: [70, 180] }, { food: "tonno", range: [80, 160] }] },

  // ---- CENA ----
  dinner_A: { label: "Cena · Pollo + Purè", slot: "cena",
    items: [{ food: "pollo", range: [150, 280] }, { food: "pure", range: [150, 500] }, { food: "olio_oliva", range: [5, 15] }] },
  dinner_B: { label: "Cena · Uova + Pane", slot: "cena",
    items: [{ food: "uova", range: [120, 300] }, { food: "pane", range: [40, 120] }] },
  dinner_C: { label: "Cena · Burger + Pane", slot: "cena",
    items: [{ food: "burger_vegetali", range: [150, 250] }, { food: "pane", range: [40, 120] }] },
  dinner_D: { label: "Cena · Pizza proteica", slot: "cena",
    items: [{ food: "pizza_lidl", grams: 390 }] },
};

// opzioni selezionabili per slot (per generatore e UI)
const BLOCK_OPTIONS = {
  colazione: ["breakfast"],
  pranzo:    ["lunch_A", "lunch_B", "lunch_C"],
  merenda:   ["snack"],
  cena:      ["dinner_A", "dinner_B", "dinner_C", "dinner_D"],
};

// regole "morbide" dei giorni della settimana (0=Dom ... 6=Sab)
// default: Lun/Mer/Ven = ON
const DEFAULT_ON_DAYS = [1, 3, 5];

// limiti di frequenza settimanale per BLOCCO (quante volte può apparire in 7gg)
const BLOCK_WEEK_LIMITS = {
  lunch_C: 2,   // tonno max 2/sett
  dinner_D: 1,  // pizza Lidl max 1/sett
};
// limiti per ALIMENTO dentro i blocchi (somma apparizioni nei pasti scelti)
const FOOD_WEEK_LIMITS = {
  mozzarella_light: 3, // compare in lunch_A e lunch_B → max 3 tot
  tonno: 2,
};

// ------------------------------------------------------------
//  Esportazione (sia come globals per <script> sia per moduli)
// ------------------------------------------------------------
const SEED = {
  FOODS: SEED_FOODS,
  TARGETS,
  TOLERANCE,
  SOLVER_WEIGHTS,
  BLOCKS,
  BLOCK_OPTIONS,
  DEFAULT_ON_DAYS,
  BLOCK_WEEK_LIMITS,
  FOOD_WEEK_LIMITS,
};

if (typeof window !== "undefined") window.MB_SEED = SEED;
if (typeof module !== "undefined") module.exports = SEED;

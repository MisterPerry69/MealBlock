// ============================================================
//  data.seed.js — dati nutrizionali di partenza (dalla v1)
//  Usati come mock in sviluppo e come seed iniziale del DB (GAS).
//  kind: "sfuso" (range [min,max], il solver regola) | "fisso" (fixed g)
// ============================================================
(function () {
  "use strict";

  const FOODS = {
    // ---- CARB ----
    oats:              { id:"oats", label:"Avena", kcal:372, carbs:58.7, protein:13.5, fat:7, cat:"carb", kind:"sfuso", rangeMin:50, rangeMax:130, snackOk:true, emoji:"🌾" },
    fusilli_integrali: { id:"fusilli_integrali", label:"Fusilli integrali", kcal:344, carbs:65, protein:13, fat:1.9, cat:"carb", kind:"sfuso", rangeMin:70, rangeMax:180, emoji:"🍝" },
    couscous:          { id:"couscous", label:"Couscous", kcal:349, carbs:70, protein:12, fat:1.5, cat:"carb", kind:"sfuso", rangeMin:60, rangeMax:160, emoji:"🍚" },
    corn_flakes:       { id:"corn_flakes", label:"Corn flakes", kcal:370, carbs:84, protein:7, fat:0.5, cat:"carb", kind:"sfuso", rangeMin:20, rangeMax:60, snackOk:true, emoji:"🥣" },
    fette_biscottate:  { id:"fette_biscottate", label:"Fette biscottate", kcal:389, carbs:70.8, protein:11.7, fat:4.9, cat:"carb", kind:"sfuso", rangeMin:20, rangeMax:80, emoji:"🍞" },
    pure:              { id:"pure", label:"Purè", kcal:65, carbs:11.5, protein:2.2, fat:0.6, cat:"carb", kind:"sfuso", rangeMin:150, rangeMax:550, emoji:"🥔" },
    pane:              { id:"pane", label:"Pane", kcal:265, carbs:49, protein:9, fat:3.2, cat:"carb", kind:"sfuso", rangeMin:40, rangeMax:140, emoji:"🍞" },
    marmellata:        { id:"marmellata", label:"Marmellata", kcal:183, carbs:44.3, protein:0.4, fat:0.1, cat:"carb", kind:"sfuso", rangeMin:15, rangeMax:30, emoji:"🍓" },
    // ---- PROTEIN ----
    whey:              { id:"whey", label:"Whey", kcal:372, carbs:6.9, protein:70, fat:6.5, cat:"protein", kind:"sfuso", rangeMin:30, rangeMax:60, snackOk:true, emoji:"🥤" },
    skyr:              { id:"skyr", label:"Skyr", kcal:64, carbs:4, protein:11, fat:0.2, cat:"protein", kind:"sfuso", rangeMin:200, rangeMax:350, snackOk:true, packSize:350, packLabel:"vasetto", emoji:"🍦" },
    pollo:             { id:"pollo", label:"Pollo", kcal:99, carbs:0, protein:23, fat:0.8, cat:"protein", kind:"sfuso", rangeMin:150, rangeMax:300, emoji:"🍗" },
    tonno:             { id:"tonno", label:"Tonno", kcal:166, carbs:0, protein:28, fat:6, cat:"protein", kind:"fisso", fixed:80, packSize:80, packLabel:"scatoletta", emoji:"🐟" },
    uova:              { id:"uova", label:"Uova", kcal:143, carbs:1, protein:13, fat:10, cat:"protein", kind:"fisso", fixed:180, packSize:60, packLabel:"uovo", emoji:"🥚" },
    mozzarella_light:  { id:"mozzarella_light", label:"Mozzarella light", kcal:206, carbs:1.3, protein:25, fat:11.3, cat:"protein", kind:"fisso", fixed:125, packSize:125, packLabel:"panetto", dairy:true, emoji:"🧀" },
    burger_vegetali:   { id:"burger_vegetali", label:"Burger vegetali", kcal:292, carbs:17, protein:27, fat:12, cat:"protein", kind:"fisso", fixed:200, emoji:"🍔" },
    // ---- FAT ----
    olio_oliva:        { id:"olio_oliva", label:"Olio d'oliva", kcal:884, carbs:0, protein:0, fat:100, cat:"fat", kind:"sfuso", rangeMin:5, rangeMax:25, emoji:"🫒" },
    peanut_butter:     { id:"peanut_butter", label:"Burro d'arachidi", kcal:617, carbs:14, protein:25.8, fat:49, cat:"fat", kind:"sfuso", rangeMin:10, rangeMax:35, snackOk:true, emoji:"🥜" },
    cioccolato_74:     { id:"cioccolato_74", label:"Cioccolato 74%", kcal:571, carbs:32, protein:9.9, fat:42, cat:"fat", kind:"sfuso", rangeMin:10, rangeMax:40, snackOk:true, emoji:"🍫" },
    // ---- FRUIT ----
    banana:            { id:"banana", label:"Banana", kcal:89, carbs:23, protein:1.1, fat:0.3, cat:"fruit", kind:"sfuso", rangeMin:80, rangeMax:150, snackOk:true, emoji:"🍌" },
    mela:              { id:"mela", label:"Mela", kcal:52, carbs:14, protein:0.3, fat:0.2, cat:"fruit", kind:"fisso", fixed:150, snackOk:true, emoji:"🍎" },
    // ---- EXTRA ----
    pizza_lidl:        { id:"pizza_lidl", label:"Pizza proteica Lidl", kcal:187, carbs:27.1, protein:12.9, fat:2.3, cat:"extra", kind:"fisso", fixed:390, unitPortion:390, unitLabel:"porzione", emoji:"🍕" },
    kinder_cereali:    { id:"kinder_cereali", label:"Kinder Cereali", kcal:561, carbs:53.2, protein:7.2, fat:35.3, cat:"extra", kind:"fisso", fixed:23.5, unitPortion:23.5, unitLabel:"barretta", emoji:"🍫" },
  };

  // blocchi: solo nome + fascia + lista alimenti (i vincoli vivono sull'alimento)
  const BLOCKS = {
    breakfast:  { id:"breakfast", label:"Colazione", slot:"colazione", items:[{food:"oats"},{food:"whey"}], onExtras:[{food:"banana"}], offExtras:[{food:"cioccolato_74"}], fixedDaily:false, enabled:true },
    snack:      { id:"snack", label:"Merenda", slot:"merenda", items:[{food:"skyr"},{food:"marmellata"}], onExtras:[{food:"corn_flakes"},{food:"peanut_butter"}], offExtras:[{food:"peanut_butter"},{food:"cioccolato_74"}], enabled:true },
    lunch_A:    { id:"lunch_A", label:"Couscous + Mozzarella", slot:"pranzo", items:[{food:"couscous"},{food:"mozzarella_light"}], enabled:true },
    lunch_B:    { id:"lunch_B", label:"Pasta + Mozzarella", slot:"pranzo", items:[{food:"fusilli_integrali"},{food:"mozzarella_light"}], enabled:true },
    lunch_C:    { id:"lunch_C", label:"Pasta + Tonno", slot:"pranzo", items:[{food:"fusilli_integrali"},{food:"tonno"}], enabled:true },
    dinner_A:   { id:"dinner_A", label:"Pollo + Purè", slot:"cena", items:[{food:"pollo"},{food:"pure"},{food:"olio_oliva"}], enabled:true },
    dinner_B:   { id:"dinner_B", label:"Uova + Pane", slot:"cena", items:[{food:"uova"},{food:"pane"}], enabled:true },
    dinner_C:   { id:"dinner_C", label:"Burger + Pane", slot:"cena", items:[{food:"burger_vegetali"},{food:"pane"}], enabled:true },
    dinner_D:   { id:"dinner_D", label:"Pizza proteica", slot:"cena", items:[{food:"pizza_lidl"}], enabled:true },
  };

  const PREFS = {
    "targets.ON":  { kcal:2630, protein:180, carbs:320, fat:70 },
    "targets.OFF": { kcal:2330, protein:180, carbs:200, fat:90 },
    "onDaysDefault": [1,3,5],        // Lun/Mer/Ven
    "blockWeekLimits": { lunch_C:2, dinner_D:1 },
    "foodWeekLimits": { mozzarella_light:3, tonno:2 },
    "tolerance": { protein:5, carbs:10, fat:10, kcal:50 },
    "solverWeights": { protein:3, kcal:2, carbs:1, fat:1 },
    "mealWindows": { colazione:[6,12], pranzo:[12,15], merenda:[16,20], cena:[20,24] },
  };

  window.MB_SEED = { FOODS, BLOCKS, PREFS };
})();

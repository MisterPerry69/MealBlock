# MealPrep

Due giornate, ON e OFF, già a posto. Niente varietà da gestire, niente
"ti mancano 1600 kcal e arrangiati": il piano si riempie da solo e, quando la
realtà cambia (sgarro, giorno che diventa OFF a pranzo già cucinato), ricalcola
solo ciò che è ancora aperto e ti mostra lo scarto onesto.

## Provarla subito (senza backend)

```
npm start
```

Apri http://localhost:4173. Parte con dati di esempio in memoria (si perdono al
refresh finché non colleghi il backend). Serve un server perché i moduli ES non
funzionano aprendo `index.html` col doppio click.

## Test

```
npm test
```

Il motore ("riempi il resto") è coperto da test. È il pezzo che deve essere
corretto, quindi è stato scritto test-first.

## Collegare il backend (Google Sheet, dati salvati davvero)

I dati vivono nel tuo Drive, non sul dispositivo: niente rischio cache-clear.

1. Crea un Google Sheet nuovo e vuoto (nome libero, es. "MealPrep DB").
2. Estensioni → Apps Script. Incolla i file di `gas/` (`Code.gs`, `Api.gs`).
3. Esegui la funzione `setup` una volta (autorizza quando chiede).
4. Distribuisci → Nuova distribuzione → App web
   - Esegui come: **Me**
   - Chi ha accesso: **Solo me** (o "Chiunque con link" se vuoi aprirla da più
     dispositivi senza login in-app)
   - Copia l'URL `/exec`.
5. Incolla l'URL in [src/data/config.js](src/data/config.js) → `GAS_URL`.

Al primo avvio con backend vuoto, l'app semina da sola le due giornate di
esempio. Poi le modifichi da **Piani** e **Cibi**.

## Struttura

- `src/core/solver.js` — motore "riempi il resto" (puro, testato)
- `src/core/day.js` — logica del giorno (build log, blocchi, ricalcolo)
- `src/data/` — store (mock + GAS), seed, config
- `src/ui/` — schermate (Oggi, Piani, Cibi, Storico) + design system
- `gas/` — backend Google Apps Script

## Stato

v1: le 4 schermate, motore, PWA, backend collegabile. Le azioni di inserimento
(sgarro, nuovo cibo, target) usano per ora prompt di sistema — sostituibili con
form dedicati. Fase 2 prevista: proposte di swap/aggiunte dal motore, e
inserimento cibo assistito da Gemini (foto/voce).

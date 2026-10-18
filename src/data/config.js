// config.js — configurazione del backend.
//
// Finche GAS_URL e vuoto, l'app usa lo store MOCK in memoria (dati di esempio,
// persi al refresh) cosi puoi provarla subito.
//
// Quando hai distribuito il Web App GAS (vedi gas/Code.gs), incolla qui l'URL
// /exec: l'app iniziera a salvare sul tuo Google Sheet.

// Segreto condiviso col backend (Script Property TOKEN in GAS). Vuoto = nessun controllo.
export const API_TOKEN = '';

export const GAS_URL = 'https://script.google.com/macros/s/AKfycbxriTelQCKMY8nVRq7THuO58J9B2pN27wD-pTuKL647NGiIsb2ZDMog5t4KTpwWjx_5/exec';

// icons.js — icone Lucide (v1.27) incorporate. CSP-safe, nessun CDN a runtime.

export function svg(inner, size = 22) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

export const paths = {
  'chevronDown': "<path d=\"m6 9 6 6 6-6\" />",
  'cart': "<circle cx=\"8\" cy=\"21\" r=\"1\" /> <circle cx=\"19\" cy=\"21\" r=\"1\" /> <path d=\"M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12\" />",
  'pencil': "<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\" /> <path d=\"m15 5 4 4\" />",
  'sunrise': "<path d=\"M12 2v8\" /> <path d=\"m4.93 10.93 1.41 1.41\" /> <path d=\"M2 18h2\" /> <path d=\"M20 18h2\" /> <path d=\"m19.07 10.93-1.41 1.41\" /> <path d=\"M22 22H2\" /> <path d=\"m8 6 4-4 4 4\" /> <path d=\"M16 18a4 4 0 0 0-8 0\" />",
  'utensilsCrossed': "<path d=\"m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8\" /> <path d=\"M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7\" /> <path d=\"m2.1 21.8 6.4-6.3\" /> <path d=\"m19 5-7 7\" />",
  'apple': "<path d=\"M12 6.528V3a1 1 0 0 1 1-1h0\" /> <path d=\"M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21\" />",
  'moon': "<path d=\"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401\" />",
  'dumbbell': "<path d=\"M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z\" /> <path d=\"m2.5 21.5 1.4-1.4\" /> <path d=\"m20.1 3.9 1.4-1.4\" /> <path d=\"M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z\" /> <path d=\"m9.6 14.4 4.8-4.8\" />",
  'plus': "<path d=\"M5 12h14\" /> <path d=\"M12 5v14\" />",
  'check': "<path d=\"M20 6 9 17l-5-5\" />",
  'listTodo': "<path d=\"M13 5h8\" /> <path d=\"M13 12h8\" /> <path d=\"M13 19h8\" /> <path d=\"m3 17 2 2 4-4\" /> <rect x=\"3\" y=\"4\" width=\"6\" height=\"6\" rx=\"1\" />",
  'layoutGrid': "<rect width=\"7\" height=\"7\" x=\"3\" y=\"3\" rx=\"1\" /> <rect width=\"7\" height=\"7\" x=\"14\" y=\"3\" rx=\"1\" /> <rect width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\" /> <rect width=\"7\" height=\"7\" x=\"3\" y=\"14\" rx=\"1\" />",
  'history': "<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\" /> <path d=\"M3 3v5h5\" /> <path d=\"M12 7v5l4 2\" />",
  'x': "<path d=\"M18 6 6 18\" /> <path d=\"m6 6 12 12\" />",
  'chevronLeft': "<path d=\"m15 18-6-6 6-6\" />",
  'trash2': "<path d=\"M10 11v6\" /> <path d=\"M14 11v6\" /> <path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\" /> <path d=\"M3 6h18\" /> <path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\" />",
  'cookie': "<path d=\"M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5\" /> <path d=\"M8.5 8.5v.01\" /> <path d=\"M16 15.5v.01\" /> <path d=\"M12 12v.01\" /> <path d=\"M11 17v.01\" /> <path d=\"M7 14v.01\" />",
  'save': "<path d=\"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\" /> <path d=\"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7\" /> <path d=\"M7 3v4a1 1 0 0 0 1 1h7\" />",
};

export const icon = {
  colazione: (s) => svg(paths['sunrise'], s),
  pranzo: (s) => svg(paths['utensilsCrossed'], s),
  cena: (s) => svg(paths['moon'], s),
  spuntino: (s) => svg(paths['apple'], s),
  on: (s) => svg(paths['dumbbell'], s),
  off: (s) => svg(paths['moon'], s),
  plus: (s) => svg(paths['plus'], s),
  check: (s) => svg(paths['check'], s),
  tabOggi: (s) => svg(paths['listTodo'], s),
  tabPiani: (s) => svg(paths['layoutGrid'], s),
  tabStorico: (s) => svg(paths['history'], s),
  tabCibi: (s) => svg(paths['utensilsCrossed'], s),
  close: (s) => svg(paths['x'], s),
  pencil: (s) => svg(paths['pencil'], s),
  chevronDown: (s) => svg(paths['chevronDown'], s),
  tabSpesa: (s) => svg(paths['cart'], s),
  back: (s) => svg(paths['chevronLeft'], s),
  trash: (s) => svg(paths['trash2'], s),
  offplan: (s) => svg(paths['cookie'], s),
  save: (s) => svg(paths['save'], s),
};

// icona del pasto dall'id (id sconosciuti -> spuntino)
export const mealIcon = (id) => (['colazione', 'pranzo', 'cena'].includes(id) ? id : 'spuntino');

// dom.js — micro-helper per costruire elementi senza framework.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) { node.replaceChildren(); }

// icone inline (nessuna dipendenza esterna, CSP-safe)
const S = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
export const icon = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  lockClosed: `<svg ${S}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  lockOpen: `<svg ${S}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7-1.5"/></svg>`,
  plus: `<svg ${S}><path d="M12 5v14M5 12h14"/></svg>`,
  // dumbbell (ON) / moon (OFF)
  dumbbell: `<svg ${S}><path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/></svg>`,
  moon: `<svg ${S}><path d="M20 14a8 8 0 1 1-9.9-9.9A7 7 0 0 0 20 14z"/></svg>`,
  offplan: `<svg ${S}><path d="M12 2v20M2 12h20" opacity=".4"/><circle cx="12" cy="12" r="9"/></svg>`,
  back: `<svg ${S}><path d="M15 18l-6-6 6-6"/></svg>`,
  trash: `<svg ${S}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7"/></svg>`,
  wand: `<svg ${S}><path d="M15 4V2M15 10V8M12.5 5.5h-2M19.5 5.5h-2M6 20l10-10-2-2L4 18z"/></svg>`,
};

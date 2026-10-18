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

// input grammatura "usa e getta": al focus si svuota (il valore attuale resta
// come placeholder), cosi scrivi subito il nuovo numero senza cancellare a mano
// e senza far comparire la barra Android taglia/copia. Se esci senza scrivere,
// resta il valore di prima. Accetta virgola o punto.
export function gramInput({ value, extraClass = '', ariaLabel = 'Grammi', onCommit }) {
  const fmt = (g) => { const n = Number(g) || 0; return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10); };
  const input = el('input', {
    class: `erow__g ${extraClass}`, type: 'text', inputmode: 'decimal',
    value: fmt(value), 'aria-label': ariaLabel,
  });
  input.addEventListener('focus', () => { input.placeholder = input.value; input.value = ''; });
  const commit = () => {
    const raw = input.value.trim();
    if (raw === '') { input.value = input.placeholder; return; } // niente scritto: ripristina
    const n = parseFloat(raw.replace(',', '.'));
    const val = Number.isFinite(n) ? Math.max(0, n) : 0;
    input.value = fmt(val);
    onCommit(val);
  };
  input.addEventListener('blur', commit);
  // Invio conferma e chiude la tastiera
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  return input;
}

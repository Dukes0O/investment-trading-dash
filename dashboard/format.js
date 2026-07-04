// Formatting helpers shared across the dashboard.

export function fmtMoney(v, opts = {}) {
  if (v == null || !isFinite(v)) return '—';
  const { compact = false, sign = false } = opts;
  const abs = Math.abs(v);
  let str;
  if (compact && abs >= 1_000_000) {
    str = '$' + (abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2) + 'M';
  } else if (compact && abs >= 10_000) {
    str = '$' + (abs / 1_000).toFixed(1) + 'K';
  } else {
    str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (v < 0) return (sign ? '−' : '−') + str;
  return (sign ? '+' : '') + str;
}

export function fmtNum(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(v, opts = {}) {
  if (v == null || !isFinite(v)) return '—';
  const { sign = true, digits = 2 } = opts;
  const s = v < 0 ? '−' : (sign ? '+' : '');
  return s + Math.abs(v).toFixed(digits) + '%';
}

export function fmtQty(v) {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// el('div', {class: 'x', onclick: fn}, child1, child2 …) — small DOM builder.
// Children are appended via textContent-safe nodes; strings never hit innerHTML.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2), v);
    } else if (k === 'dataset') {
      Object.assign(node.dataset, v);
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(node.style, v);
    } else {
      node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(node, children);
  return node;
}

export function svgEl(tag, attrs = {}, ...children) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, String(v));
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

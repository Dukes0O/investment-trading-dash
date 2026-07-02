// Persistent app state: positions, watchlist, and settings in localStorage.

const POSITIONS_KEY = 'trenddesk.positions.v1';
const SETTINGS_KEY = 'trenddesk.settings.v1';

const listeners = new Set();

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---- Positions ----
// Position: { id, symbol, qty, costBasis (per share), openedAt (ISO date), notes }
// qty of 0 means watchlist-only.

let positions = load(POSITIONS_KEY, null);

if (positions === null) {
  // First run: seed a small example portfolio so the dashboard demonstrates
  // itself before the user enters real holdings. Clearly marked as sample data.
  positions = [
    { id: genId(), symbol: 'AAPL', qty: 25, costBasis: 168.4, openedAt: '2025-09-15', notes: 'Sample position — replace with your own' },
    { id: genId(), symbol: 'MSFT', qty: 12, costBasis: 402.1, openedAt: '2025-11-03', notes: 'Sample position — replace with your own' },
    { id: genId(), symbol: 'SPY', qty: 18, costBasis: 512.75, openedAt: '2025-06-20', notes: 'Sample position — replace with your own' },
    { id: genId(), symbol: 'NVDA', qty: 0, costBasis: 0, openedAt: '', notes: 'Sample watchlist entry' },
  ];
  save(POSITIONS_KEY, positions);
}

export function genId() {
  return 'p' + Math.random().toString(36).slice(2, 10);
}

export function getPositions() {
  return positions.slice();
}

export function getHoldings() {
  return positions.filter((p) => p.qty > 0);
}

export function getSymbols() {
  return [...new Set(positions.map((p) => p.symbol))];
}

export function addPosition(pos) {
  positions.push({ ...pos, id: genId(), symbol: pos.symbol.toUpperCase().trim() });
  save(POSITIONS_KEY, positions);
  emit();
}

export function updatePosition(id, patch) {
  const i = positions.findIndex((p) => p.id === id);
  if (i === -1) return;
  positions[i] = { ...positions[i], ...patch };
  if (patch.symbol) positions[i].symbol = patch.symbol.toUpperCase().trim();
  save(POSITIONS_KEY, positions);
  emit();
}

export function removePosition(id) {
  positions = positions.filter((p) => p.id !== id);
  save(POSITIONS_KEY, positions);
  emit();
}

// ---- Settings ----
// provider: 'demo' | 'alphavantage' | 'twelvedata'

let settings = load(SETTINGS_KEY, {
  provider: 'demo',
  alphaVantageKey: '',
  twelveDataKey: '',
});

export function getSettings() {
  return { ...settings };
}

export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  save(SETTINGS_KEY, settings);
  emit();
}

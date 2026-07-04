// App state with two backends:
//   - backend mode: REST API over SQLite (server/); reads are served from an
//     in-memory mirror so views keep a synchronous read surface.
//   - fallback mode: localStorage, as before, when no server is running
//     (demo data only).
// initStore() must be awaited once (app.js does) before views render.

import { detectBackend, apiGet, apiSend } from './api.js';

const POSITIONS_KEY = 'trenddesk.positions.v1';
const SETTINGS_KEY = 'trenddesk.settings.v1';
const TRADES_KEY = 'trenddesk.trades.v1';

const listeners = new Set();
let backendMode = false;
let positions = [];
let trades = [];
let settings = { provider: 'demo', alphaVantageKey: '', twelveDataKey: '', hasKeys: null, accountSize: 0, riskPct: 1 };

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

export function genId() {
  return 'p' + Math.random().toString(36).slice(2, 10);
}

function samplePositions() {
  return [
    { id: genId(), symbol: 'AAPL', qty: 25, costBasis: 168.4, openedAt: '2025-09-15', notes: 'Sample position — replace with your own' },
    { id: genId(), symbol: 'MSFT', qty: 12, costBasis: 402.1, openedAt: '2025-11-03', notes: 'Sample position — replace with your own' },
    { id: genId(), symbol: 'SPY', qty: 18, costBasis: 512.75, openedAt: '2025-06-20', notes: 'Sample position — replace with your own' },
    { id: genId(), symbol: 'NVDA', qty: 0, costBasis: 0, openedAt: '', notes: 'Sample watchlist entry' },
  ];
}

// ---- Init / mode ----

export async function initStore() {
  const health = await detectBackend();
  backendMode = Boolean(health?.ok);

  if (!backendMode) {
    positions = load(POSITIONS_KEY, null);
    if (positions === null) {
      positions = samplePositions();
      save(POSITIONS_KEY, positions);
    }
    trades = load(TRADES_KEY, []);
    settings = { ...settings, ...load(SETTINGS_KEY, {}) };
    return;
  }

  // One-shot migration: hand the browser's positions (or the sample seed) to
  // an empty server. The server 409s if it already has data, so this is safe
  // across reloads and multiple browsers.
  if (health.positionsCount === 0) {
    const local = load(POSITIONS_KEY, null) ?? samplePositions();
    const localTrades = load(TRADES_KEY, []);
    const localSettings = load(SETTINGS_KEY, {});
    try {
      await apiSend('POST', '/import', { positions: local, trades: localTrades, settings: localSettings });
    } catch { /* another client won the race — fine */ }
  }

  await refreshFromBackend();
}

async function refreshFromBackend() {
  [positions, trades, settings] = await Promise.all([apiGet('/positions'), apiGet('/trades'), apiGet('/settings')]);
}

export function isBackend() {
  return backendMode;
}

// ---- Reads (synchronous, same surface as always) ----

export function getPositions() {
  return positions.slice();
}

export function getHoldings() {
  return positions.filter((p) => p.qty > 0);
}

export function getSymbols() {
  return [...new Set(positions.map((p) => p.symbol))];
}

export function getSettings() {
  return { ...settings };
}

export function getTrades() {
  if (backendMode) return trades.slice();
  return trades.slice().sort((a, b) => (a.executedAt < b.executedAt ? 1 : a.executedAt > b.executedAt ? -1 : 0));
}

// ---- Mutations (async: API in backend mode, localStorage otherwise) ----

export async function addPosition(pos) {
  if (backendMode) {
    const created = await apiSend('POST', '/positions', pos);
    positions.push(created);
  } else {
    positions.push({ ...pos, id: genId(), symbol: pos.symbol.toUpperCase().trim() });
    save(POSITIONS_KEY, positions);
  }
  emit();
}

export async function updatePosition(id, patch) {
  if (backendMode) {
    const updated = await apiSend('PUT', '/positions/' + encodeURIComponent(id), patch);
    const i = positions.findIndex((p) => p.id === id);
    if (i !== -1) positions[i] = updated;
  } else {
    const i = positions.findIndex((p) => p.id === id);
    if (i === -1) return;
    positions[i] = { ...positions[i], ...patch };
    if (patch.symbol) positions[i].symbol = patch.symbol.toUpperCase().trim();
    save(POSITIONS_KEY, positions);
  }
  emit();
}

export async function removePosition(id) {
  if (backendMode) {
    await apiSend('DELETE', '/positions/' + encodeURIComponent(id));
  }
  positions = positions.filter((p) => p.id !== id);
  if (!backendMode) save(POSITIONS_KEY, positions);
  emit();
}

export async function updateSettings(patch) {
  if (backendMode) {
    settings = await apiSend('PUT', '/settings', patch);
  } else {
    settings = { ...settings, ...patch };
    save(SETTINGS_KEY, settings);
  }
  emit();
}

// Market-data access for the dashboard.
//   Backend mode: GET /api/bars/:symbol — the server owns providers, API keys
//   and the per-day SQLite cache.
//   Fallback mode: deterministic demo data, generated client-side.
// Return shape is unchanged: { bars, source, error? }.

import { demoBars } from './demo.js';
import { apiGet } from './api.js';
import { isBackend } from './store.js';

export async function getDailyBars(symbol) {
  symbol = symbol.toUpperCase();
  if (!isBackend()) {
    return { bars: demoBars(symbol), source: 'demo' };
  }
  try {
    return await apiGet('/bars/' + encodeURIComponent(symbol));
  } catch (err) {
    return { bars: demoBars(symbol), source: 'demo (fallback)', error: err.message };
  }
}

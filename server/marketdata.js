// Daily-bars source with the same freshness ladder the browser used:
//   fresh-today DB cache → provider fetch (upserted into DB) → stale DB bars
//   → demo data. `db` may be null (CI / no-DB script runs) — then it's just
//   provider fetch → demo.

import { demoBars } from '../dashboard/demo.js';
import { fetchAlphaVantage, fetchTwelveData, fetchStooq } from './providers.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readBars(db, provider, symbol) {
  return db
    .prepare('SELECT date, open, high, low, close, volume FROM price_bars WHERE provider = ? AND symbol = ? ORDER BY date')
    .all(provider, symbol);
}

function writeBars(db, provider, symbol, bars) {
  const upsert = db.prepare(
    `INSERT INTO price_bars (provider, symbol, date, open, high, low, close, volume)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, symbol, date) DO UPDATE SET
       open = excluded.open, high = excluded.high, low = excluded.low,
       close = excluded.close, volume = excluded.volume`
  );
  const logFetch = db.prepare(
    `INSERT INTO fetch_log (provider, symbol, fetched_on) VALUES (?, ?, ?)
     ON CONFLICT(provider, symbol) DO UPDATE SET fetched_on = excluded.fetched_on`
  );
  db.transaction(() => {
    for (const b of bars) upsert.run(provider, symbol, b.date, b.open, b.high, b.low, b.close, b.volume ?? 0);
    logFetch.run(provider, symbol, today());
  })();
}

// Returns { bars, source, error? } — same shape the dashboard has always used.
export async function getDailyBars(symbol, { db = null, provider = 'demo', keys = {} } = {}) {
  symbol = symbol.toUpperCase();

  if (provider === 'demo') {
    return { bars: demoBars(symbol), source: 'demo' };
  }

  if (db) {
    const log = db.prepare('SELECT fetched_on FROM fetch_log WHERE provider = ? AND symbol = ?').get(provider, symbol);
    if (log?.fetched_on === today()) {
      const bars = readBars(db, provider, symbol);
      if (bars.length) return { bars, source: `${provider} (cached today)` };
    }
  }

  try {
    let bars;
    if (provider === 'stooq') {
      bars = await fetchStooq(symbol);
    } else if (provider === 'alphavantage') {
      if (!keys.alphaVantageKey) throw new Error('No Alpha Vantage API key set — add one in Settings.');
      bars = await fetchAlphaVantage(symbol, keys.alphaVantageKey);
    } else if (provider === 'twelvedata') {
      if (!keys.twelveDataKey) throw new Error('No Twelve Data API key set — add one in Settings.');
      bars = await fetchTwelveData(symbol, keys.twelveDataKey);
    } else {
      throw new Error(`Unknown provider ${provider}`);
    }
    if (db) writeBars(db, provider, symbol, bars);
    return { bars, source: provider };
  } catch (err) {
    if (db) {
      const stale = readBars(db, provider, symbol);
      if (stale.length) {
        const log = db.prepare('SELECT fetched_on FROM fetch_log WHERE provider = ? AND symbol = ?').get(provider, symbol);
        return { bars: stale, source: `${provider} (stale ${log?.fetched_on ?? 'cache'})`, error: err.message };
      }
    }
    return { bars: demoBars(symbol), source: 'demo (fallback)', error: err.message };
  }
}

// Settings the market-data layer needs, read from the DB with env fallbacks
// (env is how CI supplies keys).
export function marketConfig(db, getSetting) {
  return {
    provider: getSetting(db, 'provider', process.env.TRENDDESK_PROVIDER || 'demo'),
    keys: {
      alphaVantageKey: getSetting(db, 'alphaVantageKey', '') || process.env.ALPHAVANTAGE_API_KEY || '',
      twelveDataKey: getSetting(db, 'twelveDataKey', '') || process.env.TWELVEDATA_API_KEY || '',
    },
  };
}

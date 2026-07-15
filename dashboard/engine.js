// Session-level orchestration: fetch bars, run analysis, cache in memory.

import { getDailyBars } from './data.js';
import { analyzeSymbol } from './signals.js';
import { getSettings } from './store.js';

const cache = new Map(); // symbol -> { bars, source, error, analysis }
let cacheProvider = null;

export function invalidate() {
  cache.clear();
}

export async function getMarket(symbol) {
  const provider = getSettings().provider;
  if (provider !== cacheProvider) {
    cache.clear();
    cacheProvider = provider;
  }
  symbol = symbol.toUpperCase();
  if (cache.has(symbol)) return cache.get(symbol);
  const promise = (async () => {
    const { bars, source, error } = await getDailyBars(symbol);
    const analysis = analyzeSymbol(bars);
    return { bars, source, error, analysis };
  })();
  cache.set(symbol, promise);
  const result = await promise;
  cache.set(symbol, result);
  return result;
}

export async function getMarkets(symbols) {
  const out = new Map();
  const results = await Promise.all(symbols.map((s) => getMarket(s).then((r) => [s, r])));
  for (const [s, r] of results) out.set(s, r);
  return out;
}

// Like getMarkets, but invokes onResult(symbol, result, accumulated) as each
// symbol resolves. The server paces provider calls into per-minute waves, so a
// large refresh streams in rather than landing all at once — this lets the UI
// fill each tile as its wave arrives instead of blocking on the whole set.
export async function getMarketsStream(symbols, onResult) {
  const out = new Map();
  await Promise.all(symbols.map((s) =>
    getMarket(s).then((r) => {
      out.set(s, r);
      try { onResult?.(s, r, out); } catch { /* a render error for one symbol must not abort the rest */ }
    })
  ));
  return out;
}

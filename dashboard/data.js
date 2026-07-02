// Market-data layer. Three providers:
//   demo         — deterministic synthetic daily OHLCV, works offline (default)
//   alphavantage — Alpha Vantage TIME_SERIES_DAILY (free API key, CORS-enabled)
//   twelvedata   — Twelve Data /time_series (free API key, CORS-enabled)
// Responses are cached in localStorage and considered fresh for the rest of
// the calendar day, which respects the tight free-tier rate limits.

import { getSettings } from './store.js';

const CACHE_PREFIX = 'trenddesk.bars.v1.';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readCache(provider, symbol) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + provider + '.' + symbol);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry.day !== todayKey()) return null;
    return entry.bars;
  } catch {
    return null;
  }
}

function writeCache(provider, symbol, bars) {
  try {
    localStorage.setItem(
      CACHE_PREFIX + provider + '.' + symbol,
      JSON.stringify({ day: todayKey(), bars })
    );
  } catch {
    // localStorage full — drop stale bar caches and retry once.
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    }
    try {
      localStorage.setItem(
        CACHE_PREFIX + provider + '.' + symbol,
        JSON.stringify({ day: todayKey(), bars })
      );
    } catch { /* give up quietly; data still lives in memory */ }
  }
}

// ---- Demo provider ----
// Seeded PRNG so each symbol gets a stable, realistic-looking series with
// distinct trend regimes — enough structure for the analytics to be meaningful.

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_PROFILES = {
  AAPL: { start: 165, vol: 0.016 },
  MSFT: { start: 390, vol: 0.015 },
  NVDA: { start: 120, vol: 0.028 },
  SPY: { start: 500, vol: 0.009 },
  QQQ: { start: 430, vol: 0.012 },
  AMZN: { start: 175, vol: 0.019 },
  GOOGL: { start: 160, vol: 0.017 },
  TSLA: { start: 240, vol: 0.033 },
};

function demoBars(symbol, days = 500) {
  const profile = DEMO_PROFILES[symbol] || { start: 40 + (hashSeed(symbol) % 200), vol: 0.014 + (hashSeed(symbol) % 100) / 5000 };
  const rand = mulberry32(hashSeed('trenddesk-' + symbol));
  const bars = [];
  let price = profile.start * (0.55 + rand() * 0.3);
  // Regime-switching drift: alternating trending/chopping segments.
  let drift = 0.0006;
  let regimeLeft = 0;
  const end = new Date();
  const dates = [];
  const d = new Date(end);
  while (dates.length < days) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) dates.unshift(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  for (const date of dates) {
    if (regimeLeft <= 0) {
      regimeLeft = 25 + Math.floor(rand() * 60);
      const r = rand();
      drift = r < 0.42 ? 0.0022 : r < 0.68 ? -0.0016 : 0.0001; // up / down / sideways
    }
    regimeLeft--;
    const shock = (rand() + rand() + rand() - 1.5) * profile.vol * 1.6;
    const ret = drift + shock;
    const open = price * (1 + (rand() - 0.5) * profile.vol * 0.5);
    price = Math.max(1, price * (1 + ret));
    const close = price;
    const hi = Math.max(open, close) * (1 + rand() * profile.vol * 0.7);
    const lo = Math.min(open, close) * (1 - rand() * profile.vol * 0.7);
    const volume = Math.round(1e6 * (0.6 + rand() * 1.4) * (1 + Math.abs(ret) * 30));
    bars.push({
      date,
      open: round2(open),
      high: round2(hi),
      low: round2(lo),
      close: round2(close),
      volume,
    });
  }
  return bars;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

// ---- Alpha Vantage ----

async function fetchAlphaVantage(symbol, apiKey) {
  const url =
    'https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&outputsize=full' +
    `&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
  const json = await res.json();
  if (json['Error Message']) throw new Error(`Alpha Vantage: unknown symbol ${symbol}`);
  if (json['Note'] || json['Information']) {
    throw new Error('Alpha Vantage rate limit reached (free tier: 25 requests/day). Cached data will be used where available.');
  }
  const series = json['Time Series (Daily)'];
  if (!series) throw new Error('Alpha Vantage: unexpected response shape');
  const bars = Object.entries(series)
    .map(([date, v]) => ({
      date,
      open: parseFloat(v['1. open']),
      high: parseFloat(v['2. high']),
      low: parseFloat(v['3. low']),
      close: parseFloat(v['4. close']),
      volume: parseFloat(v['5. volume']),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return bars.slice(-600);
}

// ---- Twelve Data ----

async function fetchTwelveData(symbol, apiKey) {
  const url =
    'https://api.twelvedata.com/time_series?interval=1day&outputsize=600' +
    `&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
  const json = await res.json();
  if (json.status === 'error') throw new Error(`Twelve Data: ${json.message || 'request failed'}`);
  if (!json.values) throw new Error('Twelve Data: unexpected response shape');
  return json.values
    .map((v) => ({
      date: v.datetime.slice(0, 10),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: v.volume != null ? parseFloat(v.volume) : 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---- Public API ----

// Returns { bars, source, error? }. Falls back to any same-provider cache from
// a previous day, then to demo data, so the dashboard always renders.
export async function getDailyBars(symbol) {
  const { provider, alphaVantageKey, twelveDataKey } = getSettings();
  symbol = symbol.toUpperCase();

  if (provider === 'demo') {
    return { bars: demoBars(symbol), source: 'demo' };
  }

  const cached = readCache(provider, symbol);
  if (cached) return { bars: cached, source: provider + ' (cached today)' };

  try {
    let bars;
    if (provider === 'alphavantage') {
      if (!alphaVantageKey) throw new Error('No Alpha Vantage API key set — add one in Settings.');
      bars = await fetchAlphaVantage(symbol, alphaVantageKey);
    } else if (provider === 'twelvedata') {
      if (!twelveDataKey) throw new Error('No Twelve Data API key set — add one in Settings.');
      bars = await fetchTwelveData(symbol, twelveDataKey);
    } else {
      throw new Error(`Unknown provider ${provider}`);
    }
    writeCache(provider, symbol, bars);
    return { bars, source: provider };
  } catch (err) {
    // Stale cache (previous day) beats nothing.
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + provider + '.' + symbol);
      if (raw) {
        const entry = JSON.parse(raw);
        if (entry.bars?.length) {
          return { bars: entry.bars, source: `${provider} (stale ${entry.day})`, error: err.message };
        }
      }
    } catch { /* fall through */ }
    return { bars: demoBars(symbol), source: 'demo (fallback)', error: err.message };
  }
}

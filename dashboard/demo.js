// Demo market data: deterministic synthetic daily OHLCV with regime-switching
// drift. Pure module — no browser or Node dependencies — shared by the
// dashboard's offline fallback and the server/scripts pipeline.

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

export function demoBars(symbol, days = 500) {
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

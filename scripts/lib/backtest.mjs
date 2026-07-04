// Backtest engine: single-position, long/flat, next-open execution.
// Pure functions — unit-testable without I/O.
//
// Honesty rules baked in:
//   - Signals are computed on bar i's close and EXECUTED AT BAR i+1's OPEN
//     (no look-ahead, no trading on the close you just observed).
//   - A trailing stop is checked intrabar: if the low touches it, the exit
//     fills at the stop, or at the open when the bar gaps through it.
//   - Costs: 0.05% per side (0.1% round trip) — commissions/slippage proxy.
//   - Metrics are computed on mark-to-market equity, so drawdowns include
//     open positions, not just closed trades.

const COST_PER_SIDE = 0.0005;

// strategy contract:
//   warmup: number — first bar index eligible for signals
//   prepare(bars) -> ctx — precompute indicator arrays once
//   entry(i, ctx) -> boolean — evaluated when flat, on bar i's close
//   exit(i, ctx) -> boolean — evaluated when long, on bar i's close
//   trailStop?: { atrMult } — optional chandelier stop from highest close
export function simulate(bars, strategy) {
  const ctx = strategy.prepare(bars);
  const start = Math.max(strategy.warmup, 1);
  if (bars.length - start < 30) return null; // not enough history

  let inPos = false;
  let entryPrice = 0;
  let entryIdx = 0;
  let highestClose = 0;
  let pendingEntry = false;
  let pendingExit = false;
  let units = 1; // equity multiplier
  const trades = [];
  const equity = [];

  const atr = ctx.atr ?? null;

  for (let i = start; i < bars.length; i++) {
    const bar = bars[i];

    // 1. Execute orders queued on the previous close, at this bar's open.
    if (pendingEntry && !inPos) {
      inPos = true;
      entryPrice = bar.open * (1 + COST_PER_SIDE);
      entryIdx = i;
      highestClose = bar.open;
      pendingEntry = false;
    } else if (pendingExit && inPos) {
      closeTrade(bar.open, bar.date, 'signal');
      pendingExit = false;
    }

    // 2. Intrabar trailing stop.
    if (inPos && strategy.trailStop && atr?.[i] != null) {
      const stopLevel = highestClose - strategy.trailStop.atrMult * atr[i];
      if (bar.low <= stopLevel) {
        closeTrade(Math.min(stopLevel, bar.open), bar.date, 'stop');
      }
    }

    // 3. Signals on this close, executed next open.
    if (inPos) {
      highestClose = Math.max(highestClose, bar.close);
      if (strategy.exit(i, ctx)) pendingExit = true;
    } else if (strategy.entry(i, ctx)) {
      pendingEntry = true;
    }

    // 4. Mark-to-market equity.
    const mtm = inPos ? units * (bar.close / entryPrice) : units;
    equity.push({ date: bar.date, value: mtm, in: inPos });
  }
  // Close any open position at the last close for accounting.
  if (inPos) closeTrade(bars[bars.length - 1].close, bars[bars.length - 1].date, 'end');

  function closeTrade(price, date, reason) {
    const exitPrice = price * (1 - COST_PER_SIDE);
    const ret = exitPrice / entryPrice - 1;
    units *= 1 + ret;
    trades.push({
      entryDate: bars[entryIdx].date,
      exitDate: date,
      entryPrice: round2(entryPrice),
      exitPrice: round2(exitPrice),
      returnPct: round2(ret * 100),
      bars: null,
      reason,
    });
    inPos = false;
  }

  return { trades, equity, metrics: computeMetrics(bars.slice(start), equity, trades) };
}

export function buyAndHold(bars, warmup) {
  const start = Math.max(warmup, 1);
  const window = bars.slice(start);
  if (window.length < 30) return null;
  const p0 = window[0].open;
  const equity = window.map((b) => ({ date: b.date, value: b.close / p0 }));
  return { trades: [], equity, metrics: computeMetrics(window, equity, null) };
}

function computeMetrics(bars, equity, trades) {
  const last = equity[equity.length - 1].value;
  const years = equity.length / 252;
  let peak = -Infinity;
  let maxDD = 0;
  for (const e of equity) {
    peak = Math.max(peak, e.value);
    maxDD = Math.max(maxDD, (peak - e.value) / peak);
  }
  const m = {
    totalReturnPct: round2((last - 1) * 100),
    cagrPct: years > 0.2 ? round2((Math.pow(last, 1 / years) - 1) * 100) : null,
    maxDrawdownPct: round2(maxDD * 100),
    years: round2(years),
  };
  if (trades) {
    const wins = trades.filter((t) => t.returnPct > 0).length;
    m.trades = trades.length;
    m.winRatePct = trades.length ? round2((wins / trades.length) * 100) : null;
    m.avgTradePct = trades.length ? round2(trades.reduce((s, t) => s + t.returnPct, 0) / trades.length) : null;
    const inMarket = equity.filter((e) => e.in).length;
    m.exposurePct = round2((inMarket / equity.length) * 100);
  }
  return m;
}

// Downsample an equity curve to ~n points (always keeps the last point),
// values indexed to 100 at the start.
export function downsampleEquity(equity, n = 260) {
  if (!equity.length) return [];
  const step = Math.max(1, Math.floor(equity.length / n));
  const out = [];
  for (let i = 0; i < equity.length; i += step) out.push(equity[i]);
  if (out[out.length - 1] !== equity[equity.length - 1]) out.push(equity[equity.length - 1]);
  const base = out[0].value;
  return out.map((e) => ({ date: e.date, value: Math.round((e.value / base) * 10000) / 100 }));
}

function round2(v) {
  return v == null ? null : Math.round(v * 100) / 100;
}

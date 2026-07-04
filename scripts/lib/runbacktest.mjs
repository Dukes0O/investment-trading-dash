// Shared runner: backtest all presets + buy-and-hold for one symbol's bars.
// Used by both the API endpoint and the CLI so results are identical.

import { simulate, buyAndHold, downsampleEquity } from './backtest.mjs';
import { STRATEGIES } from './strategies.mjs';

export function runBacktests(symbol, bars, source) {
  const results = [];
  for (const s of STRATEGIES) {
    const r = simulate(bars, s);
    if (!r) continue;
    results.push({
      id: s.id,
      name: s.name,
      style: s.style,
      metrics: r.metrics,
      equity: downsampleEquity(r.equity),
      lastTrades: r.trades.slice(-8),
    });
  }
  const bh = buyAndHold(bars, Math.max(...STRATEGIES.map((s) => s.warmup)));
  return {
    symbol,
    source,
    bars: bars.length,
    from: bars[0]?.date ?? null,
    to: bars[bars.length - 1]?.date ?? null,
    results,
    buyHold: bh ? { metrics: bh.metrics, equity: downsampleEquity(bh.equity) } : null,
  };
}

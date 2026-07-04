#!/usr/bin/env node
// Backtest the strategy presets over the portfolio's symbols and write the
// committed data/backtests.json printout (the Strategy lab's static
// fallback). With the backend running, the lab can also compute fresh
// results per symbol via GET /api/backtest/:symbol.
//
// Usage: node scripts/backtest.mjs [--symbol GLD] [--provider stooq|demo|...]

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../server/db.js';
import { getDailyBars } from '../server/marketdata.js';
import { loadPortfolio } from './lib/source.mjs';
import { runBacktests } from './lib/runbacktest.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const source = loadPortfolio();
const provider = arg('provider', process.env.TRENDDESK_PROVIDER || source.provider);
const only = arg('symbol');
const symbols = only ? [only.toUpperCase()] : [...new Set(source.positions.map((p) => p.symbol))];

const out = { generatedAt: new Date().toISOString(), provider, symbols: {} };
for (const sym of symbols) {
  const { bars, source: barSource, error } = await getDailyBars(sym, { db: source.db, provider, keys: source.keys });
  const result = runBacktests(sym, bars, barSource + (error ? ` (${error})` : ''));
  out.symbols[sym] = result;
  const best = result.results.slice().sort((a, b) => (b.metrics.totalReturnPct ?? -1e9) - (a.metrics.totalReturnPct ?? -1e9))[0];
  console.error(`  ${sym}: ${result.bars} bars (${result.from} → ${result.to}) via ${barSource}` +
    (best ? ` | best: ${best.id} ${best.metrics.totalReturnPct}% vs B&H ${result.buyHold?.metrics.totalReturnPct}%` : ' | not enough history'));
}

const outPath = join(ROOT, 'data', 'backtests.json');
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(outPath);

#!/usr/bin/env node
// Build the weekly technicals dossier: for every portfolio/watchlist symbol,
// fetch daily bars and run the rule engine (dashboard/indicators.js +
// signals.js, imported verbatim). Output is the compact JSON the weekly
// report session reads — indicators and rule verdicts, no full bar arrays.
//
// Usage: node scripts/build-dossier.mjs [--date YYYY-MM-DD] [--provider demo|alphavantage|twelvedata] [--out path]

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { loadPortfolio } from './lib/source.mjs';
import { getDailyBars } from '../server/marketdata.js';
import { ROOT } from '../server/db.js';
import { analyzeSymbol, optionsStrategies } from '../dashboard/signals.js';

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const date = arg('date', new Date().toISOString().slice(0, 10));
const source = loadPortfolio();
const provider = arg('provider', process.env.TRENDDESK_PROVIDER || source.provider);
const outPath = arg('out', join(ROOT, 'data', `dossier-${date}.json`));

const positions = source.positions;
if (!positions.length) {
  console.error('Portfolio is empty — nothing to analyze.');
  process.exit(1);
}

const symbols = [...new Set(positions.map((p) => p.symbol))];
console.error(`Building dossier for ${symbols.length} symbols (provider: ${provider}, portfolio source: ${source.sourceKind})`);

const symbolEntries = [];
let totalValue = 0;
let totalCost = 0;
let dayChange = 0;
let buys = 0;
let sells = 0;

for (const symbol of symbols) {
  const { bars, source: barSource, error } = await getDailyBars(symbol, {
    db: source.db,
    provider,
    keys: source.keys,
  });
  const a = analyzeSymbol(bars);
  const held = positions.filter((p) => p.symbol === symbol && p.qty > 0);
  const qty = held.reduce((s, p) => s + p.qty, 0);
  const cost = held.reduce((s, p) => s + p.qty * p.costBasis, 0);

  if (!a) {
    symbolEntries.push({ symbol, held: qty > 0, qty, dataError: error ?? 'insufficient history', source: barSource });
    continue;
  }
  if (qty > 0) {
    totalValue += a.price * qty;
    totalCost += cost;
    if (a.prevClose != null) dayChange += (a.price - a.prevClose) * qty;
  }
  if (a.score >= 25) buys++;
  if (a.score <= -25) sells++;

  const opt = optionsStrategies(a, qty, symbol);
  const weeklyCloses = a.weeklyBars.slice(-12).map((b) => b.close);
  const dailyCloses = a.daily.bars.slice(-10).map((b) => b.close);

  symbolEntries.push({
    symbol,
    held: qty > 0,
    qty,
    costBasis: qty > 0 ? cost / qty : 0,
    plPct: qty > 0 && cost > 0 ? ((a.price * qty - cost) / cost) * 100 : null,
    price: a.price,
    source: barSource,
    dataError: error ?? null,
    score: a.score,
    action: a.decision.action,
    summary: a.decision.summary,
    reasons: a.reasons,
    notes: a.notes,
    risk: a.risk,
    vol: a.vol,
    range52: a.range52,
    optionsIdeas: opt.strategies,
    optionsVolNote: opt.volNote,
    recentWeeklyCloses: weeklyCloses,
    recentDailyCloses: dailyCloses,
  });
  console.error(`  ${symbol}: ${a.decision.action} (${a.score >= 0 ? '+' : ''}${a.score}) via ${barSource}${error ? ' — ' + error : ''}`);
}

const dossier = {
  generatedAt: new Date().toISOString(),
  date,
  provider,
  sourceKind: source.sourceKind,
  portfolio: {
    totalValue,
    totalCost,
    totalPL: totalValue - totalCost,
    dayChange,
    buys,
    sells,
    symbolsTracked: symbols.length,
  },
  positions: positions.map((p) => ({ symbol: p.symbol, qty: p.qty, costBasis: p.costBasis, openedAt: p.openedAt, notes: p.notes })),
  symbols: symbolEntries,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(dossier, null, 2) + '\n');
console.log(outPath);

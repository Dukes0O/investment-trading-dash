#!/usr/bin/env node
// Score every past weekly-report call against subsequent price action and
// write data/outcomes.json (committed — the Performance view reads it in both
// backend and static modes). Idempotent: recomputes from the committed
// reports + dossiers + current bars each run.
//
// Usage: node scripts/evaluate-outcomes.mjs [--provider demo|alphavantage|twelvedata]

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../server/db.js';
import { getDailyBars } from '../server/marketdata.js';
import { loadPortfolio } from './lib/source.mjs';
import { evaluateCall, summarize, reasonAttribution } from './lib/outcomes.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const REPORTS_DIR = join(ROOT, 'data', 'reports');
const OUT_PATH = join(ROOT, 'data', 'outcomes.json');

// ---- Load reports ----
const reports = [];
if (existsSync(REPORTS_DIR)) {
  for (const f of readdirSync(REPORTS_DIR).sort()) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue;
    try {
      reports.push(JSON.parse(readFileSync(join(REPORTS_DIR, f), 'utf8')));
    } catch (err) {
      console.error(`WARNING: skipping unreadable report ${f}: ${err.message}`);
    }
  }
}
if (!reports.length) {
  console.error('No reports found — nothing to evaluate.');
  process.exit(0);
}

// ---- Load committed dossiers (held flags + reasons for attribution) ----
const dossierBySymbol = new Map(); // "date|symbol" -> dossier symbol entry
for (const f of readdirSync(join(ROOT, 'data')).sort()) {
  const m = f.match(/^dossier-(\d{4}-\d{2}-\d{2})\.json$/);
  if (!m) continue;
  try {
    const d = JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'));
    for (const s of d.symbols ?? []) dossierBySymbol.set(m[1] + '|' + s.symbol, s);
  } catch { /* skip unreadable dossier */ }
}

// ---- Assemble calls ----
const calls = [];
for (const r of reports) {
  for (const s of r.symbols ?? []) {
    const d = dossierBySymbol.get(r.dossierDate + '|' + s.symbol) ?? dossierBySymbol.get(r.reportDate + '|' + s.symbol);
    calls.push({
      reportDate: r.reportDate,
      symbol: s.symbol,
      llmVerdict: s.llmVerdict,
      ruleAction: s.ruleSignal?.action,
      ruleScore: s.ruleSignal?.score,
      agreesWithRule: s.agreesWithRule,
      confidence: s.confidence,
      planAction: s.tradePlan?.action,
      stop: s.tradePlan?.stop ?? null,
      ruleStop: d?.risk?.suggestedStop ?? s.tradePlan?.stop ?? null,
      held: d ? Boolean(d.held) : null,
    });
  }
}

// ---- Fetch bars once per symbol ----
const source = loadPortfolio();
const provider = arg('provider', process.env.TRENDDESK_PROVIDER || source.provider);
const symbols = [...new Set(calls.map((c) => c.symbol))];
const barsBySymbol = new Map();
for (const sym of symbols) {
  const { bars, source: barSource, error } = await getDailyBars(sym, { db: source.db, provider, keys: source.keys });
  barsBySymbol.set(sym, bars);
  console.error(`  bars ${sym}: ${bars.length} via ${barSource}${error ? ' — ' + error : ''}`);
}

// ---- Evaluate ----
const evaluated = calls.map((c) => evaluateCall(c, barsBySymbol.get(c.symbol) ?? []));
const summary = summarize(evaluated);
const reasonsByKey = new Map(
  [...dossierBySymbol.entries()].map(([k, s]) => [k, s.reasons ?? []])
);
const reasons = reasonAttribution(evaluated, reasonsByKey);

const outcomes = {
  generatedAt: new Date().toISOString(),
  provider,
  scoringNotes: 'Stop-truncated forward returns; exposure-weighted scores; ±0.5% flat band; see scripts/lib/outcomes.mjs.',
  calls: evaluated,
  summary,
  reasonStats: reasons,
};

writeFileSync(OUT_PATH, JSON.stringify(outcomes, null, 2) + '\n');
const matured = evaluated.filter((c) => Object.values(c.horizons).some((h) => h.matured)).length;
console.error(`Evaluated ${evaluated.length} calls from ${reports.length} report(s); ${matured} matured on at least one horizon.`);
console.log(OUT_PATH);

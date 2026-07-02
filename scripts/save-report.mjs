#!/usr/bin/env node
// Validate a draft weekly report and persist it: SQLite row (when the DB
// exists) + committed printout data/reports/<date>.json + rebuilt index.json.
// The directory scan — not the DB — is the index's source of truth, so the
// no-DB CI path produces an identical index.
//
// Usage: node scripts/save-report.mjs <draft.json>

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, DB_PATH, openDb } from '../server/db.js';
import { validateReport, indexEntry } from './lib/report-schema.mjs';
import { loadPortfolio } from './lib/source.mjs';

const REPORTS_DIR = join(ROOT, 'data', 'reports');

const draftPath = process.argv[2];
if (!draftPath) {
  console.error('Usage: node scripts/save-report.mjs <draft.json>');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(readFileSync(draftPath, 'utf8'));
} catch (err) {
  console.error(`Could not read/parse ${draftPath}: ${err.message}`);
  process.exit(1);
}

let heldSymbols = [];
try {
  const src = loadPortfolio();
  heldSymbols = [...new Set(src.positions.filter((p) => p.qty > 0).map((p) => p.symbol))];
} catch { /* validation still runs without portfolio context */ }

const { ok, errors, warnings } = validateReport(report, { heldSymbols });
for (const w of warnings) console.error(`WARNING: ${w}`);
if (!ok) {
  console.error(`Report INVALID — ${errors.length} error(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

mkdirSync(REPORTS_DIR, { recursive: true });
const outPath = join(REPORTS_DIR, `${report.reportDate}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

// Rebuild the index by scanning the directory.
const entries = [];
for (const f of readdirSync(REPORTS_DIR).sort().reverse()) {
  if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue;
  try {
    entries.push(indexEntry(JSON.parse(readFileSync(join(REPORTS_DIR, f), 'utf8'))));
  } catch (err) {
    console.error(`WARNING: skipping unreadable report ${f}: ${err.message}`);
  }
}
writeFileSync(join(REPORTS_DIR, 'index.json'), JSON.stringify(entries, null, 2) + '\n');

if (existsSync(DB_PATH)) {
  const db = openDb();
  db.prepare('INSERT OR REPLACE INTO reports (report_date, json) VALUES (?, ?)')
    .run(report.reportDate, JSON.stringify(report));
  console.error(`Saved to DB (${report.reportDate})`);
}

console.error(`Report saved: ${outPath} (+ index.json, ${entries.length} report(s) indexed)`);
console.log(outPath);

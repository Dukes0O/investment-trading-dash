// Git-facing printout: data/portfolio.json is rewritten on every positions or
// settings mutation so the committed snapshot always matches the DB. It never
// contains API keys — CI supplies keys via secrets.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT, positionToApi, tradeToApi, getSetting } from './db.js';
import { DEFAULT_PROVIDER, normalizeProvider } from './marketdata.js';

export const PORTFOLIO_PATH = join(ROOT, 'data', 'portfolio.json');
export const TRADES_PATH = join(ROOT, 'data', 'trades.json');

export function writePortfolioPrintout(db) {
  const positions = db.prepare('SELECT * FROM positions ORDER BY created_at').all().map(positionToApi);
  const printout = {
    exportedAt: new Date().toISOString(),
    settings: { provider: normalizeProvider(getSetting(db, 'provider', DEFAULT_PROVIDER)) },
    positions,
  };
  mkdirSync(dirname(PORTFOLIO_PATH), { recursive: true });
  writeFileSync(PORTFOLIO_PATH, JSON.stringify(printout, null, 2) + '\n');
  return printout;
}

export function writeTradesPrintout(db) {
  const trades = db.prepare('SELECT * FROM trades ORDER BY executed_at, created_at').all().map(tradeToApi);
  const printout = {
    exportedAt: new Date().toISOString(),
    trades,
  };
  mkdirSync(dirname(TRADES_PATH), { recursive: true });
  writeFileSync(TRADES_PATH, JSON.stringify(printout, null, 2) + '\n');
  return printout;
}

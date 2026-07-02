// Portfolio + market-data source for pipeline scripts: the SQLite DB when it
// exists (local runs), otherwise the committed data/portfolio.json printout
// (CI runs, which have no DB).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, DB_PATH, openDb, positionToApi, getSetting } from '../../server/db.js';
import { marketConfig } from '../../server/marketdata.js';

export function loadPortfolio() {
  if (existsSync(DB_PATH)) {
    const db = openDb();
    const positions = db.prepare('SELECT * FROM positions ORDER BY created_at').all().map(positionToApi);
    const { provider, keys } = marketConfig(db, getSetting);
    return { db, positions, provider, keys, sourceKind: 'db' };
  }
  const printoutPath = join(ROOT, 'data', 'portfolio.json');
  if (!existsSync(printoutPath)) {
    throw new Error(`No portfolio found: neither ${DB_PATH} nor ${printoutPath} exists. Run the app and add positions, or commit data/portfolio.json.`);
  }
  const printout = JSON.parse(readFileSync(printoutPath, 'utf8'));
  return {
    db: null,
    positions: printout.positions ?? [],
    provider: process.env.TRENDDESK_PROVIDER || printout.settings?.provider || 'demo',
    keys: {
      alphaVantageKey: process.env.ALPHAVANTAGE_API_KEY || '',
      twelveDataKey: process.env.TWELVEDATA_API_KEY || '',
    },
    sourceKind: 'printout',
  };
}

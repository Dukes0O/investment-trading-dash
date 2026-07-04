// REST API. JSON in/out, camelCase over the wire. Every positions/settings
// mutation rewrites the committed data/portfolio.json printout.

import { Router } from 'express';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, positionToApi, tradeToApi, getSetting, setSetting, genId } from './db.js';
import { getDailyBars, marketConfig } from './marketdata.js';
import { writePortfolioPrintout, writeTradesPrintout } from './export.js';
import { indexEntry } from '../scripts/lib/report-schema.mjs';
import { runBacktests } from '../scripts/lib/runbacktest.mjs';

const REPORTS_DIR = join(ROOT, 'data', 'reports');

const SYMBOL_RE = /^[A-Z.\-]{1,10}$/;

function validatePosition(body) {
  const symbol = String(body.symbol ?? '').toUpperCase().trim();
  const qty = body.qty === '' || body.qty == null ? 0 : Number(body.qty);
  const costBasis = body.costBasis === '' || body.costBasis == null ? 0 : Number(body.costBasis);
  if (!SYMBOL_RE.test(symbol)) return { error: 'Enter a valid ticker symbol (letters, dots or dashes).' };
  if (!isFinite(qty) || qty < 0) return { error: 'Quantity must be zero or positive.' };
  if (qty > 0 && (!isFinite(costBasis) || costBasis <= 0)) return { error: 'A held position needs a cost basis per share.' };
  return {
    value: {
      symbol,
      qty,
      costBasis,
      openedAt: String(body.openedAt ?? ''),
      notes: String(body.notes ?? ''),
    },
  };
}

function validateTrade(body) {
  const symbol = String(body.symbol ?? '').toUpperCase().trim();
  const side = String(body.side ?? '').toLowerCase().trim();
  const qty = Number(body.qty);
  const price = Number(body.price);
  const executedAt = String(body.executedAt ?? '');
  if (!SYMBOL_RE.test(symbol)) return { error: 'Enter a valid ticker symbol (letters, dots or dashes).' };
  if (side !== 'buy' && side !== 'sell') return { error: 'Side must be buy or sell.' };
  if (!isFinite(qty) || qty <= 0) return { error: 'Quantity must be a positive number.' };
  if (!isFinite(price) || price <= 0) return { error: 'Price must be a positive number.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(executedAt)) return { error: 'Executed date must be in YYYY-MM-DD format.' };
  return {
    value: {
      symbol,
      side,
      qty,
      price,
      executedAt,
      note: String(body.note ?? ''),
    },
  };
}

export function createApiRouter(db) {
  const router = Router();

  router.get('/health', (req, res) => {
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM positions').get();
    res.json({ ok: true, version: 1, positionsCount: c });
  });

  // ---- Positions ----

  router.get('/positions', (req, res) => {
    res.json(db.prepare('SELECT * FROM positions ORDER BY created_at').all().map(positionToApi));
  });

  router.post('/positions', (req, res) => {
    const { error, value } = validatePosition(req.body ?? {});
    if (error) return res.status(400).json({ error });
    const id = genId();
    db.prepare(
      'INSERT INTO positions (id, symbol, qty, cost_basis, opened_at, notes) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, value.symbol, value.qty, value.costBasis, value.openedAt, value.notes);
    writePortfolioPrintout(db);
    res.status(201).json(positionToApi(db.prepare('SELECT * FROM positions WHERE id = ?').get(id)));
  });

  router.put('/positions/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Position not found' });
    const merged = { ...positionToApi(existing), ...(req.body ?? {}) };
    const { error, value } = validatePosition(merged);
    if (error) return res.status(400).json({ error });
    db.prepare(
      `UPDATE positions SET symbol = ?, qty = ?, cost_basis = ?, opened_at = ?, notes = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`
    ).run(value.symbol, value.qty, value.costBasis, value.openedAt, value.notes, req.params.id);
    writePortfolioPrintout(db);
    res.json(positionToApi(db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id)));
  });

  router.delete('/positions/:id', (req, res) => {
    const info = db.prepare('DELETE FROM positions WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Position not found' });
    writePortfolioPrintout(db);
    res.json({ ok: true });
  });

  // ---- Trades ----

  router.get('/trades', (req, res) => {
    res.json(db.prepare('SELECT * FROM trades ORDER BY executed_at DESC, created_at DESC').all().map(tradeToApi));
  });

  router.post('/trades', (req, res) => {
    const { error, value } = validateTrade(req.body ?? {});
    if (error) return res.status(400).json({ error });
    const id = genId();
    db.prepare(
      'INSERT INTO trades (id, symbol, side, qty, price, executed_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, value.symbol, value.side, value.qty, value.price, value.executedAt, value.note);
    writeTradesPrintout(db);
    res.status(201).json(tradeToApi(db.prepare('SELECT * FROM trades WHERE id = ?').get(id)));
  });

  router.delete('/trades/:id', (req, res) => {
    const info = db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Trade not found' });
    writeTradesPrintout(db);
    res.json({ ok: true });
  });

  // One-shot localStorage migration: only accepted while the table is empty,
  // so repeat calls (or multiple browsers) can't duplicate.
  router.post('/import', (req, res) => {
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM positions').get();
    if (c > 0) return res.status(409).json({ error: 'Positions already exist — import is only allowed into an empty database.' });
    const positions = Array.isArray(req.body?.positions) ? req.body.positions : [];
    const trades = Array.isArray(req.body?.trades) ? req.body.trades : [];
    const settings = req.body?.settings ?? {};
    let imported = 0;
    const { c: tradesCount } = db.prepare('SELECT COUNT(*) AS c FROM trades').get();
    db.transaction(() => {
      for (const p of positions) {
        const { error, value } = validatePosition(p);
        if (error) continue;
        db.prepare(
          'INSERT INTO positions (id, symbol, qty, cost_basis, opened_at, notes) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(typeof p.id === 'string' && p.id ? p.id : genId(), value.symbol, value.qty, value.costBasis, value.openedAt, value.notes);
        imported++;
      }
      // Trades already exist — skip import silently (the positions 409 above
      // already guards the main flow; this table has its own empty check).
      if (tradesCount === 0) {
        for (const t of trades) {
          const { error, value } = validateTrade(t);
          if (error) continue;
          db.prepare(
            'INSERT INTO trades (id, symbol, side, qty, price, executed_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(typeof t.id === 'string' && t.id ? t.id : genId(), value.symbol, value.side, value.qty, value.price, value.executedAt, value.note);
        }
      }
      for (const key of ['provider', 'alphaVantageKey', 'twelveDataKey']) {
        if (typeof settings[key] === 'string' && settings[key]) setSetting(db, key, settings[key]);
      }
      if (settings.accountSize != null) {
        const accountSize = Number(settings.accountSize);
        if (isFinite(accountSize) && accountSize >= 0) setSetting(db, 'accountSize', accountSize);
      }
      if (settings.riskPct != null) {
        const riskPct = Number(settings.riskPct);
        if (isFinite(riskPct) && riskPct > 0 && riskPct <= 10) setSetting(db, 'riskPct', riskPct);
      }
    })();
    writePortfolioPrintout(db);
    if (tradesCount === 0) writeTradesPrintout(db);
    res.json({ imported });
  });

  // ---- Settings ----

  function maskedSettings() {
    return {
      provider: getSetting(db, 'provider', 'demo'),
      hasKeys: {
        alphavantage: Boolean(getSetting(db, 'alphaVantageKey', '')),
        twelvedata: Boolean(getSetting(db, 'twelveDataKey', '')),
      },
      accountSize: getSetting(db, 'accountSize', 0),
      riskPct: getSetting(db, 'riskPct', 1),
    };
  }

  router.get('/settings', (req, res) => res.json(maskedSettings()));

  router.put('/settings', (req, res) => {
    const body = req.body ?? {};
    if (body.provider != null) {
      if (!['demo', 'stooq', 'alphavantage', 'twelvedata'].includes(body.provider)) {
        return res.status(400).json({ error: 'Unknown provider' });
      }
      setSetting(db, 'provider', body.provider);
    }
    if (typeof body.alphaVantageKey === 'string') setSetting(db, 'alphaVantageKey', body.alphaVantageKey.trim());
    if (typeof body.twelveDataKey === 'string') setSetting(db, 'twelveDataKey', body.twelveDataKey.trim());
    if (body.accountSize != null) {
      const accountSize = Number(body.accountSize);
      if (!isFinite(accountSize) || accountSize < 0) return res.status(400).json({ error: 'Account size must be zero or positive.' });
      setSetting(db, 'accountSize', accountSize);
    }
    if (body.riskPct != null) {
      const riskPct = Number(body.riskPct);
      if (!isFinite(riskPct) || riskPct <= 0 || riskPct > 10) return res.status(400).json({ error: 'Risk % must be between 0 and 10.' });
      setSetting(db, 'riskPct', riskPct);
    }
    writePortfolioPrintout(db);
    res.json(maskedSettings());
  });

  // ---- Market data ----

  router.get('/bars/:symbol', async (req, res) => {
    const symbol = String(req.params.symbol).toUpperCase();
    if (!SYMBOL_RE.test(symbol)) return res.status(400).json({ error: 'Invalid symbol' });
    const { provider, keys } = marketConfig(db, getSetting);
    try {
      const result = await getDailyBars(symbol, { db, provider, keys });
      // Stooq returns decades of history; the dashboard only charts ~2.5y.
      // Full history stays in the DB for the backtester.
      res.json({ ...result, bars: result.bars.slice(-650) });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // Fresh backtest for one symbol (full cached history; strategies defined
  // in scripts/lib/strategies.mjs).
  router.get('/backtest/:symbol', async (req, res) => {
    const symbol = String(req.params.symbol).toUpperCase();
    if (!SYMBOL_RE.test(symbol)) return res.status(400).json({ error: 'Invalid symbol' });
    const { provider, keys } = marketConfig(db, getSetting);
    try {
      const { bars, source, error } = await getDailyBars(symbol, { db, provider, keys });
      res.json(runBacktests(symbol, bars, source + (error ? ` (${error})` : '')));
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  router.post('/cache/clear', (req, res) => {
    db.prepare('DELETE FROM fetch_log').run();
    res.json({ ok: true });
  });

  // ---- Reports ----
  // The committed data/reports/*.json files are the canonical store (reports
  // can arrive via git pull from CI without touching the local DB), so the
  // API serves from the directory; the DB reports table is a convenience copy.

  router.get('/reports', (req, res) => {
    if (!existsSync(REPORTS_DIR)) return res.json([]);
    const entries = [];
    for (const f of readdirSync(REPORTS_DIR).sort().reverse()) {
      if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue;
      try {
        entries.push(indexEntry(JSON.parse(readFileSync(join(REPORTS_DIR, f), 'utf8'))));
      } catch { /* skip unreadable report */ }
    }
    res.json(entries);
  });

  router.get('/reports/:date', (req, res) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({ error: 'Invalid date' });
    const file = join(REPORTS_DIR, req.params.date + '.json');
    if (existsSync(file)) return res.type('application/json').send(readFileSync(file, 'utf8'));
    const row = db.prepare('SELECT json FROM reports WHERE report_date = ?').get(req.params.date);
    if (!row) return res.status(404).json({ error: 'Report not found' });
    res.type('application/json').send(row.json);
  });

  return router;
}

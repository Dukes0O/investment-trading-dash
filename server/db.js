// SQLite access layer. One better-sqlite3 connection, WAL mode, versioned
// migrations via PRAGMA user_version. All SQL lives here or in routes.js so a
// future swap to node:sqlite stays cheap.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DB_PATH = process.env.TRENDDESK_DB || join(ROOT, 'data', 'trenddesk.db');

const MIGRATIONS = [
  // v1 — initial schema
  `
  CREATE TABLE positions (
    id         TEXT PRIMARY KEY,
    symbol     TEXT NOT NULL,
    qty        REAL NOT NULL DEFAULT 0,
    cost_basis REAL NOT NULL DEFAULT 0,
    opened_at  TEXT NOT NULL DEFAULT '',
    notes      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  CREATE INDEX idx_positions_symbol ON positions(symbol);

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE price_bars (
    provider TEXT NOT NULL,
    symbol   TEXT NOT NULL,
    date     TEXT NOT NULL,
    open     REAL NOT NULL,
    high     REAL NOT NULL,
    low      REAL NOT NULL,
    close    REAL NOT NULL,
    volume   REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (provider, symbol, date)
  ) WITHOUT ROWID;

  CREATE TABLE fetch_log (
    provider   TEXT NOT NULL,
    symbol     TEXT NOT NULL,
    fetched_on TEXT NOT NULL,
    PRIMARY KEY (provider, symbol)
  );

  CREATE TABLE reports (
    report_date TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    json        TEXT NOT NULL
  );
  `,
];

export function openDb(path = DB_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  let version = db.pragma('user_version', { simple: true });
  while (version < MIGRATIONS.length) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]);
      db.pragma(`user_version = ${version + 1}`);
    })();
    version++;
  }
  return db;
}

// ---- Row mappers ----

export function positionToApi(row) {
  return {
    id: row.id,
    symbol: row.symbol,
    qty: row.qty,
    costBasis: row.cost_basis,
    openedAt: row.opened_at,
    notes: row.notes,
  };
}

// ---- Settings helpers (values stored JSON-encoded) ----

export function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

export function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

export function genId() {
  return 'p' + Math.random().toString(36).slice(2, 10);
}

# Trend Desk — Hybrid Investment Trading Platform

Weekly trend analysis, buy/sell decision support, and options-strategy ideas
for your portfolio. **Hybrid by design**: the code computes every indicator
and mechanical signal deterministically; a weekly **Claude Code session
supplies the judgment** — it reads the computed dossier, researches news, and
issues the final calls, explicitly agreeing with or overriding the rule
engine. Lives alongside the chat app in this repo.

## Run it

```sh
npm install
npm run server     # backend: Express + SQLite on :3001
npm run dev        # frontend: Vite on :3000 (proxies /api to the backend)
```

Open **http://localhost:3000/dashboard.html** (the chat app remains at `/`).
For production: `npm run build && npm start` and open
http://localhost:3001/dashboard.html.

Without the backend the dashboard still runs in demo mode (synthetic data,
positions in localStorage) — live providers and weekly reports need the server.

## Architecture

```
Browser (dashboard)  ──REST──▶  server/ (Express 5 + better-sqlite3)
  demo fallback if                 │ data/trenddesk.db      ← live state (gitignored)
  backend not running              │ data/portfolio.json    ← auto-exported printout (committed)
                                   ▼
Weekly Claude Code session (/weekly-report skill):
  npm run dossier  →  data/dossier-<date>.json   (technicals, gitignored)
  reads dossier → WebSearch news per symbol → writes draft report
  node scripts/save-report.mjs draft  →  data/reports/<date>.json + index.json (committed)
```

**SQLite is the source of truth** for live state (positions, settings/API
keys, price-bar cache, reports); human-readable JSON printouts are committed
so git is the audit trail and CI runs work without the DB. On first contact
with an empty server, the app imports your existing localStorage positions
automatically.

## Views

- **Overview** — portfolio value, day change, P/L, holdings table with trend
  sparklines, weekly signal board.
- **Positions** — enter holdings (symbol, quantity, cost basis); quantity 0 =
  watchlist. Every change is saved to SQLite and re-exported to
  `data/portfolio.json`.
- **Weekly reports** — the LLM-written portfolio analysis: stance, trade-plan
  table (rule signal vs LLM verdict with agreement flags), per-symbol
  narratives with news citations, risks, and options plays. Full history,
  one file per week.
- **Analysis (click any symbol)** — candlestick charts
  ([lightweight-charts](https://github.com/tradingview/lightweight-charts),
  Apache-2.0) with 10/30/40-week or 20/50/200-day MAs, RSI, MACD; the scored
  rule verdict with itemized reasons; ATR stops; rule-based options ideas —
  plus the latest weekly report's take on that symbol when one exists.
- **Settings** — market data provider. Keys are stored server-side in the
  gitignored DB and never echoed back to the browser.

## Market data

| Provider | Key | Free tier |
|---|---|---|
| Demo data (default) | none | Synthetic prices; works offline |
| [Alpha Vantage](https://www.alphavantage.co/support/#api-key) | free | 25 requests/day |
| [Twelve Data](https://twelvedata.com/) | free | 800 credits/day, 8/min |

Daily bars are cached in SQLite per calendar day; on provider errors the app
falls back to the most recent cache, then demo data, and says so.

## The weekly report ritual

1. Open a Claude Code session on this repo (web, CLI, or desktop).
2. Run **`/weekly-report`**. The session builds the dossier
   (`npm run dossier`), reads it, researches each holding with web search,
   writes the report against `data/reports/SCHEMA.md`, validates it with
   `scripts/save-report.mjs` (invalid reports are rejected with itemized
   errors — invented URLs, missing stops, bad enums), and commits it.
3. Open the **Weekly reports** view.

To schedule it: add an `ANTHROPIC_API_KEY` repo secret and enable the cron in
`.github/workflows/weekly-report.yml` (manual `workflow_dispatch` works out of
the box). CI has no DB, so it reads the committed `data/portfolio.json` —
keep it committed when your positions change.

### Division of labor (why hybrid)

| Layer | Does | Never does |
|---|---|---|
| `dashboard/indicators.js` + `signals.js` (code) | SMA/RSI/MACD/ATR/Bollinger/HV math, weekly resample, rule score in [−100,+100] with itemized reasons, ATR stops, options-fit shortlist | interpret news, time earnings, weigh conflicting evidence |
| Weekly Claude session (LLM) | reads the computed dossier, researches news/earnings/macro, arbitrates — agrees or overrides the rule verdict with stated reasons, writes the trade plan | recalculate indicators, invent prices or URLs |

The report schema forces the honesty: every symbol carries both the rule
signal and the LLM verdict plus an `agreesWithRule` flag, so you can always
see where judgment departed from mechanics — and review how those calls aged.

**Decision support only — not financial advice.**

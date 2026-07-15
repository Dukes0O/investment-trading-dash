# Trend Desk — Hybrid Investment Trading Platform

Weekly trend analysis, buy/sell decision support, and options-strategy ideas
for your portfolio. **Hybrid by design**: the code computes every indicator
and mechanical signal deterministically; a weekly **Claude Code session
supplies the judgment** — it reads the computed dossier, researches news, and
issues the final calls, explicitly agreeing with or overriding the rule
engine.

## Run it

```sh
npm install
npm run server     # backend: Express + SQLite on :3001
npm run dev        # frontend: Vite on :3000 (proxies /api to the backend)
```

Open **http://localhost:3000/**. For production: `npm run build && npm start`
and open http://localhost:3001/.

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
so git is the audit trail and cloud Claude Code sessions (which have no local
DB) can run the weekly pipeline from the printouts. On first contact
with an empty server, the app imports your existing localStorage positions
automatically.

## Views

- **Overview** — portfolio value, day change, P/L, holdings table with trend
  sparklines, weekly signal board, and an **alerts strip** that checks every
  close against the active report's levels: stop breached, within 3% of the
  stop, or inside a planned entry zone.
- **Positions** — enter holdings (symbol, quantity, cost basis); quantity 0 =
  watchlist. Every change is saved to SQLite and re-exported to
  `data/portfolio.json`.
- **Trade journal** — log every actual fill (symbol, side, quantity, price,
  date, note); saved to SQLite, exported to `data/trades.json`. Each fill is
  graded against the weekly report that was live when you traded: **on plan**,
  **chased above the entry zone**, **plan said hold**, or **against plan** —
  including conditional plans (a "hold" with an entry zone counts as on-plan
  when you buy inside the zone). FIFO realized P/L, on-plan %, and a drift
  check that flags when journal quantities disagree with recorded positions.
  This measures the discipline gap — the difference between what the system
  said and what you did.
- **Weekly reports** — the LLM-written portfolio analysis: stance, trade-plan
  table (rule signal vs LLM verdict with agreement flags), per-symbol
  narratives with news citations, risks, and options plays. Full history,
  one file per week.
- **Analysis (click any symbol)** — candlestick charts
  ([lightweight-charts](https://github.com/tradingview/lightweight-charts),
  Apache-2.0) with 10/30/40-week or 20/50/200-day MAs, RSI, MACD; the scored
  rule verdict with itemized reasons; ATR stops; rule-based options ideas;
  the latest weekly report's take on that symbol; and a **position sizing
  calculator** (account size × risk % ÷ stop distance = shares, with a
  capital cap warning — account size and risk % persist in settings).
- **Settings** — market data provider. Keys are stored server-side in the
  gitignored DB and never echoed back to the browser.

## Market data

| Provider | Key | Notes |
|---|---|---|
| Demo data (offline fallback) | none | Synthetic prices; works without the backend or a provider key |
| [Twelve Data](https://twelvedata.com/) | free key | **Recommended** — daily OHLCV, up to 5,000 records per request, 800 credits/day and 8/min on the Basic plan |
| [Alpha Vantage](https://www.alphavantage.co/support/#api-key) | free key | Optional TSX fallback; free compact daily history and 25 requests/day |

Daily bars are cached in SQLite per calendar day; on provider errors the app
falls back to the most recent cache, then demo data, and says so.

A refresh fetches every portfolio and watchlist symbol, which used to fire all
provider calls in one burst and trip the free-tier per-minute cap (HTTP 429).
The server now paces outbound calls through a rolling-window limiter — 8 Twelve
Data and 5 Alpha Vantage requests per minute by default — so a large refresh
goes out in waves and stays under the cap. Uncached symbols in a later wave wait
their turn rather than failing. On a paid plan, raise the caps with
`TWELVEDATA_RPM` and `ALPHAVANTAGE_RPM`. The per-day SQLite cache means a second
refresh the same day is instant and consumes no credits.

To use the recommended provider, create a Twelve Data account, generate an API
key, start the backend, and choose **Twelve Data** in Settings. Paste the key
there (it is stored in the gitignored SQLite database), or provide it to server
scripts through `TWELVEDATA_API_KEY`. Set `TRENDDESK_PROVIDER=twelvedata` when
running scripts in a fresh environment. Never commit the key or put it in
`data/portfolio.json`.

The app can use a free Alpha Vantage key as a TSX fallback while Twelve Data
remains selected. Add it in the Alpha Vantage key field in Settings, or set
`ALPHAVANTAGE_API_KEY` for scripts. Canadian symbols such as `BMO:TSX` are
translated to Alpha Vantage's `BMO.TRT` format. The free Alpha Vantage response
is compact (100 daily bars), so it supports current charts and volume but not
the deep-history Strategy Lab backtests.

## The weekly report ritual

1. Open a Claude Code session on this repo (web, CLI, or desktop).
2. Run **`/weekly-report`**. The session builds the dossier
   (`npm run dossier`), reads it, researches each holding with web search,
   writes the report against `data/reports/SCHEMA.md`, validates it with
   `scripts/save-report.mjs` (invalid reports are rejected with itemized
   errors — invented URLs, missing stops, bad enums), and commits it.
3. Open the **Weekly reports** view.

No API key is involved anywhere — the session runs on your Claude
subscription. This works from any Claude Code surface:

- **Local CLI/desktop session**: the pipeline reads positions and keys
  straight from the SQLite DB.
- **Claude Code web session** (fresh cloud container, no DB): the pipeline
  automatically falls back to the committed `data/portfolio.json` — so keep
  it committed when your positions change (the app rewrites it on every
  edit), and set a market-data key via env or accept demo pricing for the
  run. The session commits and pushes the report; pull and it appears in
  the Reports view.

## Strategy lab

Replay three trend-trading styles over a symbol's full price history and
compare them against buy-and-hold: **30-week trend following** (own the
weekly uptrend, exit when the 30-week MA is lost), **Donchian 20-day
breakout** (turtle-style: buy strength in a long-term uptrend, exit on a
10-day low), and **pullback/retracement** (buy the dip-and-turn inside an
uptrend, ride a 2.5×ATR chandelier stop).

The simulator is deliberately honest: signals on the close execute at the
*next open*, trailing stops are checked intrabar (gaps fill at the open),
0.1% round-trip costs apply, and drawdowns are mark-to-market. It is also
deliberately simple — long/flat, one position, no dividends — so use it to
**compare styles, not forecast returns**. Strategies live in
`scripts/lib/strategies.mjs`; add a preset there and it appears everywhere.
With the backend running the lab computes fresh results per symbol
(`GET /api/backtest/:symbol`); `node scripts/backtest.mjs` writes the
committed `data/backtests.json` fallback. Use Twelve Data for deeper history —
a 2-year backtest of a 30-week system is noise. The Twelve Data adapter asks
for up to 5,000 daily bars; responses are cached in SQLite and refreshed once
per calendar day.

## The learning loop (Performance view)

Every weekly verdict is structured data, so the system grades itself. Each
`/weekly-report` run executes `scripts/evaluate-outcomes.mjs`, which re-scores
**every past call** against what prices actually did and writes the committed
`data/outcomes.json`:

- **Stop-truncated forward returns** at 1-week / 4-week / 13-week horizons —
  if a call's stop was hit, the return is capped there, the way a trend system
  actually exits.
- **Hit rates** for the LLM verdicts and the rule signals separately.
- **Overrides head-to-head** — every time the LLM overrode the rule engine,
  who turned out right. This is the number that says whether the judgment
  layer earns its keep.
- **Signal-component attribution** — which rule reasons (golden cross, RSI
  regime, breakouts…) actually predicted 4-week moves, shown once a component
  has ≥8 samples. Persistent losers are the evidence for re-weighting
  `dashboard/signals.js`.

The Performance view renders all of this, including pending calls that
haven't matured yet. Dossiers (`data/dossier-*.json`) are committed as the
evidence archive — they hold the reasons and stops each call was made with.
The scoring model is documented at the top of `scripts/lib/outcomes.mjs` and
unit-tested; grade the system for a couple of months before treating any
single number as meaningful.

### Division of labor (why hybrid)

| Layer | Does | Never does |
|---|---|---|
| `dashboard/indicators.js` + `signals.js` (code) | SMA/RSI/MACD/ATR/Bollinger/HV math, weekly resample, rule score in [−100,+100] with itemized reasons, ATR stops, options-fit shortlist | interpret news, time earnings, weigh conflicting evidence |
| Weekly Claude session (LLM) | reads the computed dossier, researches news/earnings/macro, arbitrates — agrees or overrides the rule verdict with stated reasons, writes the trade plan | recalculate indicators, invent prices or URLs |

The report schema forces the honesty: every symbol carries both the rule
signal and the LLM verdict plus an `agreesWithRule` flag, so you can always
see where judgment departed from mechanics — and review how those calls aged.

**Decision support only — not financial advice.**

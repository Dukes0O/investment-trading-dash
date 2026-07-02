# Trend Desk — Investment Trading Dashboard

A self-contained dashboard for weekly trend analysis, buy/sell decision support,
and options-strategy ideas across your holdings. Lives alongside the chat app in
this repo as its own page.

## Run it

```sh
npm install
npm run dev
```

Open **http://localhost:3000/dashboard.html** (the chat app remains at `/`).

## What it does

- **Positions** — enter holdings (symbol, quantity, cost basis, open date, notes).
  Quantity 0 keeps a symbol on the watchlist for analysis without P/L tracking.
  Everything is stored in the browser's localStorage; nothing leaves your machine
  except price requests to the provider you choose.
- **Overview** — portfolio value, day change, total P/L, holdings table with
  90-day trend sparklines, and a weekly signal board.
- **Analysis (click any symbol)** — weekly and daily candlestick charts with
  10/30/40-week (or 20/50/200-day) moving averages, RSI(14) and MACD(12,26,9)
  panes with crosshair tooltips and a table view; a scored, fully explained
  buy/sell decision; ATR-based stop levels; and rule-based options-strategy
  ideas (covered calls, cash-secured puts, spreads, collars, protective puts)
  keyed to the trend score, your share count, and the volatility regime.
- **Settings** — pick the market-data provider.

## Market data

| Provider | Key | Free tier |
|---|---|---|
| Demo data (default) | none | Synthetic prices; works offline so the app demos itself |
| [Alpha Vantage](https://www.alphavantage.co/support/#api-key) | free | 25 requests/day — responses cached per day |
| [Twelve Data](https://twelvedata.com/) | free | 800 credits/day, 8/min — responses cached per day |

API keys are stored in localStorage and sent only to that provider. Daily bars
are cached per calendar day to stay inside free-tier limits; if a fetch fails,
the app falls back to the most recent cache, then to demo data, and tells you.

## Methodology (trend trading)

The **weekly** chart sets the trend: price vs the 30-week MA, 10>30-week MA
alignment, 30-week MA slope, the 40-week (≈200-day) MA, and weekly MACD.
The **daily** chart confirms and times: golden/death cross, price vs 50-day MA,
RSI regime, MACD histogram, and 20-day breakouts/breakdowns. Each check adds or
subtracts points; the composite score in [−100, +100] maps to
STRONG BUY / BUY / HOLD / SELL / STRONG SELL, and every contributing reason is
shown. Realized volatility (HV20 + its 1-year percentile rank) stands in for IV
when ranking premium-selling vs premium-buying options structures — verify
actual implied volatility with your broker.

## Built with

Charts are rendered by TradingView's open-source
[lightweight-charts](https://github.com/tradingview/lightweight-charts)
(Apache-2.0) — candlesticks, pan/zoom, autoscaling and crosshair come from the
library; the theme, indicator panes, legend and multi-series tooltip are local.
The indicator math (`indicators.js`) is intentionally hand-written and
dependency-free: the formulas are small, the popular indicator packages on npm
are largely unmaintained, and keeping the math local makes the signal scoring
auditable in one file.

**Decision support only — not financial advice.**

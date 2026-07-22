# AI-Guided Trend Research System

## Project Specification — Version 0.4, July 22, 2026

**Purpose:** test whether a skilled individual using frontier AI can compress an
institutional-grade quantitative research capability into a low-touch, auditable
system that identifies trends, produces protected actions, builds domain
competence, and improves as frontier models advance.

v0.3 (drafted in ChatGPT without knowledge of this repository) is preserved at
`docs/archive/PROJECT_SPEC_v0.3.md`. Its thesis, decision record, research
questions, and layered definition of success carry forward unchanged unless
amended below. This version adds what v0.3 lacked: the budget and calendar, the
integration with the existing Trend Desk, the evidence and promotion protocol,
the registry and documentation architecture, and the account/tax decisions.

## What changed from v0.3

| Area | v0.3 | v0.4 |
|---|---|---|
| Repository | New `trend-lab` repo | This repo. Python research engine added under `engine/`; the existing Trend Desk dashboard, journal, and weekly ritual are the presentation and behavioural layer. |
| Timeline | Unstated | Build now; validation via historical replay in August–September; **live execution begins Fall 2026 (non-negotiable)**. |
| Paper trading | Implied calendar-time paper phase | Replaced by synthetic paper: walk-forward out-of-sample testing plus a week-by-week replay drill over recent history. No months-long real-time paper phase. |
| Promotion | "After out-of-sample evidence is credible" | Immediate promotion to live at minimum risk once gates pass. The tiny risk budget, not calendar time, is the safeguard while live evidence accumulates. |
| Evidence | Undefined | Defined protocol: walk-forward, untouched holdout, trial registry, replay drill. See "Evidence and validation". |
| Accounts | Unstated | TFSA plus margin account. Mixed CAD/USD, mostly USD. No RRSP. |
| Kill criteria | None | Three levels: per-position stops, per-strategy retirement, account circuit breaker. No program-level "AI failed" kill switch. |
| Agents | Claude-centric | Agent-agnostic. Codex as build workhorse, Fable 5 as architect/reviewer. `AGENTS.md` is the common entry point. |

## Budget and calendar

- **Capital:** $50,000 to start. Live risk 0.25%–0.50% of closed equity per
  trade ($125–$250), maximum portfolio heat 1.0% ($500). These limits are
  reviewed after the first full quarter of live operation, with a planned
  option to raise heat to 2.0% if gates are met. Kyle approves any change.
- **Data:** seed budget is available. Expected spend: Tiingo free tier first;
  one month of a paid source (about $50) only if needed to seed or reconcile
  deep adjusted history. Ongoing data cost target: $0–$30/month.
- **Model use:** on existing subscriptions (Claude, Codex). No per-token API
  budget for research runs.
- **Cost ledger:** the experiment measures minimum viable scale and cost, so
  cost is recorded as data: Kyle's hours per week, agent sessions run, data
  spend. One line per week in `engine/registry/costs.jsonl`.

**Calendar (2026):**

| Window | Milestone |
|---|---|
| Now – Aug 15 | M1: data foundation, baseline engine, walk-forward backtester, risk sizing, reports (build) |
| Aug 15 – Sep 15 | M2: baseline validation, replay drill, first AI-feature experiments |
| Late Sep – Oct | M3: live execution begins, 1x ETFs, minimum risk settings |
| Q4 2026 → | M4: research engine iterates; equities cohort; 2x execution only after one live quarter and gates passed |

The financial success layer is restated for this capital base: live trading
must pay its own costs and taxes and compound enough to justify expanding to
new instruments and larger sizes. At 1% maximum heat on $50k the absolute
dollar outcomes in year one will be small by construction; the judgment is
risk-adjusted process quality, not dollar P&L.

## Repository architecture

Single repository (this one). One audit trail, one place agents look, and the
research engine's output feeds the dashboard directly instead of crossing a
repo boundary.

```text
investment-trading-dash/
  AGENTS.md                  # agent-agnostic orientation, ~1 page (CLAUDE.md points here)
  docs/
    PROJECT_SPEC.md          # this file
    DECISIONS.md             # append-only decision log, one line + reason each
    DOMAIN_GLOSSARY.md
    archive/                 # superseded specs
  dashboard/                 # existing Trend Desk UI (unchanged role)
  server/                    # existing Express + SQLite backend (unchanged role)
  scripts/                   # existing dossier / report / outcomes pipeline
  data/                      # existing live-state store (SQLite + committed JSON printouts)
  engine/                    # NEW: Python research engine
    pyproject.toml
    config/                  # assets.yaml, research.yaml, risk.yaml
    data/
      raw/<provider>/<date>/*.parquet     # immutable snapshots
      curated/market.duckdb               # normalized store
    trendlab/
      data/ features/ states/ backtest/ portfolio/ reporting/
    tests/
    registry/                # machine-readable project memory (see below)
  test/                      # existing Node tests
```

**Division of responsibility:**

- `engine/` (Python, DuckDB): ingestion, features, state classification,
  walk-forward backtesting, sizing, weekly signal generation. Deterministic;
  everything reproducible from raw snapshots plus config.
- Trend Desk (Node, SQLite): presentation, positions, trade journal with
  on-plan grading, outcomes self-scoring, weekly report ritual. Already built;
  it is the "recorded, presented, behaviour-measured" layer.
- **Contract:** the engine emits a weekly actions JSON conforming to a schema
  in `data/reports/SCHEMA.md` (extended as needed). The dashboard renders it.
  The existing `/weekly-report` skill evolves to read the engine's output as
  its dossier rather than recomputing indicators in Node.

The Node indicator/signals code remains as an independent cross-check during
M1–M2 (two implementations agreeing on SMA/ATR values is a cheap correctness
test), then becomes display-only.

## Documentation and memory architecture

Design goal: a fresh agent session becomes productive by reading under ~5k
tokens, not by replaying chat history or crawling the repo.

1. **`AGENTS.md`** (root): what the project is in three sentences, the repo
   map, the non-negotiable rules (never trade live without Kyle, never modify
   frozen configs, never fabricate data or URLs, log every material decision),
   and "read next" pointers by task type. Codex reads `AGENTS.md` natively;
   `CLAUDE.md` contains one line pointing to it.
2. **`docs/DECISIONS.md`**: append-only. One line per decision, date, reason.
3. **Registries** (`engine/registry/`), machine-readable, committed:
   - `experiments.jsonl` — one line per experiment ever run, pass or fail:
     id, date, hypothesis, config hash, data range, fold scheme, headline
     metrics, verdict. Failed experiments are recorded with the same care as
     successes; the file doubles as the trial counter for overfitting control.
   - `strategies/<name>-v<N>.yaml` — one file per strategy version: frozen
     parameters, config hash, status (`research` | `candidate` | `operating` |
     `retired`), promotion or retirement record with date and evidence links.
   - `costs.jsonl` — weekly cost and effort ledger.
   - Live trades, actions, and overrides stay in the existing SQLite +
     committed JSON printout pattern; the registries reference them by date.
4. No separate resume protocol. The registries plus git history are the
   memory; any session can reconstruct state from them. (The SR&ED-style
   mid-flight manifest is deliberately not carried over.)

## Evidence and validation

**Definition of an experiment.** An experiment is one registered test of one
defined hypothesis — a feature, a strategy configuration, a sizing rule —
over specified data with a manifest and a recorded verdict. It is not the
program itself. Most weeks run zero experiments; experiments happen when the
research engine has something to test.

**Out-of-sample, stated precisely.** Parameters and features are selected on
a training window; the test is on data the selection process never touched.
The primary protocol is walk-forward: train on earlier data, freeze, test on
the *later* adjacent unseen segment, advance, repeat, aggregate. Testing on
data earlier than the training window is a secondary robustness check (a
method fitted to 2015–2025 should not fall apart on 2004–2014), not the main
evidence. Live trading from Fall 2026 onward is the true out-of-sample
stream and is itself experiment data.

**Protocol:**

1. Baselines: buy-and-hold, cash, and one pre-registered transparent trend
   strategy — **the 30-week moving-average system already implemented in the
   Strategy Lab** (own the weekly uptrend, exit when the 30-week MA is lost).
   Registered now so the baseline cannot be shopped later.
2. Walk-forward folds with embargo gaps; next-bar fills; stops evaluated
   intrabar on daily bars with gaps through the stop filling at the open,
   never at the stop price; signals on adjusted prices, P&L on raw prices
   plus distributions.
3. **Untouched holdout:** the most recent 18 months of history is excluded
   from all research. It is evaluated exactly once per candidate, at
   promotion time. A candidate that shines in folds and fails the holdout is
   rejected and the failure is registered.
4. **Trial accounting:** every configuration tested lands in
   `experiments.jsonl`. Promotion write-ups must state how many trials
   preceded the winner; the more trials, the higher the bar. Strategy
   complexity is capped (target: ≤5 free parameters per strategy) and every
   feature carries a one-line economic rationale before testing.
5. **Replay drill (synthetic paper):** before live, operate the full weekly
   loop over the most recent 12 months one week at a time with data truncated
   to each decision date — fetch, features, states, actions, sizing, report.
   This proves operational fidelity without burning calendar time. It
   replaces the months-long real-time paper phase the calendar cannot afford.

**Evidence standard with few trades.** Tens of trades per year cannot reach
conventional statistical significance, and the protocol does not pretend
otherwise. The evidence stack is: (a) out-of-sample walk-forward across ~20
years and multiple regimes, (b) clean replay, (c) live results tracked
against the pre-registered expectation with strictly bounded risk. Immediate
live promotion is acceptable precisely because the maximum cost of being
wrong is capped at the risk budget; live evidence is being purchased cheaply.

## Promotion and retirement

**Promotion gates (pre-registered, checked by the validation-auditor role,
approved by Kyle):**

1. Beats the transparent baseline on aggregate out-of-sample folds, and in a
   majority of folds, and is not carried by a single asset.
2. Out-of-sample maximum drawdown within stated tolerance of the baseline's.
3. Passes the untouched holdout on first and only evaluation.
4. Trial count disclosed; auditor signs off that selection pressure is
   accounted for.
5. Clean replay drill.

**Promotion mechanics:** operating engine = a git tag plus the frozen config
hash recorded in the strategy's registry file and `DECISIONS.md`. The
operating engine does not change during a live evaluation block; candidates
compete against it on identical frozen tests.

**Retirement and circuit breakers (kill criteria live here, not at program
level):**

- Per-position: broker-held protective stops, always.
- Per-strategy: retired if live expectancy over a rolling window is
  materially below the out-of-sample expectation, or drawdown exceeds the
  worst backtest drawdown by a stated margin. Retirement is a registry entry
  with evidence, not a deletion.
- Account: if live drawdown from peak closed equity reaches **6%**, no new
  entries until Kyle reviews and documents the decision to resume.
- Program: quarterly review of the layered success table, cost ledger, and
  learning notes. The review judges process, cost, and trajectory. "AI
  cannot identify trends" is a possible finding, never an automatic stop.

## Live operation

Weekly loop, one command (`trendlab run-weekly`), runnable by any agent or a
scheduled task, with holiday handling and a defined behaviour on data
failure (report and halt, never guess):

1. Fetch missing bars after Friday close; validate.
2. Compute features, states, stops, actions, sizes.
3. Emit weekly actions JSON; dashboard picks it up; the weekly report ritual
   arbitrates and records as it does today.
4. Kyle reviews and places any order. Broker-held stops stay active.
5. Record instruction, execution, override urge, and reason before outcomes
   are known (already implemented in the trade journal / outcomes pipeline).

Most weeks produce no trades. That is expected and is itself data.

**Accounts and tax (decided):** TFSA plus margin account; no RRSP. Mixed
CAD/USD, mostly USD. Logged considerations, on the record rather than
resolved here: frequent trading inside a TFSA carries CRA
business-income recharacterization risk (Kyle's own domain, his call and his
monitoring); US-listed ETF distributions in a TFSA bear unrecoverable 15%
withholding; taxable-account re-entries within 30 days engage superficial
loss rules; USD conversion cost and FX exposure are part of "after costs."
Which instruments sit in which account is decided and logged before the
first live order.

## Universe and horizons

Unchanged from v0.3: GLD, SPY, TLT on daily adjusted data, weekly decisions,
three time layers (structural 126–378d, tradable 20–80d, entry/protection
5–20d). Later 2x execution via UGL, SSO, UBT — with the note that UBT is
thin; check its real spread before assuming the 2x path is uniform.

Equities cohort (phase two): AAPL, NVDA, TSLA, SPCX. SPCX listed June 12,
2026 (verified); forward observation only, no regime backtesting on six
weeks of history. Point-in-time historical earnings dates are hard to source
cheaply; historical dates may be approximate and flagged as such, with as-of
correctness guaranteed only from collection start.

## Governance

Roles unchanged from v0.3 (Kyle as principal investigator; research
architect, data engineer, quant implementation, validation auditor, portfolio
and risk, knowledge curator — performed by models, sequentially at first).
Standing assignment: **Codex is the default build workhorse; Fable 5 is
architect and reviewer.** The repo is agent-agnostic: everything either
needs is reachable from `AGENTS.md`. The validation auditor must be a
different session (and ideally a different model) from the proposing agent.
Every material run records model, role, inputs, outputs, commit, and
experiment IDs.

## First milestone (M1), updated

Build in `engine/`:

1. Provider-neutral EOD interface; Tiingo adapter first; immutable raw
   Parquet snapshots; normalized DuckDB.
2. GLD, SPY, TLT full adjusted daily history, validated (gaps, splits,
   dividends, cross-source reconciliation where a second source exists).
3. The pre-registered 30-week baseline, ported to Python and verified
   against the existing Node Strategy Lab results on identical data.
4. Configurable walk-forward folds, experiment manifests, trial registry.
5. Next-bar fills, fees, slippage, intrabar stop logic, account-risk sizing.
6. Weekly actions JSON conforming to the dashboard contract; HTML report.
7. `AGENTS.md`, `docs/DECISIONS.md`, `docs/DOMAIN_GLOSSARY.md`, registries
   seeded.
8. `trendlab run-weekly` end to end on current data.

Python 3.11+, typed, pytest, clear module boundaries, useful errors. Do not
build the AI feature-discovery engine, options logic, brokerage automation,
or new UI in M1.

## Kickoff prompt (agent-agnostic)

```text
You are implementing milestone M1 of the AI-Guided Trend Research System.
Read AGENTS.md, then docs/PROJECT_SPEC.md in full. The repository already
contains a working Node dashboard and weekly-report pipeline; do not modify
them except where the spec defines the engine-to-dashboard contract. Build
only the M1 scope listed in the spec. Before coding, write an implementation
plan and identify any specification conflicts; do not silently change the
research protocol. Record decisions in docs/DECISIONS.md. Run tests and the
end-to-end weekly pipeline before declaring the milestone complete, and
verify the Python baseline against the Node Strategy Lab on identical data.
```

## Sources

Carried from v0.3 (see archive), plus:

- SpaceX IPO, June 12, 2026 (NASDAQ: SPCX): https://www.cnbc.com/2026/05/20/spacex-ipo-live-updates.html
- Tiingo EOD: https://www.tiingo.com/documentation/end-of-day
- DuckDB Python: https://duckdb.org/docs/lts/clients/python/overview

> Experimental research and software specification. Historical, replayed and
> paper results cannot establish future profitability. Leveraged products,
> gaps, slippage and operational failures can cause losses beyond the
> intended stop. Decision support only, not financial advice.

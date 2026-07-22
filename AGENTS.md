# Trend Desk / TrendLab agent guide

This repository combines the existing Node Trend Desk with a deterministic
Python research engine. TrendLab produces evidence, weekly actions, and risk
sizing; Trend Desk presents those outputs and preserves the human decision and
outcome record. The governing research protocol is `docs/PROJECT_SPEC.md`.

## Read next

- Any task: read `docs/PROJECT_SPEC.md` and `docs/DECISIONS.md` first.
- Engine/data/backtest work: also read `engine/config/*.yaml` and the relevant
  strategy registry file under `engine/registry/strategies/`.
- Dashboard/report-contract work: also read `data/reports/SCHEMA.md`.
- Terminology questions: read `docs/DOMAIN_GLOSSARY.md`.

## Repository map

- `engine/`: Python ingestion, validation, features, states, backtests, sizing,
  registries, and weekly action/report generation.
- `dashboard/`, `server/`, `scripts/`: existing Node Trend Desk. Preserve its
  role except for the documented engine-to-dashboard contract.
- `data/`: Trend Desk live state and committed JSON evidence printouts.
- `docs/`: protocol, append-only decisions, glossary, and archived specs.

## Non-negotiable rules

- Never place a live trade or automate brokerage execution. Kyle approves and
  places every order.
- Never modify a frozen/operating strategy config. Create a versioned candidate.
- Never fabricate market data, news, reconciliation evidence, or URLs.
- Never expose the 18-month holdout during research; evaluate it once only at
  candidate promotion.
- Register every experiment, including failures, before interpreting results.
- Record every material protocol or implementation decision in
  `docs/DECISIONS.md`.
- On missing/stale/invalid data, report and halt; do not guess or silently fall
  back to synthetic/demo data.

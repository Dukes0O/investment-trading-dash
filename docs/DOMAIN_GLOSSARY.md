# Domain glossary

- **Adjusted price:** Split- and distribution-adjusted series used for signals.
- **Raw price:** Actual traded price used for fills and P&L.
- **Baseline:** The pre-registered 30-week long/flat trend strategy.
- **Candidate:** A frozen strategy version being evaluated for promotion.
- **Embargo:** Trading sessions intentionally skipped between train and test.
- **Holdout:** Newest 18 months, hidden from research and evaluated once at promotion.
- **Heat:** Equity at risk across all open positions if protective stops fill.
- **Next-bar fill:** A close-derived signal executed no earlier than the next open.
- **Raw snapshot:** Immutable provider response normalized to Parquet for audit.
- **Replay drill:** Week-by-week operation with data truncated to each decision date.
- **Trial:** One registered test of one hypothesis/configuration/data manifest.
- **Weekly action:** Deterministic engine recommendation with state, stop, and size;
  Kyle and the weekly report ritual arbitrate it before any order.
- **Walk-forward:** Freeze on earlier data, test on the adjacent later unseen period,
  advance, and aggregate out-of-sample results.

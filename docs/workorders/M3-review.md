# M3 review notes — architect review of the Codex build

Reviewed 2026-07-22 by Fable 5. Verdict: **approved, no blocking items**.
45 pytest (including the four hand-computed synthetic cycle tests), 22 Node
tests, parity exact with baseline evidence unchanged. All four acceptance
criteria met: synthetic exactness, SPY episodes include 2008 and 2020 with
`holdoutEvaluated: false`, `status` exposes `lastDiagnostics`, every
chat-facing number traces to the manifest.

Codex correctly caught and documented a spec error: the work order's printed
`declineAvoidedPct` operands contradicted its own prose (flat-through-decline
must score +100); the implementation follows the prose and the deviation is
decision-logged. The replay-manifest slimming (JSONL sidecar with SHA-256,
historical manifests left immutable) was done unprompted and matches the
housekeeping note from the M2 review.

## Notes for the record (no action required in M3)

1. **Dividend-cushion artifact.** The buy-and-hold convention holds
   distributions as uninvested cash, so late-sample percentage declines are
   cushioned by decades of accumulated dividends (SPY Feb–Mar 2020 shows
   −28.0% here versus −33.9% on prices). Both curves share the convention,
   so cross-curve ratios stay comparable and the binding-constraint
   conclusions are robust to it, but episode magnitudes are not
   price-decline magnitudes, and the 15% threshold binds a deeper price
   move late in the sample than early. If M4 tunes anything against episode
   magnitude, revisit: either reinvest distributions or detect episodes on
   price-only curves.
2. **Constraint commensurability.** The three compared costs are not in
   identical units (two normalized shortfall shares, one cumulative
   round-trip cost). This was the work order's own construction; the
   arithmetic is disclosed in every manifest. Treat the constraint label as
   a research pointer, not a measurement.

## Findings (the reason M3 existed)

Full pre-holdout period, registered baseline versus buy-and-hold:

| | GLD | SPY | TLT |
|---|---|---|---|
| Wealth ratio (strategy / buy-and-hold) | **0.535** | **0.620** | 1.071 |
| Mean decline avoided | 14.0% | 53.2% | 33.2% |
| Mean recovery captured | 26.2% | 27.6% | 63.4% |
| Whipsaw round trips (of exit/re-entry pairs) | 27 of 31 | 46 of 52 | 23 of 35 |
| Cumulative whipsaw cost | 98.0pp | 177.1pp | 52.1pp |
| Binding constraint | whipsaw | whipsaw | late-exit |

Reading: the long/flat 30-week baseline ends with roughly half to
five-eighths of buy-and-hold wealth on GLD and SPY. The dominant cost is
not exiting late or re-entering late in major cycles — it is the sheer
number of exit-and-rebuy-higher round trips between episodes (46 of SPY's
52 re-entries were above the prior exit). Recovery capture is also poor
(the 1998 SPY episode: the system was never long again before the full
recovery — 0% captured), but whipsaw dominates arithmetically on two of
three assets.

Implication for M4: the parameter budget's first claim is **whipsaw
reduction** (exit hysteresis or confirmation, not faster re-entry), with
recovery capture second. This partially contradicts the late-re-entry
hypothesis from the design discussion — which is exactly why M3 measured
before M4 spends.

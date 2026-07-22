# M2 review notes — architect review of the Codex build

Reviewed 2026-07-22 by Fable 5. Verdict: **approved with notes**. Nothing
below blocks committing M2 or the first live weekly run at current risk
settings (0.25%/trade, three assets). Items 1 and 2 must land before any
risk-fraction increase or universe expansion; the rest are enhancements.

Verified during review: 34 pytest + 20 Node tests pass; Python/Node parity
exact after the simulator refactor (GLD 191.14 / SPY 844.18 / TLT 85.03,
unchanged from the M1-fixed baseline); long-to-short flip fills both legs at
the same session open with correct cash accounting (hand-checked); short
stop gaps fill at the open; shorts pay distributions; borrow accrues over
calendar days; both 52-week replays plus a fresh 6-week replay ran with
zero halts; the `trend-30w-ls-v1` rejection verdict, gate arithmetic, and
three-line trial history are all faithful to the protocol.

## 1. Replay's signal oracle conflates sizing with signals (fix before any risk/universe change)

`_signal_checks` in `engine/trendlab/replay.py` expects `BUY` whenever the
entry rule fires for an unheld symbol. `build_actions` downgrades a
heat-capped BUY (sized quantity 0) to `AVOID`, so the first time the heat
cap binds inside a replay, the week halts with "signal regression mismatch",
which misreports a sizing outcome as a signal regression. Unreachable at
0.25% x 3 assets (0.75% < 1% cap); reachable the moment either number
changes. Fix: the oracle should compare states plus pre-sizing intent, and
record a heat-capped downgrade as its own row status (not a mismatch, not a
halt). Add a test that forces the cap to bind inside a replay week.

## 2. Heat's stop source needs an explicit convention (fix soon, decision-log it)

`calculate_current_heat` prices held-position risk with the stop from the
*previous* actions document, while the same run emits a *new* recomputed
protective stop for that symbol. Whose stop does the broker actually hold?
Define it: the actions document should carry both `activeStop` (the stop
currently working at the broker, used for heat) and `proposedStop` (this
week's recomputed level, which becomes active only after Kyle confirms the
roll). Until then the two-stop ambiguity is small but real, and it grows
with position count. Record the convention in `docs/DECISIONS.md` when
implemented, and bump the engine-actions schema deliberately.

## 3. Replay never exercises holiday-shortened weeks (enhancement)

Decision dates are the intersection of Fridays that have bars in all three
symbols, so a week ending Thursday (Good Friday, Thanksgiving) is silently
skipped — exactly the edge `week_is_complete` treats conservatively. Add
calendar-Friday decision dates whenever data exists through that week's last
session, so the drill covers the stale-week path and the conservative
one-week lag is observed rather than assumed.

## 4. `AVOID` as the heat-capped label reads bearish (minor, decide and log)

The rationale string is honest ("the portfolio heat cap leaves no
capacity"), but the action enum value is the same one used for downtrend
symbols, and downstream consumers (dashboard, LLM arbitration) key on the
enum. Either add a distinct value in a deliberate schema bump (e.g.
`DEFER`), or record a decision that consumers must read the rationale for
uptrend-AVOID rows. Not urgent while the cap cannot bind.

## 5. Noted, no action required

- Borrow accrual skips the entry session (first charge covers the next
  inter-session gap): fine, documented convention, immaterial at 25 bps.
- Sharpe compares strategies with different market exposure; flat days
  dilute both. Acceptable for fold screening; revisit metric choice only at
  promotion time.
- `_long_short_verdict` correctly encodes the work-order gate
  (majority of folds on return AND Sharpe, plus >= 2 assets with positive
  short contribution), and the honest three-run trial history is exactly
  the append-only accounting the protocol demands. Good work.

## Result interpretation (for the record)

The symmetric mirror was rejected on pre-holdout evidence: short
contribution +18.10pp TLT, -5.51pp GLD, -26.90pp SPY; 14/52 folds beat
long/flat on return. The stated prior (short side helps GLD and TLT more
than SPY) was half right: only the bond downtrend was orderly enough for a
30-week weekly mirror to monetize. Any follow-up (per-asset short
enablement, faster weakening detection) is a NEW experiment with its own
registration, parameter budget, and gates — it does not inherit this one's.

## M3 scope pointer

The cycle diagnostics discussed after M2 was drafted (percent of each major
decline avoided, percent of recovery captured, trough-to-reentry delay,
false exits, full-period wealth versus buy-and-hold) were not part of M2 and
remain the priority candidate for M3, alongside items 1 and 2 above.

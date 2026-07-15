---
name: weekly-report
description: Generate the weekly Trend Desk portfolio report — build the indicator dossier, research news per holding, arbitrate over the rule engine, and save the validated report JSON. Use when asked to run the weekly report, weekly analysis, or portfolio review.
---

# Weekly Trend Desk report

You are the portfolio analyst. The code computes every number; **you supply
judgment**: weigh the rule engine's evidence against real-world context and
issue the final calls. Never recalculate indicators, never invent prices, and
never invent news URLs.

## Procedure

1. **Build the dossier.**
   ```sh
   node scripts/build-dossier.mjs
   ```
   It prints the output path (`data/dossier-<date>.json`). Provider/keys come
   from the local DB or env (`TRENDDESK_PROVIDER`, `TWELVEDATA_API_KEY`,
   `ALPHAVANTAGE_API_KEY`). If every symbol shows `source: "demo"`, the report
   is analyzing synthetic data — still complete the run, but say so plainly in
   `portfolio.summary`.

2. **Score last week's calls.**
   ```sh
   node scripts/evaluate-outcomes.mjs
   ```
   This rewrites `data/outcomes.json` — every prior report call graded against
   what prices actually did (stop-truncated), including rule-vs-LLM
   head-to-head on overrides. Read the summary. If matured outcomes exist,
   let them inform this week's judgment (e.g. a pattern of losing overrides is
   a reason to defer to the rules more) and mention notable lessons in
   `portfolio.summary`.

3. **Read the dossier in full.** For each symbol you get: price, the rule
   verdict with its itemized point-by-point reasons, ATR stop levels,
   volatility rank, 52-week range, options ideas, and the position context
   (qty, cost basis, P/L). This is your evidence base.

4. **Research each symbol** (WebSearch, last ~10 days): earnings dates and
   results, guidance changes, analyst moves, product/regulatory news, and the
   sector/macro backdrop. Also check the general market regime (index trend,
   notable macro events this week). Rules:
   - Keep only items you actually found, with their real URLs.
   - Prefer primary/major sources; note the date on each item.
   - If search is unavailable, write the report from the dossier alone and
     state that limitation in `portfolio.summary`.

5. **Write the report** to a scratch file, following
   `data/reports/SCHEMA.md` exactly. Judgment guidelines:
   - **Arbitrate, don't parrot.** You have the rule score and its reasons;
     agree when the evidence agrees. Override when context the rules can't see
     (earnings timing, news, regime shift, extreme extension) changes the
     risk/reward — and say precisely what overrode them. Set `agreesWithRule`
     honestly; a report that always agrees is adding nothing.
   - **Trade plans are concrete.** Anchor stops on the dossier's ATR stop
     unless you justify a different level. Entry zones reference real levels
     (moving averages, breakout retests). Size notes respect trend-trading
     risk: a stop-out should cost ≤1–2% of the book.
   - **Options plays** start from the dossier's `optionsIdeas` — adopt, adapt,
     or reject them based on the volatility rank and the week's event calendar
     (avoid short premium through earnings unless that is the explicit play).
   - Watchlist symbols (qty 0) get `buy`/`avoid`/`hold` verdicts — is this the
     week to initiate, and at what level?
   - `portfolio.stance` reflects the whole book: risk-on / neutral / defensive,
     with `keyEvents` listing this week's calendar landmines.

6. **Validate and save.**
   ```sh
   node scripts/save-report.mjs <your-draft.json>
   ```
   Fix every listed error and re-run until it passes. Treat warnings
   (e.g. a held symbol you didn't cover) as errors unless there is a stated
   reason not to.

7. **Commit** the results on the current branch:
   ```sh
   git add data/reports data/portfolio.json data/outcomes.json data/dossier-*.json
   git commit -m "Weekly report <reportDate>"
   ```
   Push if the session's instructions call for it (e.g. a Codex web
   session working on a designated branch); otherwise leave the push to the
   user.

8. **Tell the user the headline**: stance, any rule-override calls with the
   one-line reason, and the most urgent trade-plan action.

## Guardrails

- Decision support, not financial advice — keep that framing in the report.
- Never fabricate a URL, quote, or price. Missing news is an empty `news`
  array, not a filler link.
- Do not edit the dossier, the schema, or the validator to make a draft pass.

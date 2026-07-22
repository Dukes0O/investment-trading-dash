# Weekly report contracts

## Engine actions contract (schemaVersion 2)

Before the LLM-authored weekly report, TrendLab writes
`data/reports/engine-actions-<YYYY-MM-DD>.json`. The existing dossier builder
attaches that object verbatim as top-level `engineActions`; it does not replace
the existing `symbols[].ruleSignal` or any LLM arbitration field.

Required shape:

```jsonc
{
  "schemaVersion": 2,
  "kind": "trendlab-weekly-actions",
  "reportDate": "2026-07-22",
  "generatedAt": "2026-07-22T12:00:00Z",
  "provider": "tiingo",
  "strategy": { "id": "trend-30w", "version": 1 },
  "configHash": "sha256 hex",
  "requiresHumanApproval": true,
  "executionTiming": "next market open after Kyle reviews and approves",
  "portfolioHeat": {
    "current": 0.0,
    "maximum": 500.0,
    "afterProposedBuys": 125.0,
    "positions": []
  },
  "actions": [{
    "symbol": "GLD",
    "held": false,
    "state": "uptrend",
    "signalIntent": "BUY", // BUY | HOLD | EXIT | AVOID; before sizing
    "action": "BUY", // BUY | HOLD | EXIT | AVOID | DEFER
    "signalDate": "2026-07-21",
    "referencePrice": 300.0,
    "activeStop": null, // confirmed broker stop; required when held
    "proposedStop": 285.0, // recomputed level awaiting Kyle's approval
    "atr14": 5.0,
    "quantity": 8,
    "risk": { "quantity": 8, "risk_budget": 120.0 },
    "weekly": { "close": 300.0, "fastSma": 290.0, "slowSma": 280.0 },
    "rationale": "Completed weekly close and 10-week SMA are above the 30-week SMA."
  }],
  "validation": {},
  "snapshots": { "GLD": "data/raw/tiingo/2026-07-22/GLD.parquet" }
}
```

The engine must halt instead of writing this document when required market data
is missing, invalid, or stale. `BUY` requires a positive quantity and proposed
stop. `signalIntent` records the strategy decision before sizing. When a BUY
signal has no remaining heat capacity, `action` is `DEFER`, quantity is zero,
and `signalIntent` remains `BUY`; this is capacity-constrained, not bearish.

For held positions, `activeStop` is the stop confirmed as working at the broker
and is the only stop used for current heat. `proposedStop` is this week's fresh
3x ATR level and does not become active merely because the engine emitted it.
Kyle confirms a roll by recording `activeStop` on the corresponding in-scope
position in `data/portfolio.json`; that value overrides the carried-forward
`activeStop` in the previous engine-actions document. Missing confirmed stops
halt the run. Replay is synthetic and assumes each proposed roll is approved
before the next replay week.

Proposed BUYs are sized sequentially in configured asset order and may not push
`afterProposedBuys` above `maximum`. Every document requires human approval and
is decision support only. The loader remains compatible with schema v1 evidence,
where the historical `protectiveStop` field represented the single stop value.

## LLM weekly report contract (schemaVersion 1)

The LLM weekly report is a single JSON object, validated by
`scripts/lib/report-schema.mjs` (run `node scripts/save-report.mjs <draft>`).
It is written by an LLM session that has read the technicals dossier
(`data/dossier-<date>.json`) and researched news per symbol. The LLM
**arbitrates over the rule engine**: it copies the rule verdict in, issues its
own verdict, and must say when and why it disagrees.

```jsonc
{
  "schemaVersion": 1,
  "reportDate": "2026-07-06",          // the Monday (or run date), YYYY-MM-DD
  "generatedAt": "2026-07-06T12:30:00Z",
  "dossierDate": "2026-07-06",         // date of the dossier analyzed

  "portfolio": {
    "stance": "risk-on",               // risk-on | neutral | defensive
    "summary": "Markdown. The week's read on the whole book: trend posture, concentration, what to watch.",
    "totalValue": 16844.5,             // copy from the dossier
    "keyEvents": [                     // this week's calendar landmines (may be empty)
      "AAPL earnings Thursday after close"
    ]
  },

  "symbols": [                         // one entry per portfolio/watchlist symbol
    {
      "symbol": "AAPL",
      "ruleSignal": { "action": "BUY", "score": 42 },   // copied verbatim from the dossier
      "llmVerdict": "hold",            // add | hold | trim | exit | buy | avoid
                                       //   (buy/avoid for watchlist symbols not yet held)
      "agreesWithRule": false,         // set honestly; disagreements are the point
      "confidence": "medium",          // high | medium | low
      "narrative": "Markdown, ≥80 chars. Synthesize the dossier's technicals with the news: why this verdict, what would change it.",
      "news": [                        // only items actually found via search — never invent URLs
        {
          "title": "…",
          "url": "https://…",          // must be http(s)
          "source": "Reuters",
          "date": "2026-07-03",
          "takeaway": "One line: why it matters to the position."
        }
      ],
      "risks": ["At least one concrete risk to this verdict"],
      "tradePlan": {
        "action": "hold",              // hold | add | trim | exit
        "entryZone": { "low": 98, "high": 102 },  // or null when not applicable
        "stop": 94.5,                  // anchor on the dossier's ATR stop unless justified; null if flat
        "sizeNote": "Keep ≤5% of book; add half-size on a 10-week MA retest.",
        "optionsPlay": {               // or null
          "name": "Covered call",
          "setup": "Sell 1× 30–45 DTE ~0.25Δ call vs 100 shares",
          "rationale": "Elevated HV rank; harvest premium while trend consolidates."
        }
      }
    }
  ]
}
```

Validator rules of note:
- every enum above is enforced; `agreesWithRule` must be a boolean
- `news[].url` must be http(s) — reports with invented links are rejected
- `narrative` ≥80 chars, `portfolio.summary` ≥40 chars, `risks` non-empty
- a held symbol missing from `symbols` is a **warning**, not an error
- re-saving the same `reportDate` replaces that week's report and rebuilds
  `index.json`

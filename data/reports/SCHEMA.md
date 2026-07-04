# Weekly report contract (schemaVersion 1)

The weekly report is a single JSON object, validated by
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

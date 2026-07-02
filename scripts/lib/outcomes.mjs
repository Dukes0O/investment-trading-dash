// Outcome evaluation core: scores past weekly-report calls against subsequent
// price action. Pure functions — no I/O — so the math is unit-testable.
//
// Scoring model (kept deliberately simple and documented so it can be audited):
//
// 1. Every call maps to an EXPOSURE in [0, 1] — how long the call says to be:
//      LLM verdict:  buy/add → 1 · hold → 1 if held else 0 · trim → 0.5
//                    exit/avoid → 0
//      Rule action:  STRONG BUY/BUY → 1 · HOLD → 1 if held else 0
//                    SELL → 0.5 if held else 0 · STRONG SELL → 0
//    ("held" comes from the dossier; a hold on a held name means stay long,
//     a hold on a watchlist name means stay flat.)
//
// 2. Forward return per horizon (1w = 5 bars, 4w = 20, 13w = 65) is
//    STOP-TRUNCATED for long exposure: if any bar's low touches the call's
//    stop before the horizon ends, the return is capped at the stop — that is
//    how a trend system actually exits, and it rewards well-placed stops.
//
// 3. score = exposure × truncatedReturn. For zero-exposure calls
//    (exit/avoid/stand-aside), being "right" means the RAW return was
//    negative — the call avoided a loss.
//
// 4. A call is graded right/wrong only outside a ±0.5% dead band ("flat").
//    On rule-vs-LLM disagreements the winner is whichever side's score is
//    higher by >0.2%; otherwise a tie.

export const HORIZONS = { '1w': 5, '4w': 20, '13w': 65 };
const FLAT_BAND = 0.5; // percent
const TIE_BAND = 0.2; // percent

export function llmExposure(verdict, held) {
  switch (verdict) {
    case 'buy':
    case 'add':
      return 1;
    case 'hold':
      return held ? 1 : 0;
    case 'trim':
      return 0.5;
    case 'exit':
    case 'avoid':
      return 0;
    default:
      return 0;
  }
}

export function ruleExposure(action, held) {
  switch (action) {
    case 'STRONG BUY':
    case 'BUY':
      return 1;
    case 'HOLD':
      return held ? 1 : 0;
    case 'SELL':
      return held ? 0.5 : 0;
    case 'STRONG SELL':
      return 0;
    default:
      return 0;
  }
}

// bars: ascending daily bars covering the report date onward.
// Returns { rawReturn, truncatedReturn, stopHit, stopDate, endDate } in
// percent, or null if the horizon hasn't matured (not enough bars yet).
export function forwardReturn(bars, reportDate, horizonBars, stop) {
  const start = bars.findIndex((b) => b.date > reportDate);
  if (start === -1) return null;
  const p0 = start > 0 ? bars[start - 1].close : bars[start].open;
  if (!(p0 > 0)) return null;
  const window = bars.slice(start, start + horizonBars);
  if (window.length < horizonBars) return null; // not matured yet

  let stopHit = false;
  let stopDate = null;
  let truncated = null;
  if (stop != null && stop > 0) {
    for (const b of window) {
      if (b.low <= stop) {
        stopHit = true;
        stopDate = b.date;
        // Fill at the stop unless the bar gapped below it.
        const fill = Math.min(stop, b.open);
        truncated = ((fill - p0) / p0) * 100;
        break;
      }
    }
  }
  const end = window[window.length - 1];
  const raw = ((end.close - p0) / p0) * 100;
  return {
    rawReturn: raw,
    truncatedReturn: truncated ?? raw,
    stopHit,
    stopDate,
    endDate: end.date,
    priceAtReport: p0,
  };
}

function grade(exposure, fwd) {
  // right / wrong / flat, from the call's perspective.
  if (exposure > 0) {
    const r = fwd.truncatedReturn;
    if (r > FLAT_BAND) return 'right';
    if (r < -FLAT_BAND) return 'wrong';
    return 'flat';
  }
  // Zero exposure: right when the avoided move was down.
  if (fwd.rawReturn < -FLAT_BAND) return 'right';
  if (fwd.rawReturn > FLAT_BAND) return 'wrong';
  return 'flat';
}

// call: { symbol, reportDate, llmVerdict, ruleAction, ruleScore,
//         agreesWithRule, stop, ruleStop, held }
// bars: daily bars for the symbol (ascending, spanning report date → now).
export function evaluateCall(call, bars) {
  const out = { ...call, horizons: {} };
  for (const [name, nBars] of Object.entries(HORIZONS)) {
    const expL = llmExposure(call.llmVerdict, call.held);
    const expR = ruleExposure(call.ruleAction, call.held);
    const fwdL = forwardReturn(bars, call.reportDate, nBars, expL > 0 ? call.stop : null);
    const fwdR = forwardReturn(bars, call.reportDate, nBars, expR > 0 ? call.ruleStop : null);
    if (!fwdL || !fwdR) {
      out.horizons[name] = { matured: false };
      continue;
    }
    const llmScore = expL * fwdL.truncatedReturn;
    const ruleScore = expR * fwdR.truncatedReturn;
    let winner = null;
    if (!call.agreesWithRule) {
      winner = Math.abs(llmScore - ruleScore) <= TIE_BAND ? 'tie' : llmScore > ruleScore ? 'llm' : 'rule';
    }
    out.horizons[name] = {
      matured: true,
      rawReturn: round2(fwdL.rawReturn),
      llm: { exposure: expL, return: round2(fwdL.truncatedReturn), stopHit: fwdL.stopHit, score: round2(llmScore), grade: grade(expL, fwdL) },
      rule: { exposure: expR, return: round2(fwdR.truncatedReturn), stopHit: fwdR.stopHit, score: round2(ruleScore), grade: grade(expR, fwdR) },
      winner,
    };
    out.priceAtReport = out.priceAtReport ?? round2(fwdL.priceAtReport);
  }
  return out;
}

export function summarize(calls) {
  const summary = {};
  for (const h of Object.keys(HORIZONS)) {
    const matured = calls.filter((c) => c.horizons[h]?.matured);
    if (!matured.length) {
      summary[h] = { calls: 0 };
      continue;
    }
    const graded = (side) => {
      const g = matured.map((c) => c.horizons[h][side].grade);
      const right = g.filter((x) => x === 'right').length;
      const wrong = g.filter((x) => x === 'wrong').length;
      return { right, wrong, flat: g.length - right - wrong, hitRate: right + wrong ? round2((right / (right + wrong)) * 100) : null };
    };
    const overrides = matured.filter((c) => !c.agreesWithRule);
    summary[h] = {
      calls: matured.length,
      llm: { ...graded('llm'), avgScore: round2(avg(matured.map((c) => c.horizons[h].llm.score))) },
      rule: { ...graded('rule'), avgScore: round2(avg(matured.map((c) => c.horizons[h].rule.score))) },
      overrides: {
        total: overrides.length,
        llmWon: overrides.filter((c) => c.horizons[h].winner === 'llm').length,
        ruleWon: overrides.filter((c) => c.horizons[h].winner === 'rule').length,
        ties: overrides.filter((c) => c.horizons[h].winner === 'tie').length,
      },
    };
  }
  return summary;
}

// Per-reason attribution: for each rule-engine reason present in a dossier
// symbol, check whether the 4-week raw forward move agreed with the reason's
// direction. Small samples are reported as-is — the UI gates on n.
export function reasonAttribution(calls, dossierReasonsByKey) {
  const acc = new Map(); // text -> { n, hits, sumAligned }
  for (const c of calls) {
    const h = c.horizons['4w'];
    if (!h?.matured) continue;
    const reasons = dossierReasonsByKey.get(c.reportDate + '|' + c.symbol);
    if (!reasons) continue;
    for (const r of reasons) {
      const aligned = r.bullish ? h.rawReturn : -h.rawReturn;
      const key = normalizeReason(r.text);
      const entry = acc.get(key) ?? { text: key, n: 0, hits: 0, sumAligned: 0 };
      entry.n++;
      if (aligned > FLAT_BAND) entry.hits++;
      entry.sumAligned += aligned;
      acc.set(key, entry);
    }
  }
  return [...acc.values()]
    .map((e) => ({ text: e.text, n: e.n, hitRate: round2((e.hits / e.n) * 100), avgAligned4w: round2(e.sumAligned / e.n) }))
    .sort((a, b) => b.n - a.n || b.avgAligned4w - a.avgAligned4w);
}

// Reasons embed live values ("Daily RSI 64 — ..."); normalize to the stable
// component so occurrences aggregate.
function normalizeReason(text) {
  return text.replace(/Daily RSI \d+/, 'Daily RSI regime').trim();
}

function avg(xs) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function round2(v) {
  return v == null ? null : Math.round(v * 100) / 100;
}

// Analysis engine: weekly trend scoring, buy/sell decisions, and rule-based
// options-strategy suggestions. Trend-trading framework:
//   - The WEEKLY chart sets the trend (10/30/40-week MAs ≈ 50/150/200-day).
//   - The DAILY chart refines timing (pullbacks, breakouts, momentum).
// Output is a composite score in [-100, +100] plus the individual reasons,
// so every recommendation is explainable.

import { sma, rsi, macd, bollinger, atr, historicalVolatility, percentileRank, donchian, toWeekly, yearRange } from './indicators.js';

const last = (arr) => (arr.length ? arr[arr.length - 1] : null);
const at = (arr, i) => (i >= 0 && i < arr.length ? arr[i] : null);

export function analyzeSymbol(dailyBars) {
  if (!dailyBars || dailyBars.length < 60) return null;

  const weeklyAll = toWeekly(dailyBars);
  // Analysis uses completed weeks; the in-progress week only informs "last price".
  const weekly = weeklyAll.length > 1 ? weeklyAll.slice(0, -1) : weeklyAll;

  const dCloses = dailyBars.map((b) => b.close);
  const wCloses = weekly.map((b) => b.close);

  const daily = {
    bars: dailyBars,
    sma20: sma(dCloses, 20),
    sma50: sma(dCloses, 50),
    sma200: sma(dCloses, 200),
    rsi14: rsi(dCloses, 14),
    macd: macd(dCloses),
    bollinger: bollinger(dCloses, 20, 2),
    atr14: atr(dailyBars, 14),
    hv20: historicalVolatility(dCloses, 20),
    donchian20: donchian(dailyBars, 20),
  };
  const wk = {
    bars: weekly,
    sma10: sma(wCloses, 10),
    sma30: sma(wCloses, 30),
    sma40: sma(wCloses, 40),
    rsi14: rsi(wCloses, 14),
    macd: macd(wCloses, 12, 26, 9),
  };

  const price = last(dCloses);
  const reasons = [];
  let score = 0;

  const add = (points, ok, textIfTrue, textIfFalse) => {
    if (ok == null) return;
    score += ok ? points : -points;
    reasons.push({ points: ok ? points : -points, text: ok ? textIfTrue : textIfFalse, bullish: ok });
  };

  // --- Weekly trend structure (the core of trend trading) — up to ±55 ---
  const w10 = last(wk.sma10);
  const w30 = last(wk.sma30);
  const w40 = last(wk.sma40);
  const wClose = last(wCloses);

  if (wClose != null && w30 != null) {
    add(15, wClose > w30, 'Weekly close above the 30-week MA (primary uptrend)', 'Weekly close below the 30-week MA (primary downtrend)');
  }
  if (w10 != null && w30 != null) {
    add(12, w10 > w30, '10-week MA above 30-week MA (bullish alignment)', '10-week MA below 30-week MA (bearish alignment)');
  }
  if (w30 != null && at(wk.sma30, wk.sma30.length - 5) != null) {
    const rising = w30 > at(wk.sma30, wk.sma30.length - 5);
    add(10, rising, '30-week MA is rising', '30-week MA is falling');
  }
  if (w40 != null && wClose != null) {
    add(8, wClose > w40, 'Price above the 40-week (≈200-day) MA', 'Price below the 40-week (≈200-day) MA');
  }
  const wMacdLine = last(wk.macd.line);
  const wMacdSig = last(wk.macd.signal);
  if (wMacdLine != null && wMacdSig != null) {
    add(10, wMacdLine > wMacdSig, 'Weekly MACD above its signal line (momentum with the trend)', 'Weekly MACD below its signal line (momentum against the trend)');
  }

  // --- Daily confirmation — up to ±30 ---
  const d50 = last(daily.sma50);
  const d200 = last(daily.sma200);
  if (d50 != null && d200 != null) {
    add(10, d50 > d200, 'Golden cross intact (50-day above 200-day MA)', 'Death cross intact (50-day below 200-day MA)');
  }
  if (price != null && d50 != null) {
    add(8, price > d50, 'Price above the 50-day MA', 'Price below the 50-day MA');
  }
  const dRsi = last(daily.rsi14);
  if (dRsi != null) {
    add(6, dRsi >= 50, `Daily RSI ${dRsi.toFixed(0)} — bullish regime (≥50)`, `Daily RSI ${dRsi.toFixed(0)} — bearish regime (<50)`);
  }
  const dMacdHist = last(daily.macd.histogram);
  if (dMacdHist != null) {
    add(6, dMacdHist > 0, 'Daily MACD histogram positive', 'Daily MACD histogram negative');
  }

  // --- Breakout / breakdown — up to ±15 ---
  const donUp = last(daily.donchian20.upper);
  const donLo = last(daily.donchian20.lower);
  if (price != null && donUp != null && donLo != null) {
    if (price > donUp) {
      score += 15;
      reasons.push({ points: 15, text: 'New 20-day high — breakout in progress', bullish: true });
    } else if (price < donLo) {
      score -= 15;
      reasons.push({ points: -15, text: 'New 20-day low — breakdown in progress', bullish: false });
    }
  }

  score = Math.max(-100, Math.min(100, Math.round(score)));

  // --- Extension / timing context (doesn't change trend, shapes the entry) ---
  const notes = [];
  const bbUp = last(daily.bollinger.upper);
  const bbLo = last(daily.bollinger.lower);
  if (dRsi != null && dRsi > 72) notes.push('Daily RSI is overbought (>72): if entering, prefer a pullback rather than chasing.');
  if (dRsi != null && dRsi < 28) notes.push('Daily RSI is oversold (<28): downside may be stretched near-term; avoid panic exits, but respect the trend.');
  if (price != null && bbUp != null && price > bbUp) notes.push('Price closed above the upper Bollinger band — extended; mean reversion risk near-term.');
  if (price != null && bbLo != null && price < bbLo) notes.push('Price closed below the lower Bollinger band — washed out near-term.');

  const decision = decide(score);

  // ATR-based risk levels for position management.
  const a = last(daily.atr14);
  const risk = a != null && price != null
    ? {
        atr: a,
        atrPct: (a / price) * 100,
        suggestedStop: price - 2.5 * a,
        trailingStop: d50 != null ? Math.max(price - 2.5 * a, d50) : price - 2.5 * a,
      }
    : null;

  const hv = last(daily.hv20);
  const hvRank = percentileRank(daily.hv20.filter((v) => v != null), 252);
  const range52 = yearRange(dailyBars);

  return {
    price,
    prevClose: at(dCloses, dCloses.length - 2),
    score,
    decision,
    reasons,
    notes,
    daily,
    weekly: wk,
    weeklyBars: weekly,
    risk,
    vol: { hv20: hv, hvRank },
    range52,
  };
}

function decide(score) {
  if (score >= 55) return { action: 'STRONG BUY', tone: 'good', summary: 'Weekly and daily trends aligned to the upside. Trend-following long entries are favored; add on pullbacks to the 10-week MA.' };
  if (score >= 25) return { action: 'BUY', tone: 'good', summary: 'Uptrend in place with minor caveats. Long entries favored; size normally and use the suggested stop.' };
  if (score > -25) return { action: 'HOLD', tone: 'neutral', summary: 'Mixed or transitioning trend. Hold existing positions with stops in place; wait for weekly confirmation before new entries.' };
  if (score > -55) return { action: 'SELL', tone: 'serious', summary: 'Downtrend developing. Reduce exposure into strength; avoid new long entries until the weekly trend repairs.' };
  return { action: 'STRONG SELL', tone: 'critical', summary: 'Weekly and daily trends aligned to the downside. Exit or hedge long exposure; trend traders stand aside or look elsewhere.' };
}

// Rule-based options strategies given the trend score, volatility regime and
// whether the account holds ≥100 shares (enables covered strategies).
export function optionsStrategies(analysis, sharesHeld = 0) {
  if (!analysis) return [];
  const { score, vol, price, risk } = analysis;
  const out = [];
  const highVol = vol.hvRank != null && vol.hvRank >= 60;
  const lowVol = vol.hvRank != null && vol.hvRank <= 30;
  const lots = Math.floor(sharesHeld / 100);

  const volNote = vol.hvRank == null
    ? 'Volatility rank unavailable — verify implied volatility with your broker before entering.'
    : highVol
      ? `Realized volatility is elevated (HV rank ${vol.hvRank.toFixed(0)}/100) — favors selling premium.`
      : lowVol
        ? `Realized volatility is depressed (HV rank ${vol.hvRank.toFixed(0)}/100) — favors buying premium / debit structures.`
        : `Volatility is mid-range (HV rank ${vol.hvRank.toFixed(0)}/100).`;

  if (score >= 25) {
    if (lots >= 1 && score < 55) {
      out.push({
        name: 'Covered call',
        fit: 'Own ≥100 shares in a steady (not explosive) uptrend',
        setup: `Sell 1 call per 100 shares, 30–45 DTE, ~0.25–0.30 delta (strike near ${money(price * 1.05)}–${money(price * 1.08)}). Roll or let assign at the strike.`,
        why: 'Harvests premium while the trend does the work; caps upside, so avoid right after a fresh breakout.',
      });
    }
    if (highVol) {
      out.push({
        name: 'Cash-secured put / bull put spread',
        fit: 'Want to add exposure into an uptrend while volatility is rich',
        setup: `Sell a 30–45 DTE put ~0.25–0.30 delta (strike near ${money(price * 0.94)}), or define risk with a spread 5–10% wide below it.`,
        why: 'Gets paid to buy the pullback. Assignment is acceptable because the weekly trend is up.',
      });
    } else {
      out.push({
        name: 'Bull call spread',
        fit: 'Bullish continuation with cheap volatility',
        setup: `Buy a 60–90 DTE call near the money (~${money(price)}), sell one ~10% higher (~${money(price * 1.1)}).`,
        why: 'Defined-risk upside participation; debit stays modest while HV is low.',
      });
      if (score >= 55) {
        out.push({
          name: 'Long call (LEAPS-style)',
          fit: 'Strong, confirmed uptrend and low volatility',
          setup: `Buy a 6–12 month call, 0.70–0.80 delta (strike ~${money(price * 0.9)}). Risk only the premium; size ≤ the risk of a stock position.`,
          why: 'Stock-replacement with less capital; low HV keeps the time premium reasonable.',
        });
      }
    }
  } else if (score > -25) {
    if (lots >= 1) {
      out.push({
        name: 'Collar',
        fit: 'Holding through a mixed/undecided trend',
        setup: `Per 100 shares: buy a ~0.25 delta put (near ${money(price * 0.93)}), finance it by selling a ~0.25 delta call (near ${money(price * 1.07)}), 45–60 DTE.`,
        why: 'Brackets the position at low/zero cost while the weekly trend resolves.',
      });
    }
    if (highVol) {
      out.push({
        name: 'Iron condor (neutral premium sale)',
        fit: 'Range-bound tape with rich volatility',
        setup: `Sell a 30–45 DTE ~0.20 delta call spread and put spread around the range (short strikes near ${money(price * 1.07)} / ${money(price * 0.93)}).`,
        why: 'Monetizes chop; defined risk on both sides. Exit if the weekly trend picks a direction.',
      });
    } else {
      out.push({
        name: 'Stand aside / small starter only',
        fit: 'No trend edge and no volatility edge',
        setup: 'No options position. Keep the symbol on watch for a weekly MA reclaim or breakdown.',
        why: 'Trend traders make money in trends; a mixed weekly tape is where premium and patience get burned.',
      });
    }
  } else {
    if (lots >= 1) {
      out.push({
        name: 'Protective put',
        fit: 'Still holding shares in a downtrend',
        setup: `Buy 1 put per 100 shares, 60–90 DTE, strike near ${money(risk?.suggestedStop ?? price * 0.92)}.`,
        why: 'Hard floor under the position while you scale out; cheaper to be early than late.',
      });
    }
    if (highVol) {
      out.push({
        name: 'Bear call spread',
        fit: 'Downtrend with rich volatility',
        setup: `Sell a 30–45 DTE ~0.25 delta call (near ${money(price * 1.06)}), buy one 5–10% higher for protection.`,
        why: 'Gets paid while overhead supply caps rallies; defined risk if the trend flips.',
      });
    } else {
      out.push({
        name: 'Long put / bear put spread',
        fit: 'Confirmed downtrend and volatility still cheap',
        setup: `Buy a 60–90 DTE put near the money, optionally sell one ~10% lower (near ${money(price * 0.9)}) to cut the debit.`,
        why: 'Direct downside participation with defined risk while HV is low.',
      });
    }
  }

  return { strategies: out, volNote };
}

function money(v) {
  return '$' + v.toFixed(v >= 1000 ? 0 : 2);
}

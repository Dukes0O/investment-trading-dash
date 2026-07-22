// Strategy presets for the backtest lab. Each returns the contract expected
// by scripts/lib/backtest.mjs. All are long/flat, signal-on-close,
// execute-next-open. Three distinct trend-trading styles:
//
//   trend-30w   — classic stage-analysis trend following (the style the live
//                 rule engine encodes): own the weekly uptrend, exit when the
//                 30-week MA is lost. Few trades, wide give-back.
//   donchian-20 — turtle-style breakout: buy 20-day highs in a long-term
//                 uptrend, exit on a 10-day low. More trades, catches runners.
//   pullback    — cyclical-retracement entries: wait for the uptrend to dip
//                 (RSI washout) and turn back up, ride with a chandelier
//                 stop. Buys weakness instead of strength.

import { sma, rsi, atr, donchian, toWeekly } from '../../dashboard/indicators.js';

export const STRATEGIES = [
  {
    id: 'trend-30w',
    name: '30-week trend following',
    style: 'Own the weekly uptrend; exit when the 30-week MA is lost',
    warmup: 210,
    prepare(bars) {
      // Weekly values mapped onto daily bars, using only COMPLETED weeks.
      // A week is exposed from its FINAL session's close onward: the Friday
      // row sees its own completed week (decide at Friday close, fill at
      // Monday open); mid-week rows see the prior completed week. The
      // current week's partial bar never leaks into a mid-week daily signal.
      const closes = bars.map((b) => b.close);
      const weekly = toWeekly(bars);
      const wCloses = weekly.map((w) => w.close);
      const wSma10 = sma(wCloses, 10);
      const wSma30 = sma(wCloses, 30);
      const wClose = new Array(bars.length).fill(null);
      const w10 = new Array(bars.length).fill(null);
      const w30 = new Array(bars.length).fill(null);
      let wi = 0;
      for (let i = 0; i < bars.length; i++) {
        // advance to the last weekly bar that ENDS on or before this daily bar
        while (wi < weekly.length - 1 && weekly[wi + 1].date <= bars[i].date) wi++;
        if (weekly[wi].date <= bars[i].date) {
          wClose[i] = wCloses[wi];
          w10[i] = wSma10[wi];
          w30[i] = wSma30[wi];
        }
      }
      return { wClose, w10, w30, atr: atr(bars, 14), closes };
    },
    entry(i, ctx) {
      return ctx.wClose[i] != null && ctx.w30[i] != null && ctx.w10[i] != null &&
        ctx.wClose[i] > ctx.w30[i] && ctx.w10[i] > ctx.w30[i];
    },
    exit(i, ctx) {
      return ctx.wClose[i] != null && ctx.w30[i] != null && ctx.wClose[i] < ctx.w30[i];
    },
  },
  {
    id: 'donchian-20',
    name: 'Donchian 20-day breakout',
    style: 'Buy 20-day highs above the 200-day MA; exit on a 10-day low',
    warmup: 210,
    prepare(bars) {
      const closes = bars.map((b) => b.close);
      const don20 = donchian(bars, 20);
      const don10 = donchian(bars, 10);
      return {
        sma200: sma(closes, 200),
        upper20: don20.upper,
        lower10: don10.lower,
        atr: atr(bars, 14),
        closes,
      };
    },
    entry(i, ctx) {
      return ctx.upper20[i] != null && ctx.sma200[i] != null &&
        ctx.closes[i] > ctx.upper20[i] && ctx.closes[i] > ctx.sma200[i];
    },
    exit(i, ctx) {
      return ctx.lower10[i] != null && ctx.closes[i] < ctx.lower10[i];
    },
  },
  {
    id: 'pullback',
    name: 'Pullback / retracement',
    style: 'Buy the dip-and-turn inside an uptrend; chandelier-stop the ride',
    warmup: 210,
    trailStop: { atrMult: 2.5 },
    prepare(bars) {
      const closes = bars.map((b) => b.close);
      return {
        sma50: sma(closes, 50),
        sma200: sma(closes, 200),
        rsi14: rsi(closes, 14),
        atr: atr(bars, 14),
        closes,
      };
    },
    entry(i, ctx) {
      if (i < 3) return false;
      const uptrend = ctx.sma50[i] != null && ctx.sma200[i] != null &&
        ctx.sma50[i] > ctx.sma200[i] && ctx.closes[i] > ctx.sma200[i];
      if (!uptrend) return false;
      // Washout within the last 3 bars, and RSI has turned back above 40.
      const washedOut = [1, 2, 3].some((k) => ctx.rsi14[i - k] != null && ctx.rsi14[i - k] < 40);
      return washedOut && ctx.rsi14[i] != null && ctx.rsi14[i] >= 40 && ctx.closes[i] > ctx.closes[i - 1];
    },
    exit(i, ctx) {
      // Structural exit only; the chandelier stop handles the give-back.
      return ctx.sma200[i] != null && ctx.closes[i] < ctx.sma200[i];
    },
  },
];

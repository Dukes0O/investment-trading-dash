// Technical-analysis math. All functions take arrays of bars
// ({ date, open, high, low, close, volume }) or plain number arrays and
// return arrays aligned to the input (null where the indicator is not yet defined).

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      prev = sum / period;
      out[i] = prev;
    } else if (i >= period) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

// Wilder's RSI
export function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i === period) {
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }
  return out;
}

export function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const line = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null
  );
  // Signal: EMA of the MACD line over its defined region.
  const defined = [];
  const firstIdx = line.findIndex((v) => v != null);
  for (let i = firstIdx; i < line.length; i++) defined.push(line[i]);
  const sigDefined = firstIdx === -1 ? [] : ema(defined, signalPeriod);
  const signal = new Array(closes.length).fill(null);
  for (let i = 0; i < sigDefined.length; i++) {
    if (sigDefined[i] != null) signal[firstIdx + i] = sigDefined[i];
  }
  const histogram = line.map((v, i) =>
    v != null && signal[i] != null ? v - signal[i] : null
  );
  return { line, signal, histogram };
}

export function bollinger(closes, period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j] - mid[i];
      sumSq += d * d;
    }
    const sd = Math.sqrt(sumSq / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}

// Wilder's ATR
export function atr(bars, period = 14) {
  const out = new Array(bars.length).fill(null);
  let prev = null;
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    if (i <= period) {
      prev = (prev ?? 0) + tr / period;
      if (i === period) out[i] = prev;
    } else {
      prev = (prev * (period - 1) + tr) / period;
      out[i] = prev;
    }
  }
  return out;
}

// Annualized historical volatility (close-to-close), in percent.
export function historicalVolatility(closes, period = 20, periodsPerYear = 252) {
  const out = new Array(closes.length).fill(null);
  const rets = closes.map((c, i) => (i === 0 ? null : Math.log(c / closes[i - 1])));
  for (let i = period; i < closes.length; i++) {
    let mean = 0;
    for (let j = i - period + 1; j <= i; j++) mean += rets[j];
    mean /= period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (rets[j] - mean) ** 2;
    variance /= period - 1;
    out[i] = Math.sqrt(variance * periodsPerYear) * 100;
  }
  return out;
}

// Percentile rank of the last value within the trailing window (0–100).
export function percentileRank(values, window = 252) {
  const defined = values.filter((v) => v != null);
  if (defined.length < 2) return null;
  const slice = defined.slice(-window);
  const last = slice[slice.length - 1];
  const below = slice.filter((v) => v <= last).length;
  return (below / slice.length) * 100;
}

// Highest high / lowest low over the trailing `period`, excluding the current bar.
export function donchian(bars, period = 20) {
  const upper = new Array(bars.length).fill(null);
  const lower = new Array(bars.length).fill(null);
  for (let i = period; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period; j < i; j++) {
      hi = Math.max(hi, bars[j].high);
      lo = Math.min(lo, bars[j].low);
    }
    upper[i] = hi;
    lower[i] = lo;
  }
  return { upper, lower };
}

// Resample daily bars into calendar-week (Mon–Fri) bars. The last, possibly
// partial, week is included — callers that need completed weeks only can drop it.
export function toWeekly(dailyBars) {
  const weeks = [];
  let current = null;
  let currentKey = null;
  for (const bar of dailyBars) {
    const d = new Date(bar.date + 'T00:00:00Z');
    // ISO week key: year + week number (Monday-start).
    const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - day);
    const key = monday.toISOString().slice(0, 10);
    if (key !== currentKey) {
      if (current) weeks.push(current);
      currentKey = key;
      current = { date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume ?? 0 };
    } else {
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
      current.close = bar.close;
      current.volume += bar.volume ?? 0;
      current.date = bar.date; // week bar dated by its last session
    }
  }
  if (current) weeks.push(current);
  return weeks;
}

// 52-week high/low from daily bars.
export function yearRange(dailyBars) {
  const slice = dailyBars.slice(-252);
  if (!slice.length) return { high: null, low: null };
  let high = -Infinity;
  let low = Infinity;
  for (const b of slice) {
    high = Math.max(high, b.high);
    low = Math.min(low, b.low);
  }
  return { high, low };
}

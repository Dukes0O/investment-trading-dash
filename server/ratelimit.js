// Rolling-window rate limiter for outbound provider calls.
//
// The free provider tiers cap requests per minute (Twelve Data: 8 credits/min,
// Alpha Vantage: 5/min). A portfolio refresh fetches a dozen symbols at once —
// the client's getMarkets and the server's /summary both fan out with
// Promise.all — so without pacing every call fires in one burst and the
// provider answers HTTP 429 for all of them.
//
// Funnelling provider fetches through acquire() spaces them into waves: the
// first `limit` calls in a window go out immediately, and the rest wait until
// the oldest call ages out of the window. `now`/`sleep` are injectable so the
// pacing can be unit-tested without real timers.

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createRateLimiter({ limit, windowMs, now = Date.now, sleep = realSleep } = {}) {
  if (!(limit > 0)) throw new Error('rate limiter needs a positive limit');
  if (!(windowMs > 0)) throw new Error('rate limiter needs a positive windowMs');

  const hits = []; // acquire timestamps still inside the window, oldest first
  let tail = Promise.resolve(); // serializes acquire() so callers queue FIFO

  async function reserve() {
    for (;;) {
      const t = now();
      while (hits.length && t - hits[0] >= windowMs) hits.shift();
      if (hits.length < limit) {
        hits.push(t);
        return;
      }
      // Wait until the oldest call leaves the window (+1ms so it has aged out).
      await sleep(windowMs - (t - hits[0]) + 1);
    }
  }

  // Chain each caller onto the previous one so concurrent callers don't all read
  // the same `hits` snapshot and overshoot the limit. The chain swallows errors
  // (reserve never throws) so one caller can't wedge the queue.
  function acquire() {
    const next = tail.then(reserve);
    tail = next.catch(() => {});
    return next;
  }

  return { acquire };
}

function envInt(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

// Free-tier caps by default; set TWELVEDATA_RPM / ALPHAVANTAGE_RPM to raise them
// on a paid plan.
export const twelveDataLimiter = createRateLimiter({
  limit: envInt('TWELVEDATA_RPM', 8),
  windowMs: 60_000,
});

export const alphaVantageLimiter = createRateLimiter({
  limit: envInt('ALPHAVANTAGE_RPM', 5),
  windowMs: 60_000,
});

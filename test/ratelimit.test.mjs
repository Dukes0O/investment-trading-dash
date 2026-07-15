import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../server/ratelimit.js';

// A virtual clock: sleep(ms) advances `clock` and resolves on a microtask, so
// pacing is exercised without real timers.
function fakeClock(start = 0) {
  let clock = start;
  return {
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    advance: (ms) => { clock += ms; },
  };
}

test('the first `limit` calls in a window resolve without waiting', async () => {
  const c = fakeClock();
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: c.now, sleep: c.sleep });

  await limiter.acquire();
  await limiter.acquire();
  await limiter.acquire();

  // Three immediate acquires must not have advanced the clock.
  assert.equal(c.now(), 0);
});

test('the call past the limit waits until the oldest ages out of the window', async () => {
  const c = fakeClock();
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: c.now, sleep: c.sleep });

  await limiter.acquire(); // t=0
  await limiter.acquire(); // t=0
  await limiter.acquire(); // must wait ~60s for the first to leave the window

  // Oldest hit was at t=0; the third caller sleeps windowMs (+1ms margin).
  assert.equal(c.now(), 60_001);
});

test('a burst of concurrent acquires goes out in windowed waves', async () => {
  const c = fakeClock();
  const limiter = createRateLimiter({ limit: 8, windowMs: 60_000, now: c.now, sleep: c.sleep });

  // 20 symbols firing at once (a realistic portfolio + watchlist refresh).
  const order = [];
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      limiter.acquire().then(() => order.push({ i, at: c.now() }))
    )
  );

  const waves = order.map((o) => o.at);
  // First 8 in the opening window, next 8 one window later, final 4 after that.
  assert.equal(waves.filter((t) => t === 0).length, 8);
  assert.equal(waves.filter((t) => t === 60_001).length, 8);
  assert.equal(waves.filter((t) => t === 120_002).length, 4);
});

test('the limiter rejects a non-positive limit', () => {
  assert.throws(() => createRateLimiter({ limit: 0, windowMs: 1000 }), /positive limit/);
  assert.throws(() => createRateLimiter({ limit: 5, windowMs: 0 }), /positive windowMs/);
});

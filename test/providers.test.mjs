import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAlphaVantage, fetchTwelveData, parseAlphaVantageSymbol, parseTwelveDataJson, parseTwelveDataSymbol } from '../server/providers.js';

test('parseAlphaVantageSymbol maps an exchange-qualified TSX symbol', () => {
  assert.equal(parseAlphaVantageSymbol('BMO:TSX'), 'BMO.TRT');
  assert.equal(parseAlphaVantageSymbol('ETH/CAD'), 'ETH/CAD');
});

test('fetchAlphaVantage requests the translated TSX symbol', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      async json() {
        return { 'Time Series (Daily)': { '2026-01-02': {
          '1. open': '1', '2. high': '2', '3. low': '0.5', '4. close': '1.5', '5. volume': '10',
        } } };
      },
    };
  };

  try {
    await fetchAlphaVantage('BMO:TSX', 'secret');
    assert.match(requestedUrl, /symbol=BMO\.TRT/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('parseTwelveDataSymbol separates an exchange-qualified Canadian listing', () => {
  assert.deepEqual(parseTwelveDataSymbol('BMO:TSX'), { symbol: 'BMO', exchange: 'TSX' });
  assert.deepEqual(parseTwelveDataSymbol('ETH/CAD'), { symbol: 'ETH/CAD', exchange: null });
});

test('parseTwelveDataJson returns sorted numeric OHLCV bars', () => {
  const bars = parseTwelveDataJson({
    values: [
      { datetime: '2026-01-02', open: '101', high: '105', low: '99', close: '103', volume: '1200' },
      { datetime: '2026-01-01', open: '98', high: '102', low: '97', close: '100', volume: '900' },
      { datetime: 'not-a-date', open: '1', high: '1', low: '1', close: '1', volume: '1' },
    ],
  }, 'AAPL');

  assert.deepEqual(bars, [
    { date: '2026-01-01', open: 98, high: 102, low: 97, close: 100, volume: 900 },
    { date: '2026-01-02', open: 101, high: 105, low: 99, close: 103, volume: 1200 },
  ]);
});

test('parseTwelveDataJson surfaces provider errors and malformed responses', () => {
  assert.throws(
    () => parseTwelveDataJson({ status: 'error', message: 'invalid api key' }, 'AAPL'),
    /Twelve Data: invalid api key/
  );
  assert.throws(
    () => parseTwelveDataJson({ values: [] }, 'AAPL'),
    /Twelve Data: no parseable rows for AAPL/
  );
  assert.throws(
    () => parseTwelveDataJson({}, 'AAPL'),
    /Twelve Data: unexpected response shape for AAPL/
  );
});

test('fetchTwelveData requests the deep-history response size', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      async json() {
        return { values: [{ datetime: '2026-01-02', open: '1', high: '2', low: '0.5', close: '1.5', volume: '10' }] };
      },
    };
  };

  try {
    const bars = await fetchTwelveData('AAPL', 'secret');
    assert.match(requestedUrl, /api\.twelvedata\.com\/time_series/);
    assert.match(requestedUrl, /interval=1day/);
    assert.match(requestedUrl, /outputsize=5000/);
    assert.match(requestedUrl, /symbol=AAPL/);
    assert.match(requestedUrl, /apikey=secret/);
    assert.equal(bars.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchTwelveData sends an explicit exchange for qualified symbols', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      async json() {
        return { values: [{ datetime: '2026-01-02', open: '1', high: '2', low: '0.5', close: '1.5', volume: '10' }] };
      },
    };
  };

  try {
    await fetchTwelveData('BMO:TSX', 'secret', { outputsize: 5 });
    assert.match(requestedUrl, /symbol=BMO/);
    assert.match(requestedUrl, /exchange=TSX/);
    assert.doesNotMatch(requestedUrl, /symbol=BMO%3ATSX/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchTwelveData reports invalid JSON responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      throw new SyntaxError('not json');
    },
  });

  try {
    await assert.rejects(fetchTwelveData('AAPL', 'secret'), /invalid JSON response/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchTwelveData preserves useful non-2xx provider messages', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    async json() {
      return { status: 'error', message: 'This symbol requires a higher plan' };
    },
  });

  try {
    await assert.rejects(fetchTwelveData('BMO:TSX', 'secret'), /HTTP 404: This symbol requires a higher plan/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROVIDER, getDailyBars, normalizeProvider } from '../server/marketdata.js';

test('Twelve Data is the default provider and replaces the old Stooq alias', () => {
  assert.equal(DEFAULT_PROVIDER, 'twelvedata');
  assert.equal(normalizeProvider(), 'twelvedata');
  assert.equal(normalizeProvider('stooq'), 'twelvedata');
  assert.equal(normalizeProvider('alphavantage'), 'alphavantage');
});

test('old Stooq selections fail transparently through the Twelve Data path', async () => {
  const result = await getDailyBars('AAPL', { provider: 'stooq' });
  assert.equal(result.source, 'demo (fallback)');
  assert.match(result.error, /No Twelve Data API key set/);
});

test('Twelve Data falls back to Alpha Vantage for TSX symbols when configured', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes('twelvedata.com')) {
      return {
        ok: false,
        status: 404,
        async json() { return { status: 'error', message: 'TSX requires a higher plan' }; },
      };
    }
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
    const result = await getDailyBars('BMO:TSX', {
      provider: 'twelvedata',
      keys: { twelveDataKey: 'twelve', alphaVantageKey: 'alpha' },
    });
    assert.equal(result.source, 'alphavantage (TSX fallback)');
    assert.equal(result.bars.length, 1);
    assert.equal(urls.length, 2);
    assert.match(urls[1], /symbol=BMO\.TRT/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

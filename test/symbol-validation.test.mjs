import test from 'node:test';
import assert from 'node:assert/strict';

const SYMBOL_RE = /^(?=.{1,20}$)[A-Z0-9.\-]+(?::[A-Z0-9.\-]+)?(?:\/[A-Z0-9.\-]+)?$/;

test('symbol validation accepts stocks and Twelve Data crypto pairs', () => {
  for (const symbol of ['AAPL', 'BRK.B', 'BMO:TSX', 'ETH/USD', 'BTC/USD']) assert.match(symbol, SYMBOL_RE);
});

test('symbol validation rejects malformed or multi-slash pairs', () => {
  for (const symbol of ['', 'eth/usd', 'ETH/USD/JPY', 'ETH USD', 'AAPL!', 'A'.repeat(21)]) {
    assert.doesNotMatch(symbol, SYMBOL_RE);
  }
});

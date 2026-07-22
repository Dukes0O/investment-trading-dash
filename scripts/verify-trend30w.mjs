#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { simulate } from './lib/backtest.mjs';
import { STRATEGIES } from './lib/strategies.mjs';

const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/verify-trend30w.mjs <bars.json>');
const bars = JSON.parse(readFileSync(path, 'utf8'));
const strategy = STRATEGIES.find((item) => item.id === 'trend-30w');
const result = simulate(bars, strategy);
if (!result) throw new Error('Not enough bars for trend-30w parity verification');
process.stdout.write(JSON.stringify({ metrics: result.metrics, trades: result.trades.map(({ bars: _bars, ...trade }) => trade) }));

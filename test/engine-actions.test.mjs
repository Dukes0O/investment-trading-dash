import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEngineActions } from '../scripts/lib/engine-actions.mjs';

function validDocument() {
  return {
    schemaVersion: 2,
    kind: 'trendlab-weekly-actions',
    reportDate: '2026-07-22',
    requiresHumanApproval: true,
    actions: [{
      symbol: 'GLD', held: false, signalIntent: 'BUY', action: 'BUY',
      quantity: 8, activeStop: null, proposedStop: 285,
    }],
  };
}

test('engine actions contract accepts protected human-approved BUY actions', () => {
  assert.deepEqual(validateEngineActions(validDocument(), { reportDate: '2026-07-22' }), { ok: true, errors: [] });
});

test('engine actions contract rejects unprotected or automated actions', () => {
  const document = validDocument();
  document.requiresHumanApproval = false;
  document.actions[0].proposedStop = null;
  const result = validateEngineActions(document, { reportDate: '2026-07-22' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /requiresHumanApproval/);
  assert.match(result.errors.join(' '), /proposedStop/);
});

test('engine actions v2 accepts a heat-capped DEFER without calling it bearish', () => {
  const document = validDocument();
  document.actions[0] = {
    symbol: 'SPY', held: false, signalIntent: 'BUY', action: 'DEFER',
    quantity: 0, activeStop: null, proposedStop: 570,
  };
  assert.deepEqual(validateEngineActions(document), { ok: true, errors: [] });
});

test('engine actions validator remains backward compatible with schema v1 evidence', () => {
  const document = validDocument();
  document.schemaVersion = 1;
  document.actions[0] = { symbol: 'GLD', action: 'BUY', quantity: 8, protectiveStop: 285 };
  assert.deepEqual(validateEngineActions(document), { ok: true, errors: [] });
});

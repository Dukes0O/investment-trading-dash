import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEngineActions } from '../scripts/lib/engine-actions.mjs';

function validDocument() {
  return {
    schemaVersion: 1,
    kind: 'trendlab-weekly-actions',
    reportDate: '2026-07-22',
    requiresHumanApproval: true,
    actions: [{ symbol: 'GLD', action: 'BUY', quantity: 8, protectiveStop: 285 }],
  };
}

test('engine actions contract accepts protected human-approved BUY actions', () => {
  assert.deepEqual(validateEngineActions(validDocument(), { reportDate: '2026-07-22' }), { ok: true, errors: [] });
});

test('engine actions contract rejects unprotected or automated actions', () => {
  const document = validDocument();
  document.requiresHumanApproval = false;
  document.actions[0].protectiveStop = null;
  const result = validateEngineActions(document, { reportDate: '2026-07-22' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /requiresHumanApproval/);
  assert.match(result.errors.join(' '), /protectiveStop/);
});

import { existsSync, readFileSync } from 'node:fs';

const LEGACY_ACTIONS = new Set(['BUY', 'HOLD', 'EXIT', 'AVOID']);
const ACTIONS = new Set([...LEGACY_ACTIONS, 'DEFER']);
const SIGNAL_INTENTS = new Set(['BUY', 'HOLD', 'EXIT', 'AVOID']);

export function validateEngineActions(document, { reportDate } = {}) {
  const errors = [];
  if (!document || typeof document !== 'object') errors.push('document must be an object');
  const schemaVersion = document?.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== 2) errors.push('schemaVersion must be 1 or 2');
  if (document?.kind !== 'trendlab-weekly-actions') errors.push('kind must be trendlab-weekly-actions');
  if (reportDate && document?.reportDate !== reportDate) errors.push(`reportDate must be ${reportDate}`);
  if (document?.requiresHumanApproval !== true) errors.push('requiresHumanApproval must be true');
  if (!Array.isArray(document?.actions) || document.actions.length === 0) {
    errors.push('actions must be a non-empty array');
  } else {
    document.actions.forEach((action, index) => {
      if (!action.symbol) errors.push(`actions[${index}].symbol is required`);
      const allowed = schemaVersion === 1 ? LEGACY_ACTIONS : ACTIONS;
      if (!allowed.has(action.action)) errors.push(`actions[${index}].action is invalid`);
      if (schemaVersion === 1) {
        if (action.action === 'BUY' && (!(action.quantity > 0) || !(action.protectiveStop > 0))) {
          errors.push(`actions[${index}] BUY requires positive quantity and protectiveStop`);
        }
        return;
      }
      if (!SIGNAL_INTENTS.has(action.signalIntent)) errors.push(`actions[${index}].signalIntent is invalid`);
      if (!(action.proposedStop > 0)) errors.push(`actions[${index}].proposedStop must be positive`);
      if (action.held === true && !(action.activeStop > 0)) {
        errors.push(`actions[${index}] held position requires positive activeStop`);
      }
      if (action.action === 'BUY' && (!(action.quantity > 0) || action.signalIntent !== 'BUY')) {
        errors.push(`actions[${index}] BUY requires positive quantity and BUY signalIntent`);
      }
      if (action.action === 'DEFER' && (action.quantity !== 0 || action.signalIntent !== 'BUY')) {
        errors.push(`actions[${index}] DEFER requires zero quantity and BUY signalIntent`);
      }
    });
  }
  return { ok: errors.length === 0, errors };
}

export function loadEngineActions(path, { reportDate } = {}) {
  if (!existsSync(path)) return null;
  const document = JSON.parse(readFileSync(path, 'utf8'));
  const validation = validateEngineActions(document, { reportDate });
  if (!validation.ok) throw new Error(`Invalid TrendLab engine actions contract: ${validation.errors.join('; ')}`);
  return document;
}

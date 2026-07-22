import { existsSync, readFileSync } from 'node:fs';

const ACTIONS = new Set(['BUY', 'HOLD', 'EXIT', 'AVOID']);

export function validateEngineActions(document, { reportDate } = {}) {
  const errors = [];
  if (!document || typeof document !== 'object') errors.push('document must be an object');
  if (document?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (document?.kind !== 'trendlab-weekly-actions') errors.push('kind must be trendlab-weekly-actions');
  if (reportDate && document?.reportDate !== reportDate) errors.push(`reportDate must be ${reportDate}`);
  if (document?.requiresHumanApproval !== true) errors.push('requiresHumanApproval must be true');
  if (!Array.isArray(document?.actions) || document.actions.length === 0) {
    errors.push('actions must be a non-empty array');
  } else {
    document.actions.forEach((action, index) => {
      if (!action.symbol) errors.push(`actions[${index}].symbol is required`);
      if (!ACTIONS.has(action.action)) errors.push(`actions[${index}].action is invalid`);
      if (action.action === 'BUY' && (!(action.quantity > 0) || !(action.protectiveStop > 0))) {
        errors.push(`actions[${index}] BUY requires positive quantity and protectiveStop`);
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

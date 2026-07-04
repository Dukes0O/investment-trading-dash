// Weekly report contract validator (hand-rolled — the shape is small and the
// error messages matter more than JSON-Schema generality). The authoritative
// human-readable spec lives in data/reports/SCHEMA.md.

const LLM_VERDICTS = ['add', 'hold', 'trim', 'exit', 'buy', 'avoid'];
const CONFIDENCES = ['high', 'medium', 'low'];
const PLAN_ACTIONS = ['hold', 'add', 'trim', 'exit'];
const STANCES = ['risk-on', 'neutral', 'defensive'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateReport(report, { heldSymbols = [] } = {}) {
  const errors = [];
  const warnings = [];
  const err = (msg) => errors.push(msg);

  if (typeof report !== 'object' || report === null) {
    return { ok: false, errors: ['Report must be a JSON object'], warnings };
  }
  if (report.schemaVersion !== 1) err('schemaVersion must be 1');
  if (!DATE_RE.test(report.reportDate ?? '')) err('reportDate must be YYYY-MM-DD');
  if (!report.generatedAt) err('generatedAt is required (ISO timestamp)');
  if (!DATE_RE.test(report.dossierDate ?? '')) err('dossierDate must be YYYY-MM-DD');

  const p = report.portfolio;
  if (!p || typeof p !== 'object') {
    err('portfolio object is required');
  } else {
    if (!STANCES.includes(p.stance)) err(`portfolio.stance must be one of ${STANCES.join('|')}`);
    if (typeof p.summary !== 'string' || p.summary.length < 40) err('portfolio.summary must be a substantive markdown string');
    if (!Array.isArray(p.keyEvents)) err('portfolio.keyEvents must be an array (may be empty)');
  }

  if (!Array.isArray(report.symbols) || report.symbols.length < 1) {
    err('symbols must be a non-empty array');
  } else {
    report.symbols.forEach((s, i) => {
      const at = `symbols[${i}]${s?.symbol ? ` (${s.symbol})` : ''}`;
      if (!s.symbol || typeof s.symbol !== 'string') err(`${at}: symbol is required`);
      if (!s.ruleSignal || typeof s.ruleSignal.action !== 'string' || typeof s.ruleSignal.score !== 'number') {
        err(`${at}: ruleSignal {action, score} is required (copy from the dossier)`);
      }
      if (!LLM_VERDICTS.includes(s.llmVerdict)) err(`${at}: llmVerdict must be one of ${LLM_VERDICTS.join('|')}`);
      if (typeof s.agreesWithRule !== 'boolean') err(`${at}: agreesWithRule must be a boolean`);
      if (!CONFIDENCES.includes(s.confidence)) err(`${at}: confidence must be one of ${CONFIDENCES.join('|')}`);
      if (typeof s.narrative !== 'string' || s.narrative.length < 80) err(`${at}: narrative must be a substantive markdown string`);
      if (!Array.isArray(s.news)) {
        err(`${at}: news must be an array (may be empty if nothing relevant was found)`);
      } else {
        s.news.forEach((n, j) => {
          if (!n.title) err(`${at}.news[${j}]: title required`);
          if (!/^https?:\/\//.test(n.url ?? '')) err(`${at}.news[${j}]: url must be http(s) — never invent links`);
          if (!n.takeaway) err(`${at}.news[${j}]: takeaway required`);
        });
      }
      if (!Array.isArray(s.risks) || s.risks.length < 1) err(`${at}: risks must be a non-empty array`);
      const tp = s.tradePlan;
      if (!tp || typeof tp !== 'object') {
        err(`${at}: tradePlan is required`);
      } else {
        if (!PLAN_ACTIONS.includes(tp.action)) err(`${at}.tradePlan.action must be one of ${PLAN_ACTIONS.join('|')}`);
        if (tp.entryZone != null && (typeof tp.entryZone.low !== 'number' || typeof tp.entryZone.high !== 'number')) {
          err(`${at}.tradePlan.entryZone must be {low, high} numbers or null`);
        }
        if (tp.stop != null && typeof tp.stop !== 'number') err(`${at}.tradePlan.stop must be a number or null`);
        if (typeof tp.sizeNote !== 'string' || !tp.sizeNote) err(`${at}.tradePlan.sizeNote is required`);
        if (tp.optionsPlay != null && (!tp.optionsPlay.name || !tp.optionsPlay.setup || !tp.optionsPlay.rationale)) {
          err(`${at}.tradePlan.optionsPlay must have name, setup, rationale (or be null)`);
        }
      }
    });

    const covered = new Set(report.symbols.map((s) => s.symbol));
    for (const h of heldSymbols) {
      if (!covered.has(h)) warnings.push(`Held symbol ${h} is not covered by the report`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function indexEntry(report) {
  return {
    date: report.reportDate,
    generatedAt: report.generatedAt,
    stance: report.portfolio?.stance,
    symbolCount: report.symbols?.length ?? 0,
    symbols: (report.symbols ?? []).map((s) => ({
      symbol: s.symbol,
      llmVerdict: s.llmVerdict,
      agreesWithRule: s.agreesWithRule,
      ruleAction: s.ruleSignal?.action,
      ruleScore: s.ruleSignal?.score,
    })),
  };
}

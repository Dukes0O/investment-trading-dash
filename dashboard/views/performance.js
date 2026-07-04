// Performance view: how past calls aged. Reads the committed
// data/outcomes.json (written by scripts/evaluate-outcomes.mjs, normally as
// part of the /weekly-report run) — works identically with or without the
// backend since the file is static either way.

import { el, clear, fmtDate, fmtPct } from '../format.js';

const HORIZON_LABELS = { '1w': '1 week', '4w': '4 weeks', '13w': '13 weeks' };

async function fetchOutcomes() {
  const res = await fetch('/data/outcomes.json');
  if (!res.ok) return null;
  return res.json();
}

export async function renderPerformance(root, navigate) {
  clear(root);
  root.append(el('div', { class: 'view-head' },
    el('h1', {}, 'Performance'),
    el('p', { class: 'view-sub' }, 'How the calls aged: every weekly verdict is scored against subsequent price action (stop-truncated), and rule-engine vs LLM overrides go head-to-head. Recomputed on every /weekly-report run.')
  ));

  const body = el('div', { class: 'loading' }, 'Loading outcomes…');
  root.append(body);

  let data = null;
  try {
    data = await fetchOutcomes();
  } catch { /* handled below */ }
  clear(body);
  body.className = '';

  if (!data || !data.calls?.length) {
    body.className = 'empty-state';
    body.append(
      el('p', {}, 'No scored calls yet.'),
      el('p', { class: 'view-sub' }, 'Run /weekly-report in a Claude Code session — each run records that week\'s calls and re-scores all earlier ones.')
    );
    return;
  }

  if (data.provider?.startsWith('demo')) {
    body.append(el('div', { class: 'notice notice-info' },
      el('strong', {}, 'Demo data. '),
      'Outcomes below were scored against synthetic prices — the mechanics are real, the numbers are illustrative.'
    ));
  }

  const maturedCalls = data.calls.filter((c) => Object.values(c.horizons).some((h) => h.matured));
  const pendingCalls = data.calls.filter((c) => !Object.values(c.horizons).some((h) => h.matured));

  // ---- Scorecard tiles (best available horizon: prefer 4w, else 1w) ----
  const tileHorizon = ['4w', '1w', '13w'].find((h) => (data.summary[h]?.calls ?? 0) > 0);
  if (tileHorizon) {
    const s = data.summary[tileHorizon];
    body.append(el('div', { class: 'tile-row' },
      tile('Calls scored', String(s.calls), `${HORIZON_LABELS[tileHorizon]} horizon`),
      tile('LLM hit rate', s.llm.hitRate != null ? s.llm.hitRate.toFixed(0) + '%' : '—', `${s.llm.right}✓ ${s.llm.wrong}✗ ${s.llm.flat} flat`),
      tile('Rule hit rate', s.rule.hitRate != null ? s.rule.hitRate.toFixed(0) + '%' : '—', `${s.rule.right}✓ ${s.rule.wrong}✗ ${s.rule.flat} flat`),
      tile('Overrides', s.overrides.total ? `${s.overrides.llmWon}–${s.overrides.ruleWon}` : '0',
        s.overrides.total ? `LLM wins–rule wins (${s.overrides.ties} ties)` : 'no disagreements matured'),
    ));
  } else {
    body.append(el('div', { class: 'notice notice-info' },
      el('strong', {}, 'Nothing matured yet. '),
      `${data.calls.length} call${data.calls.length > 1 ? 's' : ''} recorded — the first 1-week scores appear five trading days after their report date. Check back after the next weekly run.`
    ));
  }

  // ---- Matured calls table ----
  if (maturedCalls.length) {
    body.append(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', {}, 'Scored calls')),
      el('div', { class: 'table-scroll' },
        el('table', { class: 'data-table' },
          el('thead', {}, el('tr', {},
            ['Report', 'Symbol', 'LLM verdict', 'Rule', 'Agreement', '1w', '4w', '13w', 'Verdict grade'].map((h, i) =>
              el('th', { class: i >= 5 && i <= 7 ? 'num' : '' }, h))
          )),
          el('tbody', {}, maturedCalls.map((c) => {
            const bestGrade = gradeAt(c, '4w') ?? gradeAt(c, '1w') ?? gradeAt(c, '13w');
            return el('tr', {},
              el('td', {}, fmtDate(c.reportDate)),
              el('td', {}, el('span', { class: 'sym' }, c.symbol)),
              el('td', {}, c.llmVerdict.toUpperCase()),
              el('td', {}, `${c.ruleAction} (${c.ruleScore >= 0 ? '+' : ''}${c.ruleScore})`),
              el('td', {}, el('span', { class: 'agree-tag ' + (c.agreesWithRule ? 'agree-yes' : 'agree-no') }, c.agreesWithRule ? '✓ agreed' : '✗ override')),
              horizonCell(c, '1w'),
              horizonCell(c, '4w'),
              horizonCell(c, '13w'),
              el('td', {}, gradeBadge(bestGrade)),
            );
          }))
        )
      ),
      el('p', { class: 'card-note' }, 'Returns are the LLM call\'s exposure-weighted, stop-truncated forward returns. A stop marker (⛔) means the stop was hit inside that horizon.')
    ));

    // ---- Overrides head-to-head ----
    const overrides = maturedCalls.filter((c) => !c.agreesWithRule);
    if (overrides.length) {
      body.append(el('div', { class: 'card' },
        el('div', { class: 'card-head' }, el('h2', {}, 'Overrides: LLM vs rule engine')),
        el('div', { class: 'table-scroll' },
          el('table', { class: 'data-table' },
            el('thead', {}, el('tr', {},
              ['Report', 'Symbol', 'Rule said', 'LLM said', 'LLM score (4w)', 'Rule score (4w)', 'Winner'].map((h, i) =>
                el('th', { class: i === 4 || i === 5 ? 'num' : '' }, h))
            )),
            el('tbody', {}, overrides.map((c) => {
              const h = c.horizons['4w']?.matured ? c.horizons['4w'] : c.horizons['1w'];
              return el('tr', {},
                el('td', {}, fmtDate(c.reportDate)),
                el('td', {}, el('span', { class: 'sym' }, c.symbol)),
                el('td', {}, c.ruleAction),
                el('td', {}, c.llmVerdict.toUpperCase()),
                el('td', { class: 'num ' + deltaClass(h?.llm.score) }, h?.matured ? fmtPct(h.llm.score) : '—'),
                el('td', { class: 'num ' + deltaClass(h?.rule.score) }, h?.matured ? fmtPct(h.rule.score) : '—'),
                el('td', {}, h?.winner ? winnerBadge(h.winner) : '—'),
              );
            }))
          )
        ),
        el('p', { class: 'card-note' }, 'This is the table that tells you whether the judgment layer is earning its keep — and when to trust the rules instead.')
      ));
    }

    // ---- Reason attribution ----
    if (data.reasonStats?.length) {
      const MIN_N = 8;
      const usable = data.reasonStats.filter((r) => r.n >= MIN_N);
      const pending = data.reasonStats.length - usable.length;
      body.append(el('div', { class: 'card' },
        el('div', { class: 'card-head' }, el('h2', {}, 'Which rule components predict wins')),
        usable.length
          ? el('div', { class: 'table-scroll' },
              el('table', { class: 'data-table' },
                el('thead', {}, el('tr', {},
                  ['Signal component', 'Samples', 'Hit rate (4w)', 'Avg aligned move'].map((h, i) => el('th', { class: i > 0 ? 'num' : '' }, h)))),
                el('tbody', {}, usable.map((r) =>
                  el('tr', {},
                    el('td', {}, r.text),
                    el('td', { class: 'num' }, String(r.n)),
                    el('td', { class: 'num' }, r.hitRate.toFixed(0) + '%'),
                    el('td', { class: 'num ' + deltaClass(r.avgAligned4w) }, fmtPct(r.avgAligned4w)),
                  )))
              ))
          : el('p', { class: 'card-lede' }, `Attribution needs at least ${MIN_N} samples per component; keep running weekly reports to build the evidence base.`),
        pending > 0 && usable.length
          ? el('p', { class: 'card-note' }, `${pending} component(s) hidden — under ${MIN_N} samples.`)
          : null,
        el('p', { class: 'card-note' }, 'When a component\'s hit rate stays poor at a real sample size, that is the evidence for re-weighting it in the rule engine (dashboard/signals.js).')
      ));
    }
  }

  // ---- Pending calls ----
  if (pendingCalls.length) {
    body.append(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', {}, `Pending calls (${pendingCalls.length})`)),
      el('div', { class: 'table-scroll' },
        el('table', { class: 'data-table' },
          el('thead', {}, el('tr', {},
            ['Report', 'Symbol', 'LLM verdict', 'Rule', 'Agreement', 'First score'].map((h) => el('th', {}, h)))),
          el('tbody', {}, pendingCalls.map((c) =>
            el('tr', {},
              el('td', {}, fmtDate(c.reportDate)),
              el('td', {}, el('span', { class: 'sym' }, c.symbol)),
              el('td', {}, c.llmVerdict.toUpperCase()),
              el('td', {}, `${c.ruleAction} (${c.ruleScore >= 0 ? '+' : ''}${c.ruleScore})`),
              el('td', {}, el('span', { class: 'agree-tag ' + (c.agreesWithRule ? 'agree-yes' : 'agree-no') }, c.agreesWithRule ? '✓ agreed' : '✗ override')),
              el('td', {}, '≈ ' + fmtDate(addCalendarDays(c.reportDate, 7))),
            )))
        )
      )
    ));
  }

  body.append(el('p', { class: 'disclaimer' },
    'Scoring model: verdicts map to long exposure (buy/add = 1, hold = 1 if held / 0 if watchlist, trim = 0.5, exit/avoid = 0); forward returns are truncated at the call\'s stop; zero-exposure calls score as avoided losses. ±0.5% dead band. Full spec in scripts/lib/outcomes.mjs.'));
}

function tile(label, value, sub) {
  return el('div', { class: 'stat-tile' },
    el('div', { class: 'stat-label' }, label),
    el('div', { class: 'stat-value' }, value),
    sub ? el('div', { class: 'stat-sub' }, sub) : null
  );
}

function gradeAt(c, h) {
  return c.horizons[h]?.matured ? c.horizons[h].llm.grade : null;
}

function horizonCell(c, h) {
  const d = c.horizons[h];
  if (!d?.matured) return el('td', { class: 'num' }, '—');
  return el('td', { class: 'num ' + deltaClass(d.llm.return) },
    fmtPct(d.llm.return) + (d.llm.stopHit ? ' ⛔' : ''));
}

function gradeBadge(grade) {
  if (!grade) return '—';
  const map = { right: ['good', '✓ right'], wrong: ['critical', '✗ wrong'], flat: ['neutral', '~ flat'] };
  const [tone, label] = map[grade];
  return el('span', { class: 'badge badge-' + tone }, el('span', { class: 'badge-dot', 'aria-hidden': 'true' }), label);
}

function winnerBadge(winner) {
  const map = { llm: ['good', 'LLM'], rule: ['serious', 'Rules'], tie: ['neutral', 'Tie'] };
  const [tone, label] = map[winner] ?? ['neutral', winner];
  return el('span', { class: 'badge badge-' + tone }, el('span', { class: 'badge-dot', 'aria-hidden': 'true' }), label);
}

function deltaClass(v) {
  if (v == null || !isFinite(v)) return '';
  return v >= 0 ? 'delta-up' : 'delta-down';
}

function addCalendarDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Weekly reports view: list of committed weekly reports (API when the backend
// runs, static /data/reports/ files otherwise), the trade-plan table, and
// per-symbol analysis cards with news citations.

import { marked } from 'marked';
import { el, clear, fmtMoney, fmtNum, fmtDate } from '../format.js';
import { isBackend } from '../store.js';
import { apiGet } from '../api.js';

async function fetchIndex() {
  if (isBackend()) {
    try {
      return await apiGet('/reports');
    } catch { /* fall through to static */ }
  }
  const res = await fetch('/data/reports/index.json');
  if (!res.ok) return [];
  return res.json();
}

async function fetchReport(date) {
  if (isBackend()) {
    try {
      return await apiGet('/reports/' + encodeURIComponent(date));
    } catch { /* fall through to static */ }
  }
  const res = await fetch('/data/reports/' + encodeURIComponent(date) + '.json');
  if (!res.ok) throw new Error('Report not found: ' + date);
  return res.json();
}

// Thin exports for other views (journal.js) that need to look up which
// report covered a symbol on a given date without duplicating the
// backend/static fallback logic above.
export { fetchIndex as fetchReportIndex, fetchReport };

// Latest-report lookup used by the analysis view's cross-link card.
export async function latestReportEntry() {
  try {
    const index = await fetchIndex();
    return index.length ? index[0] : null;
  } catch {
    return null;
  }
}

// Full latest report (trade-plan levels included) — used by the Overview
// alerts strip.
export async function latestReport() {
  try {
    const entry = await latestReportEntry();
    return entry ? await fetchReport(entry.date) : null;
  } catch {
    return null;
  }
}

// Markdown rendered from the LLM report. marked escapes/normalizes, but keep
// it defensive: render into a detached node and strip any script/handler.
function md(text) {
  const div = el('div', { class: 'md' });
  div.innerHTML = marked.parse(String(text ?? ''));
  for (const bad of div.querySelectorAll('script, iframe, object, embed')) bad.remove();
  for (const node of div.querySelectorAll('*')) {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || (attr.name === 'href' && /^\s*javascript:/i.test(attr.value))) {
        node.removeAttribute(attr.name);
      }
    }
  }
  return div;
}

function verdictBadge(verdict) {
  const tone = { add: 'good', buy: 'good', hold: 'neutral', trim: 'serious', avoid: 'serious', exit: 'critical' }[verdict] || 'neutral';
  return el('span', { class: 'badge badge-' + tone },
    el('span', { class: 'badge-dot', 'aria-hidden': 'true' }),
    verdict.toUpperCase()
  );
}

function agreementTag(agrees) {
  return el('span', { class: 'agree-tag ' + (agrees ? 'agree-yes' : 'agree-no') },
    agrees ? '✓ agrees with rules' : '✗ overrides rules');
}

export async function renderReports(root, navigate, params) {
  clear(root);
  root.append(el('div', { class: 'view-head' },
    el('h1', {}, 'Weekly reports'),
    el('p', { class: 'view-sub' }, 'LLM-written portfolio analysis: the rule engine computes the technicals, the weekly Claude session researches the news and issues the final calls. Generate one with the /weekly-report skill in a Claude Code session.')
  ));

  const body = el('div', { class: 'loading' }, 'Loading reports…');
  root.append(body);

  let index;
  try {
    index = await fetchIndex();
  } catch (err) {
    index = [];
  }
  clear(body);
  body.className = '';

  if (!index.length) {
    body.className = 'empty-state';
    body.append(
      el('p', {}, 'No weekly reports yet.'),
      el('p', { class: 'view-sub' }, 'Run the /weekly-report skill in a Claude Code session on this repo — it builds the technicals dossier, researches your holdings, and commits the report here.')
    );
    return;
  }

  const selectedDate = params.date && index.some((e) => e.date === params.date) ? params.date : index[0].date;

  // Report picker — one row above the content it scopes.
  body.append(el('div', { class: 'report-picker' },
    el('span', { class: 'field-label' }, 'Report week'),
    el('div', { class: 'seg' },
      index.slice(0, 8).map((e) =>
        el('button', {
          class: 'seg-btn' + (e.date === selectedDate ? ' seg-active' : ''),
          onclick: () => navigate('reports', { date: e.date }),
        }, fmtDate(e.date))
      )
    )
  ));

  const pane = el('div', { class: 'loading' }, 'Loading report…');
  body.append(pane);

  let report;
  try {
    report = await fetchReport(selectedDate);
  } catch (err) {
    clear(pane);
    pane.className = 'empty-state';
    pane.append(el('p', {}, err.message));
    return;
  }
  clear(pane);
  pane.className = '';

  // ---- Portfolio brief ----
  const stanceTone = { 'risk-on': 'good', neutral: 'neutral', defensive: 'serious' }[report.portfolio.stance] || 'neutral';
  pane.append(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', {}, 'Portfolio brief — ' + fmtDate(report.reportDate)),
      el('span', { class: 'badge badge-' + stanceTone },
        el('span', { class: 'badge-dot', 'aria-hidden': 'true' }),
        report.portfolio.stance.toUpperCase())
    ),
    md(report.portfolio.summary),
    report.portfolio.keyEvents?.length
      ? el('div', { class: 'notes' },
          el('h3', {}, 'Key events this week'),
          el('ul', {}, report.portfolio.keyEvents.map((e) => el('li', {}, e))))
      : null
  ));

  // ---- Trade plan table ----
  pane.append(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h2', {}, 'Trade plan')),
    el('div', { class: 'table-scroll' },
      el('table', { class: 'data-table' },
        el('thead', {}, el('tr', {},
          ['Symbol', 'Rule signal', 'LLM verdict', 'Agreement', 'Action', 'Entry zone', 'Stop', 'Size note'].map((h) => el('th', {}, h))
        )),
        el('tbody', {}, report.symbols.map((s) =>
          el('tr', {},
            el('td', {}, el('span', { class: 'sym' }, s.symbol)),
            el('td', {}, `${s.ruleSignal.action} (${s.ruleSignal.score >= 0 ? '+' : ''}${s.ruleSignal.score})`),
            el('td', {}, verdictBadge(s.llmVerdict)),
            el('td', {}, agreementTag(s.agreesWithRule)),
            el('td', {}, s.tradePlan.action),
            el('td', { class: 'num' }, s.tradePlan.entryZone ? fmtNum(s.tradePlan.entryZone.low) + ' – ' + fmtNum(s.tradePlan.entryZone.high) : '—'),
            el('td', { class: 'num' }, s.tradePlan.stop != null ? fmtNum(s.tradePlan.stop) : '—'),
            el('td', { class: 'notes-cell' }, s.tradePlan.sizeNote),
          )
        ))
      )
    )
  ));

  // ---- Per-symbol cards ----
  for (const s of report.symbols) {
    pane.append(el('div', { class: 'card' },
      el('div', { class: 'card-head' },
        el('h2', {},
          el('a', { href: '#analysis?symbol=' + encodeURIComponent(s.symbol), class: 'sym sym-link' }, s.symbol),
          ' — ', verdictBadge(s.llmVerdict), ' ', agreementTag(s.agreesWithRule)
        ),
        el('span', { class: 'stat-sub' }, 'confidence: ' + s.confidence)
      ),
      md(s.narrative),
      s.news?.length
        ? el('div', { class: 'notes' },
            el('h3', {}, 'Sources'),
            el('ul', { class: 'news-list' }, s.news.map((n) =>
              el('li', {},
                el('a', { href: n.url, target: '_blank', rel: 'noopener noreferrer' }, n.title),
                el('span', { class: 'news-meta' }, ` — ${n.source || 'source'}${n.date ? ', ' + n.date : ''}. `),
                n.takeaway
              ))))
        : null,
      s.risks?.length
        ? el('div', { class: 'notes' },
            el('h3', {}, 'Risks'),
            el('ul', {}, s.risks.map((r) => el('li', {}, r))))
        : null,
      s.tradePlan.optionsPlay
        ? el('div', { class: 'strategy-card strategy-inline' },
            el('h3', {}, 'Options play: ' + s.tradePlan.optionsPlay.name),
            el('p', {}, el('strong', {}, 'Setup: '), s.tradePlan.optionsPlay.setup),
            el('p', { class: 'strategy-why' }, s.tradePlan.optionsPlay.rationale))
        : null
    ));
  }

  pane.append(el('p', { class: 'disclaimer' },
    'Generated ' + report.generatedAt + ' from the ' + report.dossierDate + ' technicals dossier. Decision support only, not financial advice. Verify prices, news and option quotes with your broker before acting.'));
}

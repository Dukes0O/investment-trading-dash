// Overview: portfolio stat tiles, holdings table with P/L and signals,
// and the weekly signal board.

import { el, clear, fmtMoney, fmtPct, fmtQty, fmtNum, fmtDate } from '../format.js';
import { getPositions, getHoldings } from '../store.js';
import { getMarketsStream } from '../engine.js';
import { sparkline, COLORS } from '../charts.js';
import { decisionBadge, sourceNotice, trendMeter } from './shared.js';
import { latestReport } from './reports.js';

// Alerts: compare latest closes against the active weekly report's levels.
// A close below the stop is the loud one; "approaching" fires within 3%.
const STOP_APPROACH_PCT = 3;

function computeAlerts(report, markets) {
  if (!report) return [];
  const alerts = [];
  for (const s of report.symbols ?? []) {
    const price = markets.get(s.symbol)?.analysis?.price;
    const plan = s.tradePlan;
    if (price == null || !plan) continue;
    if (plan.stop != null && plan.stop > 0) {
      const distPct = ((price - plan.stop) / plan.stop) * 100;
      if (price <= plan.stop) {
        alerts.push({
          tone: 'critical',
          symbol: s.symbol,
          text: `closed at ${fmtNum(price)}, below the ${fmtDate(report.reportDate)} report's stop of ${fmtNum(plan.stop)} — the plan says exit or reassess.`,
        });
      } else if (distPct <= STOP_APPROACH_PCT) {
        alerts.push({
          tone: 'warn',
          symbol: s.symbol,
          text: `is ${distPct.toFixed(1)}% above its ${fmtNum(plan.stop)} stop — within striking distance; review before it triggers.`,
        });
      }
    }
    if (plan.entryZone && price >= plan.entryZone.low && price <= plan.entryZone.high) {
      alerts.push({
        tone: 'good',
        symbol: s.symbol,
        text: `at ${fmtNum(price)} is inside the report's entry zone (${fmtNum(plan.entryZone.low)} – ${fmtNum(plan.entryZone.high)}); planned action: ${plan.action}.`,
      });
    }
  }
  return alerts;
}

function alertStrip(report, markets) {
  const alerts = computeAlerts(report, markets);
  if (!alerts.length) return null;
  const toneClass = { critical: 'alert-critical', warn: 'alert-warn', good: 'alert-good' };
  return el('div', { class: 'card alert-card' },
    el('div', { class: 'card-head' },
      el('h2', {}, 'Alerts'),
      el('span', { class: 'stat-sub' }, 'vs the ' + fmtDate(report.reportDate) + ' report levels')
    ),
    el('ul', { class: 'alert-list' }, alerts.map((a) =>
      el('li', { class: 'alert ' + toneClass[a.tone] },
        el('span', { class: 'alert-dot', 'aria-hidden': 'true' }),
        el('strong', {}, a.symbol + ' '),
        a.text
      )
    ))
  );
}

export async function renderOverview(root, navigate) {
  clear(root);
  root.append(el('div', { class: 'view-head' },
    el('h1', {}, 'Portfolio overview'),
    el('p', { class: 'view-sub' }, 'Weekly trend analysis across your holdings and watchlist. Click any symbol for the full work-up.')
  ));

  const body = el('div');
  root.append(body);

  const positions = getPositions();
  if (!positions.length) {
    body.className = 'empty-state';
    body.append(
      el('p', {}, 'No positions yet.'),
      el('button', { class: 'btn btn-primary', onclick: () => navigate('portfolio') }, 'Add your first position')
    );
    return;
  }

  const symbols = [...new Set(positions.map((p) => p.symbol))];
  const holdings = getHoldings();

  // Rendering happens against a live, growing map: the server paces provider
  // calls into per-minute waves, so results stream in over time. We paint a
  // skeleton immediately, then fill each symbol's row and card as its wave
  // lands and recompute the aggregates from what has arrived so far.
  const tileRow = el('div', { class: 'tile-row' });
  const progressNote = el('div', { class: 'loading loading-inline' }, `Loading market data… 0/${symbols.length}`);
  const noticeSlot = el('div');
  const alertSlot = el('div');

  const tbody = el('tbody');
  const table = el('table', { class: 'data-table' },
    el('thead', {},
      el('tr', {},
        ['Symbol', 'Qty', 'Last', 'Day', 'Mkt value', 'P/L', 'P/L %', 'Trend (90d)', 'Weekly signal'].map((h, i) =>
          el('th', { class: i > 0 && i < 7 ? 'num' : '' }, h))
      )
    ),
    tbody
  );
  // A symbol may back more than one position row, so track rows per symbol.
  const rowsBySymbol = new Map();
  for (const p of positions) {
    const row = buildRow(p, navigate);
    tbody.append(row);
    if (!rowsBySymbol.has(p.symbol)) rowsBySymbol.set(p.symbol, []);
    rowsBySymbol.get(p.symbol).push({ p, row });
  }

  const board = el('div', { class: 'signal-grid' });
  const cardBySymbol = new Map();
  for (const s of symbols) {
    const card = buildSignalCard(s, navigate);
    board.append(card);
    cardBySymbol.set(s, card);
  }

  body.append(
    tileRow,
    progressNote,
    noticeSlot,
    alertSlot,
    el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', {}, 'Holdings & watchlist')), el('div', { class: 'table-scroll' }, table)),
    el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', {}, 'Weekly signal board')), board),
  );

  renderTiles(tileRow, symbols, holdings, new Map());

  // The report loads independently; refresh alerts once it and any market data
  // are in hand.
  let report = null;
  let lastMarkets = new Map();
  const renderAlerts = () => {
    clear(alertSlot);
    const strip = alertStrip(report, lastMarkets);
    if (strip) alertSlot.append(strip);
  };
  latestReport().then((r) => { report = r; renderAlerts(); }).catch(() => {});

  let done = 0;
  const markets = await getMarketsStream(symbols, (s, r, acc) => {
    lastMarkets = acc;
    done += 1;
    progressNote.textContent = `Loading market data… ${done}/${symbols.length}`;
    for (const { p, row } of rowsBySymbol.get(s) ?? []) fillRow(row, p, r);
    const card = cardBySymbol.get(s);
    if (card) fillSignalCard(card, s, r);
    renderTiles(tileRow, symbols, holdings, acc);
    renderSource(noticeSlot, acc);
    renderAlerts();
  });

  // Everything is in: drop the progress line and settle the table into
  // value-descending order (it filled in position order as waves arrived).
  progressNote.remove();
  sortRows(tbody, rowsBySymbol, markets);
  renderTiles(tileRow, symbols, holdings, markets);
  renderSource(noticeSlot, markets);
  lastMarkets = markets;
  renderAlerts();
}

// Recompute the four summary tiles from whatever market data has arrived so far.
function renderTiles(tileRow, symbols, holdings, markets) {
  let totalValue = 0;
  let totalCost = 0;
  let dayChange = 0;
  for (const p of holdings) {
    const m = markets.get(p.symbol);
    const price = m?.analysis?.price;
    const prev = m?.analysis?.prevClose;
    if (price == null) continue;
    totalValue += price * p.qty;
    totalCost += p.costBasis * p.qty;
    if (prev != null) dayChange += (price - prev) * p.qty;
  }
  const totalPL = totalValue - totalCost;
  const buys = symbols.filter((s) => (markets.get(s)?.analysis?.score ?? 0) >= 25).length;
  const sells = symbols.filter((s) => (markets.get(s)?.analysis?.score ?? 0) <= -25).length;
  const prevValue = totalValue - dayChange;

  clear(tileRow);
  tileRow.append(
    statTile('Portfolio value', fmtMoney(totalValue, { compact: totalValue >= 100000 }), null),
    statTile('Day change', fmtMoney(dayChange, { sign: true }), dayChange >= 0,
      prevValue > 0 ? fmtPct((dayChange / prevValue) * 100) : null),
    statTile('Total P/L', fmtMoney(totalPL, { sign: true }), totalPL >= 0,
      totalCost > 0 ? fmtPct((totalPL / totalCost) * 100) : null),
    statTile('Signals', `${buys} buy · ${sells} sell`, null, `${symbols.length} symbols tracked`),
  );
}

function renderSource(slot, markets) {
  clear(slot);
  sourceNotice(slot, markets);
}

// One holdings row. `m` undefined means the symbol's wave has not landed yet —
// price-derived cells show a muted ellipsis and the row carries `row-pending`.
function buildRow(p, navigate) {
  const row = el('tr', { class: 'row-link', tabindex: '0', role: 'link', 'aria-label': `Open ${p.symbol} analysis` });
  const open = () => navigate('analysis', { symbol: p.symbol });
  row.addEventListener('click', open);
  row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  fillRow(row, p, undefined);
  return row;
}

function fillRow(row, p, m) {
  clear(row);
  row.classList.toggle('row-pending', !m);
  const a = m?.analysis;
  const price = a?.price;
  const prev = a?.prevClose;
  const dayPct = price != null && prev != null ? ((price - prev) / prev) * 100 : null;
  const value = price != null ? price * p.qty : null;
  const pl = price != null && p.qty > 0 ? (price - p.costBasis) * p.qty : null;
  const plPct = price != null && p.qty > 0 && p.costBasis > 0 ? ((price - p.costBasis) / p.costBasis) * 100 : null;
  const closes90 = m?.bars?.slice(-90).map((b) => b.close) ?? [];
  const gap = m ? '—' : '…'; // resolved-but-empty vs still-loading

  row.append(
    el('td', {}, el('span', { class: 'sym' }, p.symbol), p.qty === 0 ? el('span', { class: 'watch-tag' }, 'watch') : null),
    el('td', { class: 'num' }, p.qty > 0 ? fmtQty(p.qty) : '—'),
    el('td', { class: 'num' }, price != null ? fmtNum(price) : gap),
    el('td', { class: 'num ' + deltaClass(dayPct) }, dayPct != null ? fmtPct(dayPct) : gap),
    el('td', { class: 'num' }, value != null && p.qty > 0 ? fmtMoney(value) : (m ? '—' : gap)),
    el('td', { class: 'num ' + deltaClass(pl) }, pl != null ? fmtMoney(pl, { sign: true }) : (m ? '—' : gap)),
    el('td', { class: 'num ' + deltaClass(plPct) }, plPct != null ? fmtPct(plPct) : (m ? '—' : gap)),
    el('td', {}, closes90.length ? sparkline(closes90, { color: COLORS.series1 }) : (m ? '—' : gap)),
    el('td', {}, a ? decisionBadge(a.decision) : (m ? '—' : gap)),
  );
}

function buildSignalCard(s, navigate) {
  const card = el('div', { class: 'signal-card', tabindex: '0', role: 'link', 'aria-label': `Open ${s} analysis` });
  const open = () => navigate('analysis', { symbol: s });
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  fillSignalCard(card, s, undefined);
  return card;
}

function fillSignalCard(card, s, m) {
  clear(card);
  const a = m?.analysis;
  card.classList.toggle('signal-pending', !m);
  if (!a) {
    card.append(el('div', { class: 'signal-card-top' },
      el('span', { class: 'sym' }, s),
      el('span', { class: 'stat-sub' }, m ? 'no data' : 'loading…')
    ));
    return;
  }
  card.append(
    el('div', { class: 'signal-card-top' }, el('span', { class: 'sym' }, s), decisionBadge(a.decision)),
    trendMeter(a.score),
    el('p', { class: 'signal-summary' }, a.decision.summary)
  );
}

// After every wave lands, order the table by market value (descending).
function sortRows(tbody, rowsBySymbol, markets) {
  const entries = [];
  for (const [sym, list] of rowsBySymbol) {
    const price = markets.get(sym)?.analysis?.price ?? 0;
    for (const { p, row } of list) entries.push({ row, value: price * p.qty });
  }
  entries.sort((a, b) => b.value - a.value);
  for (const e of entries) tbody.append(e.row); // re-appending moves the node
}

function statTile(label, value, positive, sub) {
  return el('div', { class: 'stat-tile' },
    el('div', { class: 'stat-label' }, label),
    el('div', { class: 'stat-value' + (positive == null ? '' : positive ? ' delta-up' : ' delta-down') }, value),
    sub ? el('div', { class: 'stat-sub' + (positive == null ? '' : positive ? ' delta-up' : ' delta-down') }, sub) : null
  );
}

function deltaClass(v) {
  if (v == null || !isFinite(v)) return '';
  return v >= 0 ? 'delta-up' : 'delta-down';
}

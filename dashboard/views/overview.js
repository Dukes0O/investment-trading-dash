// Overview: portfolio stat tiles, holdings table with P/L and signals,
// and the weekly signal board.

import { el, clear, fmtMoney, fmtPct, fmtQty, fmtNum } from '../format.js';
import { getPositions, getHoldings } from '../store.js';
import { getMarkets } from '../engine.js';
import { sparkline, COLORS } from '../charts.js';
import { decisionBadge, sourceNotice, trendMeter } from './shared.js';

export async function renderOverview(root, navigate) {
  clear(root);
  root.append(el('div', { class: 'view-head' },
    el('h1', {}, 'Portfolio overview'),
    el('p', { class: 'view-sub' }, 'Weekly trend analysis across your holdings and watchlist. Click any symbol for the full work-up.')
  ));

  const body = el('div', { class: 'loading' }, 'Loading market data…');
  root.append(body);

  const positions = getPositions();
  if (!positions.length) {
    clear(body);
    body.className = 'empty-state';
    body.append(
      el('p', {}, 'No positions yet.'),
      el('button', { class: 'btn btn-primary', onclick: () => navigate('portfolio') }, 'Add your first position')
    );
    return;
  }

  const symbols = [...new Set(positions.map((p) => p.symbol))];
  let markets;
  try {
    markets = await getMarkets(symbols);
  } catch (err) {
    clear(body);
    body.className = 'empty-state';
    body.append(el('p', {}, 'Failed to load market data: ' + err.message));
    return;
  }
  clear(body);
  body.className = '';

  // ---- Aggregates ----
  const holdings = getHoldings();
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
  body.append(el('div', { class: 'tile-row' },
    statTile('Portfolio value', fmtMoney(totalValue, { compact: totalValue >= 100000 }), null),
    statTile('Day change', fmtMoney(dayChange, { sign: true }), dayChange >= 0,
      prevValue > 0 ? fmtPct((dayChange / prevValue) * 100) : null),
    statTile('Total P/L', fmtMoney(totalPL, { sign: true }), totalPL >= 0,
      totalCost > 0 ? fmtPct((totalPL / totalCost) * 100) : null),
    statTile('Signals', `${buys} buy · ${sells} sell`, null, `${symbols.length} symbols tracked`),
  ));

  sourceNotice(body, markets);

  // ---- Holdings table ----
  const table = el('table', { class: 'data-table' },
    el('thead', {},
      el('tr', {},
        ['Symbol', 'Qty', 'Last', 'Day', 'Mkt value', 'P/L', 'P/L %', 'Trend (90d)', 'Weekly signal'].map((h, i) =>
          el('th', { class: i > 0 && i < 7 ? 'num' : '' }, h))
      )
    )
  );
  const tbody = el('tbody');
  table.append(tbody);

  const sorted = positions.slice().sort((a, b) => {
    const va = (markets.get(a.symbol)?.analysis?.price ?? 0) * a.qty;
    const vb = (markets.get(b.symbol)?.analysis?.price ?? 0) * b.qty;
    return vb - va;
  });

  for (const p of sorted) {
    const m = markets.get(p.symbol);
    const a = m?.analysis;
    const price = a?.price;
    const prev = a?.prevClose;
    const dayPct = price != null && prev != null ? ((price - prev) / prev) * 100 : null;
    const value = price != null ? price * p.qty : null;
    const pl = price != null && p.qty > 0 ? (price - p.costBasis) * p.qty : null;
    const plPct = p.qty > 0 && p.costBasis > 0 ? ((price - p.costBasis) / p.costBasis) * 100 : null;
    const closes90 = m?.bars?.slice(-90).map((b) => b.close) ?? [];

    const row = el('tr', { class: 'row-link', tabindex: '0', role: 'link', 'aria-label': `Open ${p.symbol} analysis` },
      el('td', {}, el('span', { class: 'sym' }, p.symbol), p.qty === 0 ? el('span', { class: 'watch-tag' }, 'watch') : null),
      el('td', { class: 'num' }, p.qty > 0 ? fmtQty(p.qty) : '—'),
      el('td', { class: 'num' }, price != null ? fmtNum(price) : '—'),
      el('td', { class: 'num ' + deltaClass(dayPct) }, fmtPct(dayPct)),
      el('td', { class: 'num' }, value != null && p.qty > 0 ? fmtMoney(value) : '—'),
      el('td', { class: 'num ' + deltaClass(pl) }, pl != null ? fmtMoney(pl, { sign: true }) : '—'),
      el('td', { class: 'num ' + deltaClass(plPct) }, plPct != null ? fmtPct(plPct) : '—'),
      el('td', {}, closes90.length ? sparkline(closes90, { color: COLORS.series1 }) : '—'),
      el('td', {}, a ? decisionBadge(a.decision) : '—'),
    );
    const open = () => navigate('analysis', { symbol: p.symbol });
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    tbody.append(row);
  }

  body.append(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h2', {}, 'Holdings & watchlist')),
    el('div', { class: 'table-scroll' }, table)
  ));

  // ---- Signal board ----
  const board = el('div', { class: 'signal-grid' });
  for (const s of symbols) {
    const m = markets.get(s);
    const a = m?.analysis;
    if (!a) continue;
    const card = el('div', { class: 'signal-card', tabindex: '0', role: 'link', 'aria-label': `Open ${s} analysis` },
      el('div', { class: 'signal-card-top' },
        el('span', { class: 'sym' }, s),
        decisionBadge(a.decision)
      ),
      trendMeter(a.score),
      el('p', { class: 'signal-summary' }, a.decision.summary)
    );
    const open = () => navigate('analysis', { symbol: s });
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    board.append(card);
  }
  body.append(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h2', {}, 'Weekly signal board')),
    board
  ));
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

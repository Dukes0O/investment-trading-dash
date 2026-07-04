// Strategy lab: backtest the trend presets over a symbol's full price history
// and compare them against buy-and-hold — metrics table + indexed equity
// curves. Fresh results via the backend API; falls back to the committed
// data/backtests.json printout when no server is running.

import { createChart, LineSeries } from 'lightweight-charts';
import { el, clear, fmtPct, fmtNum, fmtDate } from '../format.js';
import { getSymbols, isBackend } from '../store.js';
import { apiGet } from '../api.js';
import { COLORS } from '../charts.js';

const SERIES_COLORS = [COLORS.series1, COLORS.series2, COLORS.series3]; // presets
const BH_COLOR = COLORS.muted;

async function fetchBacktest(symbol) {
  if (isBackend()) {
    try {
      return { data: await apiGet('/backtest/' + encodeURIComponent(symbol)), fresh: true };
    } catch { /* fall through */ }
  }
  const res = await fetch('/data/backtests.json');
  if (!res.ok) return { data: null, fresh: false };
  const all = await res.json();
  return { data: all.symbols?.[symbol] ?? null, fresh: false, generatedAt: all.generatedAt };
}

export async function renderStrategyLab(root, navigate, params) {
  clear(root);
  root.append(el('div', { class: 'view-head' },
    el('h1', {}, 'Strategy lab'),
    el('p', { class: 'view-sub' }, 'Replay three trend-trading styles over the full price history — classic 30-week trend following, Donchian breakouts, and pullback/retracement entries — with next-open execution, 0.1% round-trip costs, and stop-truncated exits. Compare against buy-and-hold before trusting any of them.')
  ));

  const symbols = getSymbols();
  if (!symbols.length) {
    root.append(el('p', { class: 'empty-state' }, 'Add positions or watchlist symbols first.'));
    return;
  }
  const symbol = (params.symbol || symbols[0]).toUpperCase();

  root.append(el('div', { class: 'report-picker' },
    el('span', { class: 'field-label' }, 'Symbol'),
    el('div', { class: 'seg' },
      symbols.map((s) =>
        el('button', {
          class: 'seg-btn' + (s === symbol ? ' seg-active' : ''),
          onclick: () => navigate('strategylab', { symbol: s }),
        }, s))
    )
  ));

  const body = el('div', { class: 'loading' }, 'Running backtests for ' + symbol + '…');
  root.append(body);

  const { data, fresh, generatedAt } = await fetchBacktest(symbol);
  clear(body);
  body.className = '';

  if (!data || !data.results?.length) {
    body.className = 'empty-state';
    body.append(
      el('p', {}, 'No backtest available for ' + symbol + '.'),
      el('p', { class: 'view-sub' }, isBackend()
        ? 'Not enough price history (the presets need ~1 year of bars to warm up). Switch to the Stooq provider in Settings for decades of history.'
        : 'Run `node scripts/backtest.mjs` to generate the committed results, or start the backend for live runs.')
    );
    return;
  }

  if (String(data.source).startsWith('demo')) {
    body.append(el('div', { class: 'notice notice-info' },
      el('strong', {}, 'Demo data. '),
      'These curves are computed on synthetic prices — switch to Stooq (free, no key) in Settings for real, decades-deep history.'
    ));
  }
  body.append(el('p', { class: 'view-sub' },
    `${data.bars.toLocaleString()} daily bars, ${fmtDate(data.from)} → ${fmtDate(data.to)} · source: ${data.source}` +
    (fresh ? '' : generatedAt ? ` · committed results from ${generatedAt.slice(0, 10)}` : '')
  ));

  // ---- Metrics table ----
  const rows = data.results.map((r, i) => ({ ...r, color: SERIES_COLORS[i % SERIES_COLORS.length] }));
  const bh = data.buyHold;
  body.append(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h2', {}, 'Styles compared')),
    el('div', { class: 'table-scroll' },
      el('table', { class: 'data-table' },
        el('thead', {}, el('tr', {},
          ['Strategy', 'Total return', 'CAGR', 'Max drawdown', 'Trades', 'Win rate', 'Avg trade', 'Time in market'].map((h, i) =>
            el('th', { class: i > 0 ? 'num' : '' }, h))
        )),
        el('tbody', {},
          rows.map((r) =>
            el('tr', {},
              el('td', {},
                el('span', { class: 'legend-key', style: { background: r.color, marginRight: '7px' } }),
                el('strong', {}, r.name),
                el('div', { class: 'strategy-style' }, r.style)
              ),
              el('td', { class: 'num ' + delta(r.metrics.totalReturnPct) }, fmtPct(r.metrics.totalReturnPct)),
              el('td', { class: 'num ' + delta(r.metrics.cagrPct) }, r.metrics.cagrPct != null ? fmtPct(r.metrics.cagrPct) : '—'),
              el('td', { class: 'num delta-down' }, '−' + fmtNum(r.metrics.maxDrawdownPct, 1) + '%'),
              el('td', { class: 'num' }, String(r.metrics.trades)),
              el('td', { class: 'num' }, r.metrics.winRatePct != null ? fmtNum(r.metrics.winRatePct, 0) + '%' : '—'),
              el('td', { class: 'num ' + delta(r.metrics.avgTradePct) }, r.metrics.avgTradePct != null ? fmtPct(r.metrics.avgTradePct) : '—'),
              el('td', { class: 'num' }, fmtNum(r.metrics.exposurePct, 0) + '%'),
            )
          ),
          bh ? el('tr', { class: 'bh-row' },
            el('td', {},
              el('span', { class: 'legend-key', style: { background: BH_COLOR, marginRight: '7px' } }),
              el('strong', {}, 'Buy & hold'),
              el('div', { class: 'strategy-style' }, 'The benchmark every strategy must beat — after its lower stress')
            ),
            el('td', { class: 'num ' + delta(bh.metrics.totalReturnPct) }, fmtPct(bh.metrics.totalReturnPct)),
            el('td', { class: 'num ' + delta(bh.metrics.cagrPct) }, bh.metrics.cagrPct != null ? fmtPct(bh.metrics.cagrPct) : '—'),
            el('td', { class: 'num delta-down' }, '−' + fmtNum(bh.metrics.maxDrawdownPct, 1) + '%'),
            el('td', { class: 'num' }, '—'),
            el('td', { class: 'num' }, '—'),
            el('td', { class: 'num' }, '—'),
            el('td', { class: 'num' }, '100%'),
          ) : null
        )
      )
    ),
    el('p', { class: 'card-note' },
      'A strategy earns its keep by beating buy-and-hold on return, drawdown, or both. Judge drawdown as seriously as return — it is what you actually live through.')
  ));

  // ---- Equity curves ----
  const chartCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h2', {}, 'Equity curves (indexed to 100)')),
    el('div', { class: 'chart-legend' },
      rows.map((r) => el('span', { class: 'legend-item' }, el('span', { class: 'legend-key', style: { background: r.color } }), r.name)),
      bh ? el('span', { class: 'legend-item' }, el('span', { class: 'legend-key', style: { background: BH_COLOR } }), 'Buy & hold') : null
    ),
  );
  const host = el('div', { class: 'tv-host tv-host-short' });
  chartCard.append(host);
  body.append(chartCard);

  const chart = createChart(host, {
    autoSize: true,
    layout: { background: { color: COLORS.surface }, textColor: COLORS.muted, fontSize: 11 },
    grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
    rightPriceScale: { borderColor: COLORS.axis },
    timeScale: { borderColor: COLORS.axis },
  });
  for (const r of rows) {
    const s = chart.addSeries(LineSeries, { color: r.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    s.setData(r.equity.map((p) => ({ time: p.date, value: p.value })));
  }
  if (bh) {
    const s = chart.addSeries(LineSeries, { color: BH_COLOR, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    s.setData(bh.equity.map((p) => ({ time: p.date, value: p.value })));
  }
  chart.timeScale().fitContent();

  body.append(el('p', { class: 'disclaimer' },
    'Backtests are simplified (long/flat, one position, no dividends or taxes) and past performance does not predict future results — use them to compare styles, not to forecast returns. Strategy definitions: scripts/lib/strategies.mjs.'));

  return () => chart.remove();
}

function delta(v) {
  if (v == null || !isFinite(v)) return '';
  return v >= 0 ? 'delta-up' : 'delta-down';
}

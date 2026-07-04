// Price/indicator chart stack built on TradingView's lightweight-charts
// (Apache-2.0). The library supplies candlesticks, pan/zoom, autoscaling and
// the crosshair; we add the theme, MA overlays, RSI/MACD panes, the legend,
// and a floating tooltip that lists every series at the crosshair.

import { createChart, CandlestickSeries, LineSeries, HistogramSeries, CrosshairMode } from 'lightweight-charts';
import { el, clear, fmtNum, fmtDateShort } from './format.js';
import { COLORS } from './charts.js';

const HIST_UP = COLORS.series1; // MACD histogram polarity: diverging blue/red
const HIST_DOWN = '#e66767';

// bars: daily/weekly OHLC. overlays: [{name, color, values}] aligned to bars.
// rsi: values. macd: {line, signal, histogram}. Returns a dispose function.
export function renderTradingChart(container, bars, { overlays = [], rsi, macd, ariaLabel } = {}) {
  clear(container);
  if (!bars.length) {
    container.append(el('div', { class: 'chart-empty' }, 'No data'));
    return () => {};
  }

  // Legend (identity channel — the tooltip and table view carry values).
  const legendDefs = [
    ...overlays,
    rsi ? { name: 'RSI', color: COLORS.series4 } : null,
    macd ? { name: 'MACD', color: COLORS.series1 } : null,
    macd ? { name: 'Signal', color: COLORS.series2 } : null,
  ].filter(Boolean);
  container.append(el('div', { class: 'chart-legend' },
    legendDefs.map((s) => el('span', { class: 'legend-item' },
      el('span', { class: 'legend-key', style: { background: s.color } }), s.name))
  ));

  const host = el('div', {
    class: 'tv-host',
    role: 'img',
    'aria-label': (ariaLabel || 'Price chart') + '. Values are also available in the table view.',
  });
  container.append(host);

  const chart = createChart(host, {
    autoSize: true,
    layout: {
      background: { color: COLORS.surface },
      textColor: COLORS.muted,
      fontSize: 11,
      panes: { separatorColor: COLORS.axis, enableResize: false },
    },
    grid: {
      vertLines: { color: COLORS.grid },
      horzLines: { color: COLORS.grid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: COLORS.muted, labelBackgroundColor: '#383835' },
      horzLine: { color: COLORS.muted, labelBackgroundColor: '#383835' },
    },
    rightPriceScale: { borderColor: COLORS.axis },
    timeScale: { borderColor: COLORS.axis, timeVisible: false },
  });

  const candles = chart.addSeries(CandlestickSeries, {
    upColor: COLORS.up,
    downColor: COLORS.down,
    wickUpColor: COLORS.up,
    wickDownColor: COLORS.down,
    borderVisible: false,
  }, 0);
  candles.setData(bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close })));

  const lineData = (values) => bars
    .map((b, i) => ({ time: b.date, value: values[i] }))
    .filter((p) => p.value != null);

  const tracked = [{ series: candles, name: 'Close', kind: 'candle' }];

  for (const o of overlays) {
    const s = chart.addSeries(LineSeries, {
      color: o.color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    }, 0);
    s.setData(lineData(o.values));
    tracked.push({ series: s, name: o.name, color: o.color, kind: 'line' });
  }

  let paneIdx = 0;

  if (rsi) {
    paneIdx += 1;
    const s = chart.addSeries(LineSeries, {
      color: COLORS.series4,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: { type: 'custom', formatter: (v) => v.toFixed(0), minMove: 1 },
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    }, paneIdx);
    s.setData(lineData(rsi));
    for (const level of [30, 70]) {
      s.createPriceLine({ price: level, color: COLORS.axis, lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: '' });
    }
    tracked.push({ series: s, name: 'RSI', color: COLORS.series4, kind: 'line', digits: 0 });
  }

  if (macd) {
    paneIdx += 1;
    const hist = chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
    }, paneIdx);
    hist.setData(bars
      .map((b, i) => ({ time: b.date, value: macd.histogram[i], color: (macd.histogram[i] ?? 0) >= 0 ? HIST_UP : HIST_DOWN }))
      .filter((p) => p.value != null));
    const line = chart.addSeries(LineSeries, {
      color: COLORS.series1, lineWidth: 2,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    }, paneIdx);
    line.setData(lineData(macd.line));
    const signal = chart.addSeries(LineSeries, {
      color: COLORS.series2, lineWidth: 2,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    }, paneIdx);
    signal.setData(lineData(macd.signal));
    line.createPriceLine({ price: 0, color: COLORS.axis, lineWidth: 1, lineStyle: 0, axisLabelVisible: false, title: '' });
    tracked.push(
      { series: hist, name: 'Histogram', kind: 'hist' },
      { series: line, name: 'MACD', color: COLORS.series1, kind: 'line' },
      { series: signal, name: 'Signal', color: COLORS.series2, kind: 'line' },
    );
  }

  // Pane proportions: price pane dominates, indicator panes stay compact.
  const panes = chart.panes();
  if (panes[0]?.setStretchFactor) {
    panes[0].setStretchFactor(30);
    for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(10);
  }

  chart.timeScale().fitContent();

  // Floating tooltip: one readout, every series at the crosshair X.
  const tooltip = el('div', { class: 'chart-tooltip', style: { display: 'none' } });
  host.append(tooltip);

  chart.subscribeCrosshairMove((param) => {
    if (!param.time || !param.point) {
      tooltip.style.display = 'none';
      return;
    }
    clear(tooltip);
    const date = String(param.time);
    tooltip.append(el('div', { class: 'tt-date' }, fmtDateShort(date) + ', ' + date.slice(0, 4)));
    for (const t of tracked) {
      const d = param.seriesData.get(t.series);
      if (!d) continue;
      if (t.kind === 'candle') {
        tooltip.append(ttRow(null, 'O ' + fmtNum(d.open) + '  H ' + fmtNum(d.high) + '  L ' + fmtNum(d.low)));
        tooltip.append(ttRow(d.close >= d.open ? COLORS.up : COLORS.down, 'Close ' + fmtNum(d.close), true));
      } else if (t.kind === 'hist') {
        tooltip.append(ttRow(d.value >= 0 ? HIST_UP : HIST_DOWN, t.name + '  ' + fmtNum(d.value)));
      } else {
        tooltip.append(ttRow(t.color, t.name + '  ' + fmtNum(d.value, t.digits ?? 2)));
      }
    }
    tooltip.style.display = 'block';
    const w = tooltip.offsetWidth || 160;
    let left = param.point.x + 16;
    if (left + w > host.clientWidth - 12) left = param.point.x - w - 16;
    tooltip.style.left = Math.max(4, left) + 'px';
    tooltip.style.top = '12px';
  });

  return () => chart.remove();
}

function ttRow(color, text, strong = false) {
  return el('div', { class: 'tt-row' + (strong ? ' tt-strong' : '') },
    color ? el('span', { class: 'legend-key', style: { background: color } }) : el('span', { class: 'legend-key legend-key-blank' }),
    text
  );
}

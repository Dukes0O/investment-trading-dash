// SVG chart engine: multi-pane price/indicator stack with a shared crosshair,
// hover + keyboard tooltip, legend, and a sparkline helper.
// Mark specs: 2px lines, hairline solid grid, thin candles, direction encoded
// with the status palette (up = good, down = critical) plus the candle shape
// itself (hollow-ish body direction is not relied upon — labels and the table
// view carry exact values).

import { el, svgEl, clear, fmtNum, fmtDateShort } from './format.js';

export const COLORS = {
  up: '#0ca30c',
  down: '#d03b3b',
  series1: '#3987e5', // blue
  series2: '#c98500', // yellow
  series3: '#9085e9', // violet
  series4: '#199e70', // aqua
  grid: '#2c2c2a',
  axis: '#383835',
  muted: '#898781',
  ink: '#ffffff',
  inkSecondary: '#c3c2b7',
  surface: '#1a1a19',
};

const PAD = { left: 8, right: 56, top: 10, bottom: 4 };
const X_AXIS_H = 22;

function niceTicks(min, max, count = 4) {
  if (!(max > min)) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2.5 ? 5 : norm >= 1.5 ? 2.5 : norm >= 1 ? 1.5 : 1) * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

// panes: [{ height, type: 'price'|'lines'|'macd', series: [...], bands, zeroLine }]
// Every pane shares the x domain (bar index). `bars` drives x labels and the
// price pane candles.
export function renderChartStack(container, bars, panes, opts = {}) {
  clear(container);
  if (!bars.length) {
    container.append(el('div', { class: 'chart-empty' }, 'No data'));
    return;
  }
  const width = Math.max(320, container.clientWidth || 640);
  const plotW = width - PAD.left - PAD.right;
  const n = bars.length;
  const xAt = (i) => PAD.left + ((i + 0.5) / n) * plotW;
  const slotW = plotW / n;
  const candleW = Math.max(1, Math.min(9, Math.floor(slotW * 0.66)));

  const totalH = panes.reduce((s, p) => s + p.height + PAD.top + PAD.bottom, 0) + X_AXIS_H;
  const svg = svgEl('svg', {
    width,
    height: totalH,
    viewBox: `0 0 ${width} ${totalH}`,
    class: 'chart-svg',
    role: 'img',
    'aria-label': opts.ariaLabel || 'Price and indicator chart',
  });

  const paneLayouts = [];
  let yCursor = 0;

  for (const pane of panes) {
    const top = yCursor + PAD.top;
    const h = pane.height;
    yCursor += pane.height + PAD.top + PAD.bottom;

    // Y domain from all visible values in this pane.
    let min = Infinity;
    let max = -Infinity;
    if (pane.type === 'price') {
      for (const b of bars) {
        min = Math.min(min, b.low);
        max = Math.max(max, b.high);
      }
    }
    for (const s of pane.series || []) {
      for (const v of s.values) {
        if (v == null) continue;
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    if (pane.fixedDomain) {
      [min, max] = pane.fixedDomain;
    } else {
      const padV = (max - min) * 0.06 || 1;
      min -= padV;
      max += padV;
    }
    const yAt = (v) => top + h - ((v - min) / (max - min)) * h;
    paneLayouts.push({ pane, top, h, yAt, min, max });

    // Gridlines + y ticks (skip tick labels the pane opts out of).
    const ticks = pane.fixedTicks || niceTicks(min, max, Math.max(2, Math.round(h / 60)));
    for (const t of ticks) {
      if (t < min || t > max) continue;
      const y = yAt(t);
      svg.append(svgEl('line', { x1: PAD.left, x2: PAD.left + plotW, y1: y, y2: y, stroke: COLORS.grid, 'stroke-width': 1 }));
      svg.append(svgEl('text', {
        x: PAD.left + plotW + 6, y: y + 3.5, fill: COLORS.muted,
        'font-size': 10.5, class: 'tick-label',
      }, pane.format ? pane.format(t) : fmtNum(t, t >= 100 ? 0 : 2)));
    }

    // Reference bands (e.g. RSI 30–70).
    if (pane.bands) {
      for (const band of pane.bands) {
        const y1 = yAt(band[1]);
        const y2 = yAt(band[0]);
        svg.append(svgEl('rect', { x: PAD.left, y: y1, width: plotW, height: y2 - y1, fill: COLORS.grid, opacity: 0.35 }));
      }
    }
    if (pane.zeroLine && min < 0 && max > 0) {
      const y = yAt(0);
      svg.append(svgEl('line', { x1: PAD.left, x2: PAD.left + plotW, y1: y, y2: y, stroke: COLORS.axis, 'stroke-width': 1 }));
    }

    // Histogram series first (behind lines).
    for (const s of pane.series || []) {
      if (s.kind !== 'histogram') continue;
      const y0 = yAt(0);
      const barW = Math.max(1, candleW - 2);
      for (let i = 0; i < n; i++) {
        const v = s.values[i];
        if (v == null || v === 0) continue;
        const y = yAt(v);
        svg.append(svgEl('rect', {
          x: xAt(i) - barW / 2,
          y: Math.min(y, y0),
          width: barW,
          height: Math.max(1, Math.abs(y - y0)),
          fill: v >= 0 ? COLORS.series1 : '#e66767',
          opacity: 0.75,
        }));
      }
    }

    // Candles.
    if (pane.type === 'price') {
      for (let i = 0; i < n; i++) {
        const b = bars[i];
        const cx = xAt(i);
        const upBar = b.close >= b.open;
        const color = upBar ? COLORS.up : COLORS.down;
        svg.append(svgEl('line', { x1: cx, x2: cx, y1: yAt(b.high), y2: yAt(b.low), stroke: color, 'stroke-width': 1 }));
        const yO = yAt(b.open);
        const yC = yAt(b.close);
        svg.append(svgEl('rect', {
          x: cx - candleW / 2,
          y: Math.min(yO, yC),
          width: candleW,
          height: Math.max(1, Math.abs(yO - yC)),
          fill: color,
          rx: candleW > 3 ? 1 : 0,
        }));
      }
    }

    // Line series.
    for (const s of pane.series || []) {
      if (s.kind === 'histogram') continue;
      let d = '';
      let pen = false;
      for (let i = 0; i < n; i++) {
        const v = s.values[i];
        if (v == null) { pen = false; continue; }
        d += (pen ? 'L' : 'M') + xAt(i).toFixed(1) + ',' + yAt(v).toFixed(1);
        pen = true;
      }
      if (d) {
        svg.append(svgEl('path', {
          d, fill: 'none', stroke: s.color, 'stroke-width': 2,
          'stroke-linejoin': 'round', 'stroke-linecap': 'round',
          'stroke-dasharray': s.dashed ? '2 3' : null,
          opacity: s.opacity ?? 1,
        }));
      }
    }

    // Pane title (top-left, quiet).
    if (pane.title) {
      svg.append(svgEl('text', { x: PAD.left + 2, y: top + 11, fill: COLORS.inkSecondary, 'font-size': 11, 'font-weight': 600 }, pane.title));
    }

    // Pane separator.
    svg.append(svgEl('line', {
      x1: 0, x2: width, y1: yCursor - 0.5, y2: yCursor - 0.5, stroke: COLORS.axis, 'stroke-width': 1,
    }));
  }

  // X axis labels — a handful of dates, no collisions.
  const labelEvery = Math.max(1, Math.ceil(n / Math.floor(plotW / 72)));
  for (let i = 0; i < n; i += labelEvery) {
    svg.append(svgEl('text', {
      x: xAt(i), y: totalH - 7, fill: COLORS.muted, 'font-size': 10.5,
      'text-anchor': 'middle', class: 'tick-label',
    }, fmtDateShort(bars[i].date)));
  }

  // ---- Crosshair + tooltip ----
  const crosshair = svgEl('line', { x1: 0, x2: 0, y1: 0, y2: totalH - X_AXIS_H, stroke: COLORS.muted, 'stroke-width': 1, opacity: 0, 'pointer-events': 'none' });
  svg.append(crosshair);

  const tooltip = el('div', { class: 'chart-tooltip', style: { display: 'none' } });
  const wrapper = el('div', { class: 'chart-wrapper', tabindex: '0', 'aria-label': 'Chart. Use left and right arrow keys to inspect values.' });
  wrapper.append(svg, tooltip);
  container.append(wrapper);

  let activeIdx = null;

  function showIndex(i, clientX) {
    activeIdx = i;
    const cx = xAt(i);
    crosshair.setAttribute('x1', cx);
    crosshair.setAttribute('x2', cx);
    crosshair.setAttribute('opacity', 0.6);

    clear(tooltip);
    const b = bars[i];
    tooltip.append(el('div', { class: 'tt-date' }, fmtDateShort(b.date) + (b.date.length >= 10 ? ', ' + b.date.slice(0, 4) : '')));
    for (const { pane } of paneLayouts) {
      if (pane.type === 'price') {
        tooltip.append(ttRow(null, 'O ' + fmtNum(b.open) + '  H ' + fmtNum(b.high) + '  L ' + fmtNum(b.low)));
        tooltip.append(ttRow(b.close >= b.open ? COLORS.up : COLORS.down, 'Close ' + fmtNum(b.close), true));
      }
      for (const s of pane.series || []) {
        const v = s.values[i];
        if (v == null) continue;
        tooltip.append(ttRow(s.kind === 'histogram' ? (v >= 0 ? COLORS.series1 : '#e66767') : s.color, s.name + '  ' + (pane.format ? pane.format(v) : fmtNum(v))));
      }
    }
    tooltip.style.display = 'block';
    const rect = wrapper.getBoundingClientRect();
    const ttW = tooltip.offsetWidth || 160;
    let left = (clientX != null ? clientX - rect.left : cx) + 14;
    if (left + ttW > rect.width - 8) left = (clientX != null ? clientX - rect.left : cx) - ttW - 14;
    tooltip.style.left = Math.max(4, left) + 'px';
    tooltip.style.top = '10px';
  }

  function hide() {
    activeIdx = null;
    crosshair.setAttribute('opacity', 0);
    tooltip.style.display = 'none';
  }

  wrapper.addEventListener('pointermove', (e) => {
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i = Math.max(0, Math.min(n - 1, Math.floor(((x - PAD.left) / plotW) * n)));
    showIndex(i, e.clientX);
  });
  wrapper.addEventListener('pointerleave', hide);
  wrapper.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const next = activeIdx == null ? n - 1 : Math.max(0, Math.min(n - 1, activeIdx + (e.key === 'ArrowRight' ? 1 : -1)));
      showIndex(next, null);
    } else if (e.key === 'Escape') {
      hide();
    }
  });
  wrapper.addEventListener('blur', hide);

  // Legend: one entry per named line series across panes (≥2 series ⇒ legend).
  const legendItems = [];
  for (const p of panes) for (const s of p.series || []) if (s.kind !== 'histogram' && !s.noLegend) legendItems.push(s);
  if (legendItems.length >= 1) {
    const legend = el('div', { class: 'chart-legend' },
      legendItems.map((s) =>
        el('span', { class: 'legend-item' },
          el('span', { class: 'legend-key', style: { background: s.color } }),
          s.name
        )
      )
    );
    container.prepend(legend);
  }
}

function ttRow(color, text, strong = false) {
  return el('div', { class: 'tt-row' + (strong ? ' tt-strong' : '') },
    color ? el('span', { class: 'legend-key', style: { background: color } }) : el('span', { class: 'legend-key legend-key-blank' }),
    text
  );
}

// Small sparkline for stat tiles / table rows. De-emphasis hue with the last
// point accented.
export function sparkline(values, { width = 96, height = 28, color = COLORS.series1 } = {}) {
  const defined = values.filter((v) => v != null);
  if (defined.length < 2) return el('span');
  const min = Math.min(...defined);
  const max = Math.max(...defined);
  const span = max - min || 1;
  const xAt = (i) => 2 + (i / (values.length - 1)) * (width - 4);
  const yAt = (v) => height - 3 - ((v - min) / span) * (height - 6);
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += (pen ? 'L' : 'M') + xAt(i).toFixed(1) + ',' + yAt(v).toFixed(1);
    pen = true;
  });
  const lastIdx = values.length - 1;
  const lastVal = values[lastIdx];
  const svg = svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'sparkline', 'aria-hidden': 'true' },
    svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.5, opacity: 0.55, 'stroke-linejoin': 'round' }),
    lastVal != null
      ? svgEl('circle', { cx: xAt(lastIdx), cy: yAt(lastVal), r: 2.5, fill: color, stroke: COLORS.surface, 'stroke-width': 2 })
      : null
  );
  return svg;
}

// Shared chart palette (validated for the dark surface) and the sparkline
// used in stat tiles and table rows. The full price/indicator chart lives in
// tvchart.js on top of TradingView's lightweight-charts.

import { el, svgEl } from './format.js';

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

// Small sparkline for stat tiles / table rows. De-emphasis stroke with the
// last point accented by a surface ring.
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
  return svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'sparkline', 'aria-hidden': 'true' },
    svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.5, opacity: 0.55, 'stroke-linejoin': 'round' }),
    lastVal != null
      ? svgEl('circle', { cx: xAt(lastIdx), cy: yAt(lastVal), r: 2.5, fill: color, stroke: COLORS.surface, 'stroke-width': 2 })
      : null
  );
}

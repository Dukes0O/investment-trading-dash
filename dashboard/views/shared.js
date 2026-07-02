// Small UI pieces shared by multiple views.

import { el } from '../format.js';

export function decisionBadge(decision) {
  return el('span', { class: 'badge badge-' + decision.tone },
    el('span', { class: 'badge-dot', 'aria-hidden': 'true' }),
    decision.action
  );
}

// Trend score meter: −100…+100 with a neutral center. The fill carries the
// score's direction/severity; the track is a darker step of the same scale.
export function trendMeter(score) {
  const half = Math.min(100, Math.abs(score)) / 2; // percent of full width
  const fill = el('div', {
    class: 'meter-fill ' + (score >= 0 ? 'meter-up' : 'meter-down'),
    style: score >= 0
      ? { left: '50%', width: half + '%' }
      : { right: '50%', width: half + '%' },
  });
  return el('div', { class: 'trend-meter', role: 'img', 'aria-label': `Trend score ${score} of 100` },
    el('div', { class: 'meter-track' }, fill, el('div', { class: 'meter-center' })),
    el('span', { class: 'meter-value' }, (score > 0 ? '+' : '') + score)
  );
}

// Banner listing data-source problems (rate limits, missing keys, fallbacks).
export function sourceNotice(container, markets) {
  const issues = [];
  const sources = new Set();
  for (const [sym, m] of markets) {
    sources.add(m.source);
    if (m.error) issues.push(`${sym}: ${m.error}`);
  }
  const demo = [...sources].some((s) => s.startsWith('demo'));
  if (demo) {
    container.append(el('div', { class: 'notice notice-info' },
      el('strong', {}, 'Demo data. '),
      'Prices shown are synthetic. Connect a free market-data API key in Settings to analyze real quotes.'
    ));
  }
  if (issues.length) {
    container.append(el('div', { class: 'notice notice-warn' },
      el('strong', {}, 'Data issues. '),
      issues.join(' · ')
    ));
  }
}

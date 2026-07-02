// Settings: market-data provider and API keys.

import { el, clear } from '../format.js';
import { getSettings, updateSettings } from '../store.js';
import { invalidate } from '../engine.js';

const PROVIDERS = [
  {
    id: 'demo',
    name: 'Demo data (no key required)',
    blurb: 'Deterministic synthetic prices so the dashboard works offline. Good for exploring; not for trading decisions.',
  },
  {
    id: 'alphavantage',
    name: 'Alpha Vantage',
    blurb: 'Free API key at alphavantage.co (25 requests/day on the free tier). Daily OHLCV for US equities and ETFs. Responses are cached for the day.',
    keyField: 'alphaVantageKey',
    keyLabel: 'Alpha Vantage API key',
  },
  {
    id: 'twelvedata',
    name: 'Twelve Data',
    blurb: 'Free API key at twelvedata.com (800 credits/day, 8/minute on the free tier). Daily OHLCV for stocks and ETFs. Responses are cached for the day.',
    keyField: 'twelveDataKey',
    keyLabel: 'Twelve Data API key',
  },
];

export function renderSettings(root) {
  clear(root);
  root.append(el('div', { class: 'view-head' },
    el('h1', {}, 'Settings'),
    el('p', { class: 'view-sub' }, 'Choose where price data comes from. Keys are stored only in this browser (localStorage) and sent only to the provider you select.')
  ));

  const card = el('div', { class: 'card' });
  root.append(card);

  function draw() {
    clear(card);
    const settings = getSettings();
    card.append(el('div', { class: 'card-head' }, el('h2', {}, 'Market data provider')));

    for (const p of PROVIDERS) {
      const selected = settings.provider === p.id;
      const radio = el('input', {
        class: 'radio', type: 'radio', name: 'provider', id: 'prov-' + p.id,
        checked: selected || null,
        onchange: () => { updateSettings({ provider: p.id }); invalidate(); draw(); },
      });
      const block = el('div', { class: 'provider' + (selected ? ' provider-selected' : '') },
        el('label', { class: 'provider-head', for: 'prov-' + p.id }, radio, el('strong', {}, p.name)),
        el('p', { class: 'provider-blurb' }, p.blurb),
      );
      if (p.keyField && selected) {
        const keyInput = el('input', {
          class: 'input', type: 'password', placeholder: p.keyLabel,
          value: settings[p.keyField] || null, autocomplete: 'off',
        });
        const saved = el('span', { class: 'save-flash', role: 'status' });
        block.append(el('div', { class: 'key-row' },
          keyInput,
          el('button', {
            class: 'btn btn-primary btn-sm',
            onclick: () => {
              updateSettings({ [p.keyField]: keyInput.value.trim() });
              invalidate();
              saved.textContent = 'Saved ✓';
              setTimeout(() => { saved.textContent = ''; }, 2000);
            },
          }, 'Save key'),
          saved
        ));
      }
      card.append(block);
    }

    card.append(el('div', { class: 'card-foot' },
      el('button', {
        class: 'btn btn-ghost btn-sm',
        onclick: () => {
          for (const k of Object.keys(localStorage)) {
            if (k.startsWith('trenddesk.bars.')) localStorage.removeItem(k);
          }
          invalidate();
          alert('Price cache cleared. Data will be re-fetched on the next view.');
        },
      }, 'Clear price cache'),
    ));
  }

  draw();
}

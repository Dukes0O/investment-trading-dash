// Settings: market-data provider and API keys.
// Backend mode: provider + keys are stored server-side (SQLite); the API only
// ever reports key *presence*. Fallback mode (no server): demo data only.

import { el, clear } from '../format.js';
import { getSettings, updateSettings, isBackend } from '../store.js';
import { invalidate } from '../engine.js';
import { apiSend } from '../api.js';

const PROVIDERS = [
  {
    id: 'demo',
    name: 'Demo data (no key required)',
    blurb: 'Deterministic synthetic prices so the dashboard works offline. Good for exploring; not for trading decisions.',
  },
  {
    id: 'alphavantage',
    name: 'Alpha Vantage',
    blurb: 'Optional fallback. Free API key at alphavantage.co; the free tier returns a compact daily history and is not suitable for deep Strategy Lab backtests. Responses are cached for the day.',
    keyField: 'alphaVantageKey',
    hasKey: 'alphavantage',
    keyLabel: 'Alpha Vantage API key',
  },
  {
    id: 'twelvedata',
    name: 'Twelve Data (recommended)',
    blurb: 'Create a free API key at twelvedata.com. Daily OHLCV with up to 5,000 records per request, suitable for the Strategy Lab; the Basic plan allows 800 credits/day and 8/minute. Responses are cached for the day.',
    keyField: 'twelveDataKey',
    hasKey: 'twelvedata',
    keyLabel: 'Twelve Data API key',
  },
];

export function renderSettings(root) {
  clear(root);
  const backend = isBackend();
  root.append(el('div', { class: 'view-head' },
    el('h1', {}, 'Settings'),
    el('p', { class: 'view-sub' }, backend
      ? 'Choose where price data comes from. Keys are stored in the local SQLite database (plaintext, gitignored) and sent only to the provider you select.'
      : 'Choose where price data comes from.')
  ));

  if (!backend) {
    root.append(el('div', { class: 'notice notice-warn' },
      el('strong', {}, 'Backend not running. '),
      'Live market data and weekly reports need the local server — run ',
      el('code', {}, 'npm run server'),
      ' and reload. Until then the dashboard uses demo data only.'
    ));
  }

  const card = el('div', { class: 'card' });
  root.append(card);

  function draw() {
    clear(card);
    const settings = getSettings();
    card.append(el('div', { class: 'card-head' }, el('h2', {}, 'Market data provider')));

    for (const p of PROVIDERS) {
      const selected = settings.provider === p.id;
      const disabled = !backend && p.id !== 'demo';
      const radio = el('input', {
        class: 'radio', type: 'radio', name: 'provider', id: 'prov-' + p.id,
        checked: selected || null,
        disabled: disabled || null,
        onchange: async () => {
          try {
            await updateSettings({ provider: p.id });
          } catch (err) {
            alert('Failed to switch provider: ' + err.message);
          }
          invalidate();
          draw();
        },
      });
      const block = el('div', { class: 'provider' + (selected ? ' provider-selected' : '') + (disabled ? ' provider-disabled' : '') },
        el('label', { class: 'provider-head', for: 'prov-' + p.id }, radio, el('strong', {}, p.name)),
        el('p', { class: 'provider-blurb' }, p.blurb + (disabled ? ' (Requires the backend.)' : '')),
      );
      // Both keys may be used when Twelve Data is selected: TSX symbols can
      // transparently fall back to Alpha Vantage on its free tier.
      if (p.keyField && backend) {
        const keySet = Boolean(settings.hasKeys?.[p.hasKey]);
        const keyInput = el('input', {
          class: 'input', type: 'password',
          placeholder: keySet ? 'Key saved on server — enter a new one to replace' : p.keyLabel,
          autocomplete: 'off',
        });
        const saved = el('span', { class: 'save-flash', role: 'status' }, keySet ? 'Key saved ✓' : '');
        block.append(el('div', { class: 'key-row' },
          keyInput,
          el('button', {
            class: 'btn btn-primary btn-sm',
            onclick: async () => {
              try {
                await updateSettings({ [p.keyField]: keyInput.value.trim() });
                invalidate();
                keyInput.value = '';
                draw();
              } catch (err) {
                saved.textContent = err.message;
              }
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
        onclick: async () => {
          if (backend) {
            try {
              await apiSend('POST', '/cache/clear');
            } catch (err) {
              alert('Failed to clear cache: ' + err.message);
              return;
            }
          }
          invalidate();
          alert('Price cache cleared. Data will be re-fetched on the next view.');
        },
      }, 'Clear price cache'),
    ));
  }

  draw();
}

// Trend Desk — entry point. Hash router + shell (sidebar nav, content pane).

import { el, clear } from './format.js';
import { initStore } from './store.js';
import { renderOverview } from './views/overview.js';
import { renderAnalysis } from './views/analysis.js';
import { renderPortfolio } from './views/portfolio.js';
import { renderReports } from './views/reports.js';
import { renderSettings } from './views/settings.js';

const VIEWS = {
  overview: { title: 'Overview', render: renderOverview, icon: '◈' },
  portfolio: { title: 'Positions', render: renderPortfolio, icon: '☰' },
  reports: { title: 'Weekly reports', render: renderReports, icon: '¶' },
  analysis: { title: 'Analysis', render: renderAnalysis, icon: '⌁', hidden: true },
  settings: { title: 'Settings', render: renderSettings, icon: '⚙' },
};

const app = document.getElementById('app');
const nav = el('nav', { class: 'nav', 'aria-label': 'Main' });
const content = el('main', { class: 'content', id: 'content' });

app.append(
  el('aside', { class: 'sidebar' },
    el('div', { class: 'brand' },
      el('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '▲'),
      el('span', {}, 'Trend', el('strong', {}, 'Desk'))
    ),
    nav,
    el('div', { class: 'sidebar-foot' },
      'Weekly trend analysis · decision support only, not financial advice.'
    )
  ),
  content
);

function parseHash() {
  const hash = location.hash.replace(/^#/, '') || 'overview';
  const [name, query] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { name: VIEWS[name] ? name : 'overview', params };
}

export function navigate(name, params = {}) {
  const query = new URLSearchParams(params).toString();
  location.hash = name + (query ? '?' + query : '');
}

let renderToken = 0;

async function route() {
  const { name, params } = parseHash();
  const view = VIEWS[name];

  clear(nav);
  for (const [key, v] of Object.entries(VIEWS)) {
    if (v.hidden) continue;
    nav.append(el('a', {
      class: 'nav-item' + (key === name ? ' nav-active' : ''),
      href: '#' + key,
      'aria-current': key === name ? 'page' : null,
    }, el('span', { class: 'nav-icon', 'aria-hidden': 'true' }, v.icon), v.title));
  }

  document.title = view.title + ' — Trend Desk';
  const token = ++renderToken;
  // Views render into a detached node first so a slow load never leaves a
  // half-cleared page; only the latest navigation wins.
  const pane = el('div', { class: 'view' });
  clear(content);
  content.append(pane);
  try {
    await view.render(pane, navigate, params);
  } catch (err) {
    if (token !== renderToken) return;
    clear(pane);
    pane.append(el('div', { class: 'empty-state' }, 'Something went wrong: ' + err.message));
    console.error(err);
  }
}

window.addEventListener('hashchange', route);
initStore().then(route, (err) => {
  clear(content);
  content.append(el('div', { class: 'empty-state' }, 'Failed to start: ' + err.message));
});

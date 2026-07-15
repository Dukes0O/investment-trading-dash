// Trade journal: log actual fills and measure them against the weekly plan
// that was live at the time of the trade.

import { el, clear, fmtMoney, fmtQty, fmtDate } from '../format.js';
import { getTrades, addTrade, removeTrade, getPositions } from '../store.js';
import { fetchReportIndex, fetchReport } from './reports.js';
import { fifoRealized, matchTradeToPlan } from '../journalmath.js';

export async function renderJournal(root, navigate) {
  clear(root);
  root.append(el('div', { class: 'view-head' },
    el('h1', {}, 'Trade journal'),
    el('p', { class: 'view-sub' }, 'Records your actual fills — not the plan — and checks each one against the weekly report that was live when you traded. Use it to see whether you\'re executing the plan or chasing the tape.')
  ));

  const formCard = el('div', { class: 'card' });
  const body = el('div', { class: 'loading' }, 'Loading journal…');
  root.append(formCard, body);

  // Report lookups are cached across redraws (e.g. after adding a trade) so
  // each report date is fetched at most once per view visit.
  let reportIndexCache = null;
  const reportCache = new Map();

  async function getIndex() {
    if (reportIndexCache) return reportIndexCache;
    try {
      reportIndexCache = await fetchReportIndex();
    } catch {
      reportIndexCache = [];
    }
    return reportIndexCache;
  }

  async function getReport(date) {
    if (reportCache.has(date)) return reportCache.get(date);
    let report = null;
    try {
      report = await fetchReport(date);
    } catch { /* leave null — treated as no-plan */ }
    reportCache.set(date, report);
    return report;
  }

  // For each trade, find the latest report dated on/before the trade's
  // executedAt, fetch it (once per date) and pull the symbol's plan entry.
  async function computeMatches(trades) {
    const index = await getIndex();
    const sorted = index.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const entryDateFor = new Map();
    for (const t of trades) {
      let entryDate = null;
      for (const e of sorted) {
        if (e.date <= t.executedAt) entryDate = e.date;
        else break;
      }
      entryDateFor.set(t.id, entryDate);
    }
    const neededDates = [...new Set([...entryDateFor.values()].filter(Boolean))];
    await Promise.all(neededDates.map(getReport));

    const matches = new Map();
    for (const t of trades) {
      const entryDate = entryDateFor.get(t.id);
      const report = entryDate ? reportCache.get(entryDate) : null;
      const planEntry = report?.symbols?.find((s) => s.symbol === t.symbol) || null;
      matches.set(t.id, matchTradeToPlan(t, planEntry));
    }
    return matches;
  }

  function drawForm() {
    clear(formCard);
    const symbol = input('text', 'e.g. AAPL, BMO:TSX, or ETH/CAD');
    symbol.style.textTransform = 'uppercase';
    const side = el('select', { class: 'input' },
      el('option', { value: 'buy' }, 'Buy'),
      el('option', { value: 'sell' }, 'Sell'));
    const qty = input('number', '');
    qty.step = 'any';
    qty.min = '0';
    const price = input('number', 'per share');
    price.step = 'any';
    price.min = '0';
    const executed = el('input', { class: 'input', type: 'date', value: todayISO() });
    const note = input('text', 'optional');
    const errBox = el('div', { class: 'form-error', role: 'alert' });

    const submit = async (e) => {
      e.preventDefault();
      clear(errBox);
      const sym = symbol.value.trim().toUpperCase();
      const q = parseFloat(qty.value);
      const p = parseFloat(price.value);
      const date = executed.value;
      if (!/^(?=.{1,20}$)[A-Z0-9.\-]+(?::[A-Z0-9.\-]+)?(?:\/[A-Z0-9.\-]+)?$/.test(sym)) {
        errBox.append('Enter a valid symbol (e.g. AAPL, BMO:TSX, or ETH/CAD).');
        return;
      }
      if (!isFinite(q) || q <= 0) { errBox.append('Quantity must be greater than zero.'); return; }
      if (!isFinite(p) || p <= 0) { errBox.append('Price must be greater than zero.'); return; }
      if (!date) { errBox.append('Executed date is required.'); return; }
      try {
        await addTrade({ symbol: sym, side: side.value, qty: q, price: p, executedAt: date, note: note.value.trim() });
      } catch (err) {
        errBox.append(err.message);
        return;
      }
      drawForm();
      await refresh();
    };

    formCard.append(
      el('div', { class: 'card-head' }, el('h2', {}, 'Log a fill')),
      el('form', { class: 'position-form', onsubmit: submit },
        field('Symbol', symbol),
        field('Side', side),
        field('Quantity', qty),
        field('Price', price),
        field('Executed', executed),
        field('Note', note, 'field-wide'),
        el('div', { class: 'form-actions' },
          el('button', { class: 'btn btn-primary', type: 'submit' }, 'Add trade'),
        ),
        errBox
      )
    );
  }

  async function refresh() {
    clear(body);
    body.className = 'loading';
    body.textContent = 'Loading journal…';

    const trades = getTrades();
    if (!trades.length) {
      clear(body);
      body.className = 'empty-state';
      body.append(
        el('p', {}, 'No trades logged yet.'),
        el('p', { class: 'view-sub' }, 'Log every fill above — the journal matches each one against the weekly report that was live at the time, so you can see whether you\'re following the plan or chasing the tape.')
      );
      return;
    }

    let matches;
    try {
      matches = await computeMatches(trades);
    } catch {
      matches = new Map(trades.map((t) => [t.id, matchTradeToPlan(t, null)]));
    }

    const { realizedPL, perSymbol } = fifoRealized(trades);

    const withPlan = trades.filter((t) => matches.get(t.id)?.status !== 'no-plan');
    const onPlanCount = withPlan.filter((t) => matches.get(t.id)?.status === 'on-plan').length;
    const onPlanPct = withPlan.length ? (onPlanCount / withPlan.length) * 100 : null;

    // ---- Drift: journal open qty vs recorded positions, per symbol ----
    const positions = getPositions();
    const symbols = new Set([...perSymbol.keys(), ...positions.map((p) => p.symbol)]);
    const drift = [];
    for (const sym of symbols) {
      const journalQty = perSymbol.get(sym)?.openQty ?? 0;
      const posQty = positions.filter((p) => p.symbol === sym).reduce((s, p) => s + p.qty, 0);
      if (Math.abs(journalQty - posQty) > 0.0001 && (journalQty !== 0 || posQty !== 0)) {
        drift.push({ symbol: sym, journalQty, posQty });
      }
    }

    clear(body);
    body.className = '';

    body.append(el('div', { class: 'tile-row' },
      tile('Realized P/L', fmtMoney(realizedPL, { sign: true }), 'closed lots, FIFO', '', realizedPL >= 0 ? 'delta-up' : 'delta-down'),
      tile('Total trades', String(trades.length)),
      tile('On-plan %', onPlanPct == null ? '—' : onPlanPct.toFixed(0) + '%', onPlanPct == null ? 'no trades matched to a report' : `${onPlanCount} of ${withPlan.length} matched trades`),
      tile('Open drift', drift.length ? String(drift.length) : '—', drift.length ? 'symbol(s) disagree with positions' : 'journal matches positions'),
    ));

    if (drift.length) {
      body.append(el('div', { class: 'notice notice-warn' },
        el('strong', {}, 'Journal vs positions drift. '),
        el('ul', { class: 'notice-list' }, drift.map((d) =>
          el('li', {}, `Journal shows ${fmtQty(d.journalQty)} sh of ${d.symbol}; positions record ${fmtQty(d.posQty)} — update one of them.`)
        ))
      ));
    }

    const tbody = el('tbody');
    for (const t of trades) {
      const match = matches.get(t.id) ?? matchTradeToPlan(t, null);
      tbody.append(el('tr', {},
        el('td', {}, fmtDate(t.executedAt)),
        el('td', {}, el('span', { class: 'sym' }, t.symbol)),
        el('td', {}, sideBadge(t.side)),
        el('td', { class: 'num' }, fmtQty(t.qty)),
        el('td', { class: 'num' }, fmtMoney(t.price)),
        el('td', { class: 'num' }, fmtMoney(t.qty * t.price)),
        el('td', {}, planCell(match)),
        el('td', { class: 'notes-cell' }, t.note || ''),
        el('td', { class: 'actions-cell' },
          el('button', {
            class: 'btn btn-ghost btn-sm btn-danger',
            onclick: async () => {
              if (confirm(`Remove this ${t.side} of ${fmtQty(t.qty)} ${t.symbol} from the journal?`)) {
                try {
                  await removeTrade(t.id);
                } catch (err) {
                  alert('Remove failed: ' + err.message);
                }
                await refresh();
              }
            },
          }, 'Remove'),
        ),
      ));
    }

    body.append(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', {}, `Trades (${trades.length})`)),
      el('div', { class: 'table-scroll' },
        el('table', { class: 'data-table' },
          el('thead', {}, el('tr', {},
            ['Date', 'Symbol', 'Side', 'Qty', 'Price', 'Value', 'Plan check', 'Note', ''].map((h, i) =>
              el('th', { class: i >= 3 && i <= 5 ? 'num' : '' }, h))
          )),
          tbody
        )
      )
    ));
  }

  function field(label, control, extra = '') {
    return el('label', { class: 'field ' + extra }, el('span', { class: 'field-label' }, label), control);
  }
  function input(type, placeholder) {
    return el('input', { class: 'input', type, placeholder });
  }

  drawForm();
  await refresh();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tile(label, value, sub, subClass = '', valueClass = '') {
  return el('div', { class: 'stat-tile' },
    el('div', { class: 'stat-label' }, label),
    el('div', { class: 'stat-value ' + valueClass }, value),
    sub ? el('div', { class: 'stat-sub ' + subClass }, sub) : null
  );
}

function sideBadge(side) {
  const isBuy = side === 'buy';
  return el('span', { class: 'badge ' + (isBuy ? 'badge-good' : 'badge-neutral') },
    el('span', { class: 'badge-dot', 'aria-hidden': 'true' }),
    side.toUpperCase());
}

function planLabel(status, detail) {
  switch (status) {
    case 'on-plan': return '✓ on plan';
    case 'against-plan': return '✗ against plan';
    case 'no-plan': return '— no plan';
    default: // off-plan
      if (detail.startsWith('Chased')) return '⚠ chased entry';
      if (detail === 'Plan said hold') return '⚠ plan said hold';
      return '⚠ off plan';
  }
}

function planCell(match) {
  const tone = { 'on-plan': 'good', 'off-plan': 'serious', 'against-plan': 'critical', 'no-plan': 'neutral' }[match.status];
  return el('div', {},
    el('span', { class: 'badge badge-' + tone, title: match.detail },
      el('span', { class: 'badge-dot', 'aria-hidden': 'true' }),
      planLabel(match.status, match.detail)),
    el('div', { class: 'trade-detail' }, match.detail)
  );
}

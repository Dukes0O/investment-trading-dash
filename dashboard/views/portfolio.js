// Portfolio management: add / edit / remove positions and watchlist entries.

import { el, clear, fmtMoney, fmtQty, fmtDate } from '../format.js';
import { getPositions, addPosition, updatePosition, removePosition } from '../store.js';

export function renderPortfolio(root, navigate) {
  clear(root);
  root.append(el('div', { class: 'view-head' },
    el('h1', {}, 'Positions'),
    el('p', { class: 'view-sub' }, 'Enter your holdings with quantity and cost basis. A quantity of 0 keeps the symbol on your watchlist for analysis without P/L tracking.')
  ));

  const formCard = el('div', { class: 'card' });
  const listCard = el('div', { class: 'card' });
  root.append(formCard, listCard);

  let editingId = null;

  function drawForm() {
    clear(formCard);
    const editing = editingId ? getPositions().find((p) => p.id === editingId) : null;

    const symbol = input('text', 'e.g. AAPL', editing?.symbol ?? '');
    symbol.style.textTransform = 'uppercase';
    const qty = input('number', '0 for watchlist', editing?.qty ?? '');
    qty.step = 'any';
    qty.min = '0';
    const cost = input('number', 'per share', editing?.costBasis || '');
    cost.step = 'any';
    cost.min = '0';
    const opened = input('date', '', editing?.openedAt ?? '');
    const notes = input('text', 'optional', editing?.notes ?? '');
    const errBox = el('div', { class: 'form-error', role: 'alert' });

    const submit = async (e) => {
      e.preventDefault();
      clear(errBox);
      const sym = symbol.value.trim().toUpperCase();
      const q = qty.value === '' ? 0 : parseFloat(qty.value);
      const c = cost.value === '' ? 0 : parseFloat(cost.value);
      if (!/^[A-Z.\-]{1,10}$/.test(sym)) {
        errBox.append('Enter a valid ticker symbol (letters, dots or dashes).');
        return;
      }
      if (!isFinite(q) || q < 0) { errBox.append('Quantity must be zero or positive.'); return; }
      if (q > 0 && (!isFinite(c) || c <= 0)) { errBox.append('A held position needs a cost basis per share.'); return; }
      const data = { symbol: sym, qty: q, costBasis: c, openedAt: opened.value || '', notes: notes.value.trim() };
      try {
        if (editing) await updatePosition(editing.id, data);
        else await addPosition(data);
      } catch (err) {
        errBox.append(err.message);
        return;
      }
      editingId = null;
      drawForm();
      drawList();
    };

    formCard.append(
      el('div', { class: 'card-head' }, el('h2', {}, editing ? 'Edit ' + editing.symbol : 'Add a position')),
      el('form', { class: 'position-form', onsubmit: submit },
        field('Symbol', symbol),
        field('Quantity', qty),
        field('Cost basis ($/share)', cost),
        field('Opened', opened),
        field('Notes', notes, 'field-wide'),
        el('div', { class: 'form-actions' },
          el('button', { class: 'btn btn-primary', type: 'submit' }, editing ? 'Save changes' : 'Add position'),
          editing ? el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { editingId = null; drawForm(); } }, 'Cancel') : null,
        ),
        errBox
      )
    );
    if (editing) symbol.focus();
  }

  function drawList() {
    clear(listCard);
    const positions = getPositions();
    listCard.append(el('div', { class: 'card-head' }, el('h2', {}, `Current entries (${positions.length})`)));
    if (!positions.length) {
      listCard.append(el('p', { class: 'empty-state' }, 'Nothing here yet — add a position above.'));
      return;
    }
    const tbody = el('tbody');
    for (const p of positions) {
      tbody.append(el('tr', {},
        el('td', {}, el('span', { class: 'sym' }, p.symbol), p.qty === 0 ? el('span', { class: 'watch-tag' }, 'watch') : null),
        el('td', { class: 'num' }, p.qty > 0 ? fmtQty(p.qty) : '—'),
        el('td', { class: 'num' }, p.qty > 0 ? fmtMoney(p.costBasis) : '—'),
        el('td', { class: 'num' }, p.qty > 0 && p.costBasis > 0 ? fmtMoney(p.qty * p.costBasis) : '—'),
        el('td', {}, p.openedAt ? fmtDate(p.openedAt) : '—'),
        el('td', { class: 'notes-cell' }, p.notes || ''),
        el('td', { class: 'actions-cell' },
          el('button', { class: 'btn btn-ghost btn-sm', onclick: () => navigate('analysis', { symbol: p.symbol }) }, 'Analyze'),
          el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { editingId = p.id; drawForm(); formCard.scrollIntoView({ behavior: 'smooth' }); } }, 'Edit'),
          el('button', {
            class: 'btn btn-ghost btn-sm btn-danger',
            onclick: async () => {
              if (confirm(`Remove ${p.symbol}${p.qty > 0 ? ` (${fmtQty(p.qty)} shares)` : ''} from the portfolio?`)) {
                if (editingId === p.id) { editingId = null; drawForm(); }
                try {
                  await removePosition(p.id);
                } catch (err) {
                  alert('Remove failed: ' + err.message);
                }
                drawList();
              }
            },
          }, 'Remove'),
        ),
      ));
    }
    listCard.append(el('div', { class: 'table-scroll' },
      el('table', { class: 'data-table' },
        el('thead', {}, el('tr', {},
          ['Symbol', 'Qty', 'Cost basis', 'Total cost', 'Opened', 'Notes', ''].map((h, i) =>
            el('th', { class: i >= 1 && i <= 3 ? 'num' : '' }, h))
        )),
        tbody
      )
    ));
  }

  function field(label, control, extra = '') {
    return el('label', { class: 'field ' + extra }, el('span', { class: 'field-label' }, label), control);
  }
  function input(type, placeholder, value) {
    return el('input', { class: 'input', type, placeholder, value: value === '' ? null : value });
  }

  drawForm();
  drawList();
}

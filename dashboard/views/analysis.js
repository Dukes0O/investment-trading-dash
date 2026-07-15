// Per-symbol work-up: price/RSI/MACD chart stack (weekly or daily), the
// decision panel with every scored reason, risk levels, and options strategies.

import { el, clear, fmtNum, fmtPct, fmtMoney, fmtDateShort } from '../format.js';
import { getPositions, getSettings, updateSettings } from '../store.js';
import { getMarket } from '../engine.js';
import { COLORS } from '../charts.js';
import { renderTradingChart } from '../tvchart.js';
import { optionsStrategies } from '../signals.js';
import { sma, rsi as rsiCalc, macd as macdCalc } from '../indicators.js';
import { decisionBadge, trendMeter, sourceNotice } from './shared.js';
import { latestReportEntry } from './reports.js';

export async function renderAnalysis(root, navigate, params) {
  clear(root);
  const symbol = (params.symbol || '').toUpperCase();
  if (!symbol) {
    root.append(el('p', { class: 'empty-state' }, 'No symbol selected.'));
    return;
  }

  root.append(el('div', { class: 'view-head' },
    el('div', { class: 'crumbs' },
      el('a', { href: '#overview', class: 'crumb-link' }, '← Overview'),
    ),
    el('h1', {}, symbol + ' — technical work-up'),
  ));

  const body = el('div', { class: 'loading' }, 'Loading ' + symbol + '…');
  root.append(body);

  let market;
  try {
    market = await getMarket(symbol);
  } catch (err) {
    clear(body);
    body.className = 'empty-state';
    body.append(el('p', {}, 'Failed to load data: ' + err.message));
    return;
  }
  const a = market.analysis;
  clear(body);
  body.className = '';
  if (!a) {
    body.append(el('p', { class: 'empty-state' }, 'Not enough history to analyze ' + symbol + '.'));
    return;
  }

  sourceNotice(body, new Map([[symbol, market]]));

  const sharesHeld = getPositions().filter((p) => p.symbol === symbol).reduce((s, p) => s + p.qty, 0);
  const dayPct = a.prevClose != null ? ((a.price - a.prevClose) / a.prevClose) * 100 : null;

  // ---- Header strip: price + decision + meter ----
  body.append(el('div', { class: 'analysis-strip' },
    el('div', { class: 'stat-tile' },
      el('div', { class: 'stat-label' }, 'Last close'),
      el('div', { class: 'stat-value' }, fmtNum(a.price)),
      el('div', { class: 'stat-sub ' + (dayPct >= 0 ? 'delta-up' : 'delta-down') }, fmtPct(dayPct) + ' on the day')
    ),
    el('div', { class: 'stat-tile' },
      el('div', { class: 'stat-label' }, 'Weekly decision'),
      el('div', { class: 'stat-value stat-badge' }, decisionBadge(a.decision)),
      trendMeter(a.score)
    ),
    el('div', { class: 'stat-tile' },
      el('div', { class: 'stat-label' }, '52-week range'),
      el('div', { class: 'stat-value stat-mid' }, fmtNum(a.range52.low) + ' – ' + fmtNum(a.range52.high)),
      el('div', { class: 'stat-sub' }, positionInRange(a))
    ),
    el('div', { class: 'stat-tile' },
      el('div', { class: 'stat-label' }, 'Volatility (HV20)'),
      el('div', { class: 'stat-value stat-mid' }, a.vol.hv20 != null ? a.vol.hv20.toFixed(1) + '%' : '—'),
      el('div', { class: 'stat-sub' }, a.vol.hvRank != null ? 'Rank ' + a.vol.hvRank.toFixed(0) + '/100 over 1y' : '')
    ),
  ));

  // ---- Latest weekly-report take on this symbol (when one covers it) ----
  const reportSlot = el('div');
  body.append(reportSlot);
  latestReportEntry().then((entry) => {
    const take = entry?.symbols?.find((s) => s.symbol === symbol);
    if (!take) return;
    const agrees = take.agreesWithRule;
    reportSlot.append(el('div', { class: 'notice ' + (agrees ? 'notice-info' : 'notice-warn') },
      el('strong', {}, 'Weekly report (' + entry.date + '): ' + String(take.llmVerdict).toUpperCase() + '. '),
      agrees
        ? `Agrees with the rule signal ${take.ruleAction} (${take.ruleScore >= 0 ? '+' : ''}${take.ruleScore}). `
        : `Overrides the rule signal ${take.ruleAction} (${take.ruleScore >= 0 ? '+' : ''}${take.ruleScore}). `,
      el('a', { href: '#reports?date=' + encodeURIComponent(entry.date) }, 'Read the full report →')
    ));
  });

  // ---- Chart card with timeframe + table toggle ----
  const chartArea = el('div', { class: 'chart-area' });
  let timeframe = 'weekly';
  let showTable = false;

  const tfBtns = {};
  const controls = el('div', { class: 'chart-controls' },
    el('div', { class: 'seg' },
      tfBtns.weekly = segBtn('Weekly', () => setTf('weekly')),
      tfBtns.daily = segBtn('Daily', () => setTf('daily')),
    ),
    el('button', {
      class: 'btn btn-ghost btn-sm',
      onclick: () => { showTable = !showTable; draw(); },
      'aria-pressed': 'false',
    }, 'Table view')
  );

  const chartCard = el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h2', {}, 'Price & momentum'), controls),
    chartArea
  );
  body.append(chartCard);

  function segBtn(label, onclick) {
    return el('button', { class: 'seg-btn', onclick }, label);
  }
  function setTf(tf) {
    timeframe = tf;
    draw();
  }

  let disposeChart = null;

  function draw() {
    tfBtns.weekly.classList.toggle('seg-active', timeframe === 'weekly');
    tfBtns.daily.classList.toggle('seg-active', timeframe === 'daily');
    if (disposeChart) { disposeChart(); disposeChart = null; }
    clear(chartArea);

    let bars;
    let overlays;
    if (timeframe === 'weekly') {
      bars = a.weeklyBars.slice(-104);
      const off = a.weeklyBars.length - bars.length;
      overlays = [
        { name: '10-wk MA', color: COLORS.series1, values: a.weekly.sma10.slice(off) },
        { name: '30-wk MA', color: COLORS.series2, values: a.weekly.sma30.slice(off) },
        { name: '40-wk MA', color: COLORS.series3, values: a.weekly.sma40.slice(off) },
      ];
    } else {
      bars = a.daily.bars.slice(-130);
      const off = a.daily.bars.length - bars.length;
      overlays = [
        { name: '20-day MA', color: COLORS.series1, values: a.daily.sma20.slice(off) },
        { name: '50-day MA', color: COLORS.series2, values: a.daily.sma50.slice(off) },
        { name: '200-day MA', color: COLORS.series3, values: a.daily.sma200.slice(off) },
      ];
    }

    const closes = bars.map((b) => b.close);
    const rsiVals = rsiCalc(closes, 14);
    const macdVals = macdCalc(closes);

    if (showTable) {
      chartArea.append(dataTable(bars, overlays, rsiVals, macdVals));
      return;
    }

    disposeChart = renderTradingChart(chartArea, bars, {
      overlays,
      rsi: rsiVals,
      macd: macdVals,
      ariaLabel: symbol + ' ' + timeframe + ' candlestick chart with moving averages, RSI and MACD',
    });
  }
  draw();

  // ---- Decision panel ----
  const reasonList = el('ul', { class: 'reason-list' },
    a.reasons.map((r) =>
      el('li', { class: 'reason ' + (r.bullish ? 'reason-bull' : 'reason-bear') },
        el('span', { class: 'reason-pts' }, (r.points > 0 ? '+' : '') + r.points),
        r.text
      )
    )
  );
  const notesBlock = a.notes.length
    ? el('div', { class: 'notes' },
        el('h3', {}, 'Timing notes'),
        el('ul', {}, a.notes.map((n) => el('li', {}, n))))
    : null;

  body.append(el('div', { class: 'two-col' },
    el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', {}, 'Why: signal breakdown')),
      el('p', { class: 'card-lede' }, a.decision.summary),
      reasonList,
      notesBlock
    ),
    el('div', {},
      el('div', { class: 'card' },
        el('div', { class: 'card-head' }, el('h2', {}, 'Position management')),
        riskBlock(a, sharesHeld)
      ),
      sizingCard(a)
    )
  ));

  // ---- Options strategies ----
  if (symbol.includes('/')) {
    body.append(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', {}, 'Options strategy ideas')),
      el('p', { class: 'card-lede' }, 'Options ideas are omitted for crypto pairs. The trend, risk, and position-sizing analysis above still applies.'),
      el('p', { class: 'disclaimer' },
        'Analytics are computed from historical prices and simple rules; they are decision support, not financial advice.')
    ));
  } else {
    const opt = optionsStrategies(a, sharesHeld, symbol);
    body.append(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', {}, 'Options strategy ideas')),
      el('p', { class: 'card-lede' }, opt.volNote + (sharesHeld >= 100
        ? ` You hold ${sharesHeld} shares (${Math.floor(sharesHeld / 100)} covered lot${Math.floor(sharesHeld / 100) > 1 ? 's' : ''}).`
        : sharesHeld > 0
          ? ` You hold ${sharesHeld} shares — under 100, so covered strategies aren't available yet.`
          : '')),
      el('div', { class: 'strategy-grid' },
        opt.strategies.map((s) =>
          el('div', { class: 'strategy-card' },
            el('h3', {}, s.name),
            el('div', { class: 'strategy-fit' }, s.fit),
            el('p', {}, el('strong', {}, 'Setup: '), s.setup),
            el('p', { class: 'strategy-why' }, s.why)
          )
        )
      ),
      el('p', { class: 'disclaimer' },
        'Analytics are computed from historical prices and simple rules; they are decision support, not financial advice. Options involve substantial risk — verify strikes, deltas and implied volatility with your broker before trading.')
    ));
  }
}

function positionInRange(a) {
  const { low, high } = a.range52;
  if (low == null || high == null || high === low) return '';
  const pct = ((a.price - low) / (high - low)) * 100;
  return pct.toFixed(0) + '% of the range';
}

function riskBlock(a, sharesHeld) {
  if (!a.risk) return el('p', {}, 'Not enough data for risk levels.');
  const rows = [
    ['ATR (14-day)', fmtNum(a.risk.atr) + ' (' + a.risk.atrPct.toFixed(1) + '% of price)'],
    ['Suggested stop (2.5 × ATR)', fmtNum(a.risk.suggestedStop)],
    ['Trailing stop (max of stop, 50-day MA)', fmtNum(a.risk.trailingStop)],
  ];
  if (sharesHeld > 0) {
    const riskPerShare = a.price - a.risk.suggestedStop;
    rows.push(['Open risk at stop (' + sharesHeld + ' sh)', fmtMoney(riskPerShare * sharesHeld)]);
  }
  return el('div', {},
    el('table', { class: 'kv-table' },
      el('tbody', {}, rows.map(([k, v]) => el('tr', {}, el('td', {}, k), el('td', { class: 'num' }, v))))
    ),
    el('p', { class: 'card-note' },
      'Trend-trading exits: honor the stop without negotiation; trail it up as the 50-day MA rises. Position size so a stop-out costs ≤1–2% of the account.')
  );
}

function sizingField(label, control) {
  return el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), control);
}

function sizingCard(a) {
  const settings = getSettings();
  const accountInput = el('input', {
    class: 'input', type: 'number', min: '0', step: 'any', placeholder: 'e.g. 50000',
    value: settings.accountSize ? settings.accountSize : '',
  });
  const riskInput = el('input', {
    class: 'input', type: 'number', min: '0', step: 'any',
    value: settings.riskPct || 1,
  });
  const entryInput = el('input', {
    class: 'input', type: 'number', min: '0', step: 'any',
    value: a.price != null ? a.price : '',
  });
  const stopInput = el('input', {
    class: 'input', type: 'number', min: '0', step: 'any',
    value: a.risk?.suggestedStop != null ? a.risk.suggestedStop.toFixed(2) : '',
  });
  const output = el('div');
  const saveFlash = el('span', { class: 'save-flash', role: 'status' });

  function recompute() {
    clear(output);
    const account = parseFloat(accountInput.value);
    const riskPct = parseFloat(riskInput.value);
    const entry = parseFloat(entryInput.value);
    const stop = parseFloat(stopInput.value);

    if (!isFinite(entry) || !isFinite(stop)) {
      output.append(el('p', { class: 'card-note' }, 'Enter an entry price and a stop to size the position.'));
      return;
    }
    if (stop >= entry) {
      output.append(el('p', { class: 'form-error' }, 'Stop must be below entry for a long position.'));
      return;
    }
    if (!isFinite(account) || account <= 0 || !isFinite(riskPct) || riskPct <= 0) {
      output.append(el('p', { class: 'card-note' }, 'Enter an account size and risk % above to size the position.'));
      return;
    }

    const riskDollars = account * (riskPct / 100);
    const perShareRisk = entry - stop;
    const shares = Math.floor(riskDollars / perShareRisk);
    const cost = shares * entry;
    const pctOfAccount = (cost / account) * 100;

    const rows = [
      ['Risk budget ($)', fmtMoney(riskDollars), false],
      ['Risk per share', fmtMoney(perShareRisk), false],
      ['Shares to buy', String(shares), true],
      ['Position cost', fmtMoney(cost), false],
      ['% of account', pctOfAccount.toFixed(1) + '%', false],
    ];
    output.append(el('table', { class: 'kv-table' },
      el('tbody', {}, rows.map(([k, v, strong]) =>
        el('tr', {}, el('td', {}, k), el('td', { class: 'num' }, strong ? el('strong', { class: 'sizing-shares' }, v) : v))
      ))
    ));

    if (cost > account) {
      const cappedShares = Math.floor(account / entry);
      output.append(el('p', { class: 'notice notice-warn' },
        `Position cost exceeds the account — size is capped by capital, not risk. Capped shares: ${cappedShares}.`));
    }
  }

  let flashTimer = null;
  async function persist() {
    const patch = {};
    const account = parseFloat(accountInput.value);
    const riskPct = parseFloat(riskInput.value);
    if (isFinite(account) && account >= 0) patch.accountSize = account;
    if (isFinite(riskPct) && riskPct > 0 && riskPct <= 10) patch.riskPct = riskPct;
    if (!Object.keys(patch).length) return;
    try {
      await updateSettings(patch);
      saveFlash.textContent = 'saved ✓';
    } catch (err) {
      saveFlash.textContent = err.message;
    }
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { saveFlash.textContent = ''; }, 2500);
  }

  for (const inp of [accountInput, riskInput, entryInput, stopInput]) inp.addEventListener('input', recompute);
  accountInput.addEventListener('change', persist);
  riskInput.addEventListener('change', persist);

  recompute();

  return el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h2', {}, 'Position sizing'), saveFlash),
    el('div', { class: 'position-form' },
      sizingField('Account size ($)', accountInput),
      sizingField('Risk per trade (%)', riskInput),
      sizingField('Entry price', entryInput),
      sizingField('Stop', stopInput),
    ),
    output,
    el('p', { class: 'card-note' }, 'Risk 1–2% per position. The stop is the dossier\'s 2.5×ATR suggestion — tighten it only with a structural reason.')
  );
}

function dataTable(bars, overlays, rsiVals, macdVals) {
  const recent = bars.slice(-30);
  const off = bars.length - recent.length;
  const head = ['Date', 'Open', 'High', 'Low', 'Close', ...overlays.map((o) => o.name), 'RSI', 'MACD'];
  return el('div', { class: 'table-scroll' },
    el('table', { class: 'data-table' },
      el('thead', {}, el('tr', {}, head.map((h, i) => el('th', { class: i > 0 ? 'num' : '' }, h)))),
      el('tbody', {}, recent.map((b, i) =>
        el('tr', {},
          el('td', {}, fmtDateShort(b.date) + ', ' + b.date.slice(0, 4)),
          el('td', { class: 'num' }, fmtNum(b.open)),
          el('td', { class: 'num' }, fmtNum(b.high)),
          el('td', { class: 'num' }, fmtNum(b.low)),
          el('td', { class: 'num' }, fmtNum(b.close)),
          overlays.map((o) => el('td', { class: 'num' }, o.values[off + i] != null ? fmtNum(o.values[off + i]) : '—')),
          el('td', { class: 'num' }, rsiVals[off + i] != null ? rsiVals[off + i].toFixed(1) : '—'),
          el('td', { class: 'num' }, macdVals.line[off + i] != null ? fmtNum(macdVals.line[off + i]) : '—'),
        )
      ))
    )
  );
}

// Pure trade-journal math: FIFO realized P/L and plan-matching. No imports,
// no DOM, no store — deterministic functions the views (and unit tests) call.

// ---- FIFO realized P/L -----------------------------------------------

// trades: [{ id, symbol, side: 'buy'|'sell', qty, price, executedAt, note }]
// in any order. Returns:
//   { realizedPL, perSymbol: Map<symbol, { realizedPL, openQty, avgCost }>,
//     unmatchedSells: [{ tradeId, symbol, qty }] }
export function fifoRealized(trades) {
  const bySymbol = new Map();
  trades.forEach((t, i) => {
    if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []);
    bySymbol.get(t.symbol).push({ ...t, _i: i });
  });

  let realizedPL = 0;
  const perSymbol = new Map();
  const unmatchedSells = [];

  for (const [symbol, symTrades] of bySymbol) {
    // Chronological: executedAt, then createdAt (entry order — the input
    // array is usually newest-first, so raw array order must NOT decide
    // same-day ties), then input index as a last resort.
    symTrades.sort((a, b) => {
      if (a.executedAt < b.executedAt) return -1;
      if (a.executedAt > b.executedAt) return 1;
      const ca = a.createdAt ?? '';
      const cb = b.createdAt ?? '';
      if (ca < cb) return -1;
      if (ca > cb) return 1;
      return a._i - b._i;
    });

    const lots = []; // { qty, price }
    let symRealized = 0;

    for (const t of symTrades) {
      if (t.side === 'buy') {
        lots.push({ qty: t.qty, price: t.price });
      } else if (t.side === 'sell') {
        let remaining = t.qty;
        while (remaining > 0 && lots.length) {
          const lot = lots[0];
          const consumed = Math.min(lot.qty, remaining);
          symRealized += consumed * (t.price - lot.price);
          lot.qty -= consumed;
          remaining -= consumed;
          if (lot.qty <= 0) lots.shift();
        }
        if (remaining > 0) {
          unmatchedSells.push({ tradeId: t.id, symbol, qty: remaining });
        }
      }
    }

    const openQty = lots.reduce((s, l) => s + l.qty, 0);
    const costSum = lots.reduce((s, l) => s + l.qty * l.price, 0);
    const avgCost = openQty > 0 ? costSum / openQty : 0;

    perSymbol.set(symbol, { realizedPL: symRealized, openQty, avgCost });
    realizedPL += symRealized;
  }

  return { realizedPL, perSymbol, unmatchedSells };
}

// ---- Plan matching -----------------------------------------------------

const BUY_LIKE = ['buy', 'add'];
const HOLD_LIKE = ['hold'];
const EXIT_LIKE = ['trim', 'exit', 'avoid'];

// trade: { symbol, side, price, ... }
// planEntry: the report's symbol entry active at trade time, or null:
//   { llmVerdict, tradePlan: { action, entryZone: {low, high} | null, stop } }
export function matchTradeToPlan(trade, planEntry) {
  if (!planEntry) {
    return { status: 'no-plan', detail: `No report covered ${trade.symbol} at trade time` };
  }

  const rawAction = planEntry.tradePlan?.action || planEntry.llmVerdict || '';
  const action = String(rawAction).toLowerCase();
  const entryZone = planEntry.tradePlan?.entryZone;

  const chased = entryZone && trade.price > entryZone.high * 1.01;
  const insideZone = entryZone && trade.price <= entryZone.high * 1.01;

  if (trade.side === 'buy') {
    if (BUY_LIKE.includes(action)) {
      if (chased) {
        return {
          status: 'off-plan',
          detail: `Chased above the entry zone (paid ${fmt(trade.price)} vs ${fmt(entryZone.low)}–${fmt(entryZone.high)})`,
        };
      }
      return {
        status: 'on-plan',
        detail: entryZone ? 'Within the planned entry zone' : 'Plan called for buying',
      };
    }
    if (HOLD_LIKE.includes(action)) {
      // Reports use "hold + entry zone" for conditional plans ("initiate only
      // at the trigger level") — a buy inside that zone is following the plan.
      if (insideZone) {
        return { status: 'on-plan', detail: `Conditional entry taken inside the planned zone (${fmt(entryZone.low)}–${fmt(entryZone.high)})` };
      }
      if (chased) {
        return { status: 'off-plan', detail: `Chased above the entry zone (paid ${fmt(trade.price)} vs ${fmt(entryZone.low)}–${fmt(entryZone.high)})` };
      }
      return { status: 'off-plan', detail: 'Plan said hold' };
    }
    if (EXIT_LIKE.includes(action)) {
      return { status: 'against-plan', detail: `Plan said ${rawAction.toUpperCase()}` };
    }
    return { status: 'off-plan', detail: `Plan said ${rawAction.toUpperCase() || 'nothing recognizable'}` };
  }

  // sell
  if (EXIT_LIKE.includes(action)) {
    return { status: 'on-plan', detail: `Plan said ${rawAction.toUpperCase()}` };
  }
  if (HOLD_LIKE.includes(action)) {
    return { status: 'off-plan', detail: 'Plan said hold' };
  }
  if (BUY_LIKE.includes(action)) {
    return { status: 'against-plan', detail: `Plan said ${rawAction.toUpperCase()}` };
  }
  return { status: 'off-plan', detail: `Plan said ${rawAction.toUpperCase() || 'nothing recognizable'}` };
}

function fmt(v) {
  return (Math.round(v * 100) / 100).toFixed(2);
}

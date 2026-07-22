from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date

from trendlab.features.weekly import wilder_atr
from trendlab.models import Bar
from trendlab.states.trend30w import Trend30Week


@dataclass(frozen=True, slots=True)
class Trade:
    entry_date: str
    exit_date: str
    entry_price: float
    exit_price: float
    return_pct: float
    reason: str


@dataclass(frozen=True, slots=True)
class EquityPoint:
    date: str
    value: float
    in_market: bool


@dataclass(frozen=True, slots=True)
class BacktestResult:
    trades: tuple[Trade, ...]
    equity: tuple[EquityPoint, ...]
    metrics: dict[str, float | int | None]

    def to_dict(self) -> dict[str, object]:
        return {
            "trades": [asdict(item) for item in self.trades],
            "equity": [asdict(item) for item in self.equity],
            "metrics": self.metrics,
        }


def simulate(
    bars: list[Bar],
    strategy: Trend30Week,
    *,
    commission_bps_per_side: float = 0.0,
    slippage_bps_per_side: float = 5.0,
    stop_atr_multiple: float | None = None,
    evaluation_start: date | None = None,
    evaluation_end: date | None = None,
    include_distributions: bool = True,
    finalize_equity_on_end: bool = True,
    trade_rounding_digits: int = 8,
    start_flat_at_evaluation: bool = False,
) -> BacktestResult:
    if len(bars) - max(strategy.warmup, 1) < 30:
        raise ValueError("not enough history for backtest")
    context = strategy.prepare(bars)
    atr = wilder_atr(bars)
    side_cost = (commission_bps_per_side + slippage_bps_per_side) / 10_000
    cash = 1.0
    shares = 0.0
    entry_price = 0.0
    entry_equity = 0.0
    entry_index = 0
    stop_price: float | None = None
    pending_entry = False
    pending_exit = False
    trades: list[Trade] = []
    equity: list[EquityPoint] = []

    def in_window(value: date) -> bool:
        return (evaluation_start is None or value >= evaluation_start) and (evaluation_end is None or value <= evaluation_end)

    def close(price: float, index: int, reason: str) -> None:
        nonlocal cash, shares, stop_price
        fill = price * (1 - side_cost)
        cash += shares * fill
        ret = cash / entry_equity - 1
        trade = Trade(
            bars[entry_index].date.isoformat(), bars[index].date.isoformat(),
            round(entry_price, trade_rounding_digits), round(fill, trade_rounding_digits),
            round(ret * 100, trade_rounding_digits), reason,
        )
        if in_window(bars[index].date) or (evaluation_start is not None and bars[entry_index].date >= evaluation_start):
            trades.append(trade)
        shares = 0.0
        stop_price = None

    start_index = max(strategy.warmup, 1)
    if start_flat_at_evaluation and evaluation_start is not None:
        start_index = max(
            start_index,
            next((index for index, bar in enumerate(bars) if bar.date >= evaluation_start), len(bars)),
        )

    for index in range(start_index, len(bars)):
        bar = bars[index]
        if evaluation_end is not None and bar.date > evaluation_end:
            break
        # Corporate actions belong to holders from the prior close. Apply them
        # before executing this session's pending open orders.
        if shares > 0 and bar.split_factor != 1:
            shares *= bar.split_factor
            if stop_price is not None:
                stop_price /= bar.split_factor
        if shares > 0 and include_distributions and bar.div_cash:
            cash += shares * bar.div_cash
        if pending_entry and shares == 0:
            entry_equity = cash
            entry_price = bar.open * (1 + side_cost)
            shares = cash / entry_price
            cash = 0.0
            entry_index = index
            if stop_atr_multiple is not None and atr[index] is not None:
                stop_price = bar.open - stop_atr_multiple * float(atr[index])
            pending_entry = False
        elif pending_exit and shares > 0:
            close(bar.open, index, "signal")
            pending_exit = False

        if shares > 0 and stop_price is not None and bar.low <= stop_price:
            close(min(stop_price, bar.open), index, "stop")

        if shares > 0:
            if strategy.exit(index, context):
                pending_exit = True
        elif strategy.entry(index, context):
            pending_entry = True

        if in_window(bar.date):
            equity.append(EquityPoint(bar.date.isoformat(), cash + shares * bar.close, shares > 0))

    if shares > 0:
        last_index = min(len(bars) - 1, next((i - 1 for i, bar in enumerate(bars) if evaluation_end and bar.date > evaluation_end), len(bars) - 1))
        close(bars[last_index].close, last_index, "end")
        if finalize_equity_on_end and equity and equity[-1].date == bars[last_index].date.isoformat():
            equity[-1] = EquityPoint(equity[-1].date, cash, False)
    return BacktestResult(tuple(trades), tuple(equity), compute_metrics(equity, trades))


def compute_metrics(equity: list[EquityPoint], trades: list[Trade]) -> dict[str, float | int | None]:
    if not equity:
        return {"totalReturnPct": None, "cagrPct": None, "maxDrawdownPct": None, "years": 0.0, "trades": 0}
    base = equity[0].value
    values = [point.value / base for point in equity]
    years = len(values) / 252
    peak = values[0]
    max_drawdown = 0.0
    for value in values:
        peak = max(peak, value)
        max_drawdown = max(max_drawdown, (peak - value) / peak)
    wins = sum(trade.return_pct > 0 for trade in trades)
    return {
        "totalReturnPct": round((values[-1] - 1) * 100, 2),
        "cagrPct": round((values[-1] ** (1 / years) - 1) * 100, 2) if years > 0.2 else None,
        "maxDrawdownPct": round(max_drawdown * 100, 2),
        "years": round(years, 2),
        "trades": len(trades),
        "winRatePct": round(wins / len(trades) * 100, 2) if trades else None,
        "avgTradePct": round(sum(trade.return_pct for trade in trades) / len(trades), 2) if trades else None,
        "exposurePct": round(sum(point.in_market for point in equity) / len(equity) * 100, 2),
    }


def buy_and_hold(
    bars: list[Bar], *, evaluation_start: date, evaluation_end: date,
    commission_bps_per_side: float = 0.0, slippage_bps_per_side: float = 5.0,
) -> BacktestResult:
    window = [bar for bar in bars if evaluation_start <= bar.date <= evaluation_end]
    if len(window) < 2:
        raise ValueError("not enough bars for buy-and-hold baseline")
    side_cost = (commission_bps_per_side + slippage_bps_per_side) / 10_000
    entry_price = window[0].open * (1 + side_cost)
    shares = 1.0 / entry_price
    cash = 0.0
    equity: list[EquityPoint] = []
    for index, bar in enumerate(window):
        if index > 0 and bar.split_factor != 1:
            shares *= bar.split_factor
        if index > 0 and bar.div_cash:
            cash += shares * bar.div_cash
        equity.append(EquityPoint(bar.date.isoformat(), cash + shares * bar.close, True))
    exit_price = window[-1].close * (1 - side_cost)
    final_value = cash + shares * exit_price
    equity[-1] = EquityPoint(equity[-1].date, final_value, False)
    trade = Trade(
        window[0].date.isoformat(), window[-1].date.isoformat(),
        round(entry_price, 8), round(exit_price, 8), round((final_value - 1) * 100, 8), "end",
    )
    return BacktestResult((trade,), tuple(equity), compute_metrics(equity, [trade]))


def cash_baseline(bars: list[Bar], *, evaluation_start: date, evaluation_end: date) -> BacktestResult:
    window = [bar for bar in bars if evaluation_start <= bar.date <= evaluation_end]
    equity = [EquityPoint(bar.date.isoformat(), 1.0, False) for bar in window]
    return BacktestResult((), tuple(equity), compute_metrics(equity, []))

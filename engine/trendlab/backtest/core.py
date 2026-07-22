from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
from math import sqrt
from statistics import mean, stdev
from typing import Any

from trendlab.features.weekly import wilder_atr
from trendlab.models import Bar


@dataclass(frozen=True, slots=True)
class Trade:
    entry_date: str
    exit_date: str
    entry_price: float
    exit_price: float
    return_pct: float
    reason: str
    direction: str = "long"
    pnl: float = 0.0
    borrow_cost: float = 0.0


@dataclass(frozen=True, slots=True)
class EquityPoint:
    date: str
    value: float
    in_market: bool
    position: str = "flat"


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
    strategy: Any,
    *,
    commission_bps_per_side: float = 0.0,
    slippage_bps_per_side: float = 5.0,
    stop_atr_multiple: float | None = None,
    short_borrow_bps_per_year: float = 0.0,
    evaluation_start: date | None = None,
    evaluation_end: date | None = None,
    include_distributions: bool = True,
    finalize_equity_on_end: bool = True,
    trade_rounding_digits: int = 8,
    start_flat_at_evaluation: bool = False,
) -> BacktestResult:
    """Simulate a next-open long/flat or long/flat/short strategy.

    A strategy may expose ``target(index, context, current_position)`` and
    return -1, 0, or 1. Legacy long-only strategies continue to use
    ``entry``/``exit``. Stops are optional so the registered 30-week
    baselines remain unchanged.
    """
    if len(bars) - max(strategy.warmup, 1) < 30:
        raise ValueError("not enough history for backtest")
    if short_borrow_bps_per_year < 0:
        raise ValueError("short borrow cost cannot be negative")
    context = strategy.prepare(bars)
    atr = wilder_atr(bars)
    side_cost = (commission_bps_per_side + slippage_bps_per_side) / 10_000
    borrow_rate = short_borrow_bps_per_year / 10_000 / 365
    cash = 1.0
    shares = 0.0
    entry_price = 0.0
    entry_equity = 0.0
    entry_index = 0
    entry_borrow_cost = 0.0
    cumulative_borrow_cost = 0.0
    stop_price: float | None = None
    pending_target: int | None = None
    trades: list[Trade] = []
    equity: list[EquityPoint] = []

    def in_window(value: date) -> bool:
        return (evaluation_start is None or value >= evaluation_start) and (evaluation_end is None or value <= evaluation_end)

    def position() -> int:
        return 1 if shares > 0 else -1 if shares < 0 else 0

    def close_position(price: float, index: int, reason: str) -> None:
        nonlocal cash, shares, stop_price
        direction = "long" if shares > 0 else "short"
        fill = price * (1 - side_cost if shares > 0 else 1 + side_cost)
        cash += shares * fill
        ret = cash / entry_equity - 1
        trade = Trade(
            bars[entry_index].date.isoformat(), bars[index].date.isoformat(),
            round(entry_price, trade_rounding_digits), round(fill, trade_rounding_digits),
            round(ret * 100, trade_rounding_digits), reason, direction,
            round(cash - entry_equity, trade_rounding_digits),
            round(cumulative_borrow_cost - entry_borrow_cost, trade_rounding_digits),
        )
        if in_window(bars[index].date) or (evaluation_start is not None and bars[entry_index].date >= evaluation_start):
            trades.append(trade)
        shares = 0.0
        stop_price = None

    def open_position(target: int, index: int) -> None:
        nonlocal cash, shares, entry_price, entry_equity, entry_index, entry_borrow_cost, stop_price
        entry_equity = cash
        entry_index = index
        entry_borrow_cost = cumulative_borrow_cost
        if target == 1:
            entry_price = bars[index].open * (1 + side_cost)
            shares = cash / entry_price
            cash = 0.0
            if stop_atr_multiple is not None and atr[index] is not None:
                stop_price = bars[index].open - stop_atr_multiple * float(atr[index])
        elif target == -1:
            entry_price = bars[index].open * (1 - side_cost)
            shares = -cash / entry_price
            cash -= shares * entry_price
            if stop_atr_multiple is not None and atr[index] is not None:
                stop_price = bars[index].open + stop_atr_multiple * float(atr[index])
        else:
            raise ValueError("position target must be -1 or 1")

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

        # Borrow is owed for calendar time carried since the prior session.
        if shares < 0 and index > 0 and borrow_rate:
            elapsed_days = (bar.date - bars[index - 1].date).days
            charge = abs(shares) * bars[index - 1].close * borrow_rate * elapsed_days
            cash -= charge
            cumulative_borrow_cost += charge

        # Corporate actions belong to holders from the prior close. Apply them
        # before executing this session's pending open orders. Shorts owe cash
        # distributions because their share count is negative.
        if shares != 0 and bar.split_factor != 1:
            shares *= bar.split_factor
            if stop_price is not None:
                stop_price /= bar.split_factor
        if shares != 0 and include_distributions and bar.div_cash:
            cash += shares * bar.div_cash

        if pending_target is not None:
            if position() != pending_target:
                if shares != 0:
                    close_position(bar.open, index, "signal")
                if pending_target != 0:
                    open_position(pending_target, index)
            pending_target = None

        if shares > 0 and stop_price is not None and bar.low <= stop_price:
            close_position(min(stop_price, bar.open), index, "stop")
        elif shares < 0 and stop_price is not None and bar.high >= stop_price:
            close_position(max(stop_price, bar.open), index, "stop")

        current = position()
        target_method = getattr(strategy, "target", None)
        if callable(target_method):
            target = int(target_method(index, context, current))
            if target not in {-1, 0, 1}:
                raise ValueError("strategy target must be -1, 0, or 1")
            if target != current:
                pending_target = target
        elif current > 0 and strategy.exit(index, context):
            pending_target = 0
        elif current == 0 and strategy.entry(index, context):
            pending_target = 1

        if in_window(bar.date):
            current = position()
            label = "long" if current > 0 else "short" if current < 0 else "flat"
            equity.append(EquityPoint(bar.date.isoformat(), cash + shares * bar.close, current != 0, label))

    if shares != 0:
        last_index = min(len(bars) - 1, next((i - 1 for i, bar in enumerate(bars) if evaluation_end and bar.date > evaluation_end), len(bars) - 1))
        close_position(bars[last_index].close, last_index, "end")
        if finalize_equity_on_end and equity and equity[-1].date == bars[last_index].date.isoformat():
            equity[-1] = EquityPoint(equity[-1].date, cash, False, "flat")
    return BacktestResult(tuple(trades), tuple(equity), compute_metrics(equity, trades))


def compute_metrics(equity: list[EquityPoint], trades: list[Trade]) -> dict[str, float | int | None]:
    if not equity:
        return {
            "totalReturnPct": None, "cagrPct": None, "maxDrawdownPct": None,
            "years": 0.0, "trades": 0, "sharpeRatio": None,
        }
    base = equity[0].value
    values = [point.value / base for point in equity]
    years = len(values) / 252
    peak = values[0]
    max_drawdown = 0.0
    for value in values:
        peak = max(peak, value)
        max_drawdown = max(max_drawdown, (peak - value) / peak)
    daily_returns = [values[index] / values[index - 1] - 1 for index in range(1, len(values)) if values[index - 1] > 0]
    sharpe = None
    if len(daily_returns) > 1 and stdev(daily_returns) > 0:
        sharpe = round(mean(daily_returns) / stdev(daily_returns) * sqrt(252), 3)
    wins = sum(trade.return_pct > 0 for trade in trades)
    long_pnl = sum(trade.pnl for trade in trades if trade.direction == "long")
    short_pnl = sum(trade.pnl for trade in trades if trade.direction == "short")
    borrow = sum(trade.borrow_cost for trade in trades)
    return {
        "totalReturnPct": round((values[-1] - 1) * 100, 2),
        "cagrPct": round((values[-1] ** (1 / years) - 1) * 100, 2) if years > 0.2 and values[-1] > 0 else None,
        "maxDrawdownPct": round(max_drawdown * 100, 2),
        "years": round(years, 2),
        "trades": len(trades),
        "winRatePct": round(wins / len(trades) * 100, 2) if trades else None,
        "avgTradePct": round(sum(trade.return_pct for trade in trades) / len(trades), 2) if trades else None,
        "exposurePct": round(sum(point.in_market for point in equity) / len(equity) * 100, 2),
        "longExposurePct": round(sum(point.position == "long" for point in equity) / len(equity) * 100, 2),
        "shortExposurePct": round(sum(point.position == "short" for point in equity) / len(equity) * 100, 2),
        "sharpeRatio": sharpe,
        "longContributionPct": round(long_pnl / base * 100, 2),
        "shortContributionPct": round(short_pnl / base * 100, 2),
        "borrowCostPct": round(borrow / base * 100, 4),
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
        equity.append(EquityPoint(bar.date.isoformat(), cash + shares * bar.close, True, "long"))
    exit_price = window[-1].close * (1 - side_cost)
    final_value = cash + shares * exit_price
    equity[-1] = EquityPoint(equity[-1].date, final_value, False, "flat")
    trade = Trade(
        window[0].date.isoformat(), window[-1].date.isoformat(),
        round(entry_price, 8), round(exit_price, 8), round((final_value - 1) * 100, 8), "end",
        "long", round(final_value - 1, 8), 0.0,
    )
    return BacktestResult((trade,), tuple(equity), compute_metrics(equity, [trade]))


def cash_baseline(bars: list[Bar], *, evaluation_start: date, evaluation_end: date) -> BacktestResult:
    window = [bar for bar in bars if evaluation_start <= bar.date <= evaluation_end]
    equity = [EquityPoint(bar.date.isoformat(), 1.0, False, "flat") for bar in window]
    return BacktestResult((), tuple(equity), compute_metrics(equity, []))

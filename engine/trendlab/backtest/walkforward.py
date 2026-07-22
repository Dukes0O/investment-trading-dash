from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, timedelta

import pandas as pd

from trendlab.backtest.core import BacktestResult, buy_and_hold, cash_baseline, simulate
from trendlab.models import Bar
from trendlab.states.trend30w import Trend30Week


@dataclass(frozen=True, slots=True)
class Fold:
    id: int
    train_start: date
    train_end: date
    test_start: date
    test_end: date
    embargo_sessions: int


def holdout_cutoff(last_date: date, months: int = 18) -> date:
    return (pd.Timestamp(last_date) - pd.DateOffset(months=months)).date()


def make_folds(
    dates: list[date], *, train_years: int, test_years: int,
    step_years: int, embargo_sessions: int, through: date,
) -> list[Fold]:
    eligible = [value for value in sorted(dates) if value <= through]
    if not eligible:
        return []
    folds: list[Fold] = []
    start = pd.Timestamp(eligible[0])
    last = pd.Timestamp(eligible[-1])
    fold_id = 1
    while True:
        train_end_target = start + pd.DateOffset(years=train_years) - timedelta(days=1)
        train_candidates = [value for value in eligible if pd.Timestamp(value) <= train_end_target]
        if not train_candidates:
            break
        train_end = train_candidates[-1]
        later = [value for value in eligible if value > train_end]
        if len(later) <= embargo_sessions:
            break
        test_start = later[embargo_sessions]
        test_end_target = pd.Timestamp(test_start) + pd.DateOffset(years=test_years) - timedelta(days=1)
        test_candidates = [value for value in eligible if test_start <= value and pd.Timestamp(value) <= test_end_target]
        if not test_candidates or pd.Timestamp(test_candidates[-1]) < min(test_end_target, last) - timedelta(days=7):
            break
        folds.append(Fold(fold_id, start.date(), train_end, test_start, test_candidates[-1], embargo_sessions))
        fold_id += 1
        start = start + pd.DateOffset(years=step_years)
    return folds


def run_walk_forward(
    bars: list[Bar], strategy: Trend30Week, folds: list[Fold], *,
    commission_bps_per_side: float, slippage_bps_per_side: float,
) -> dict[str, object]:
    results: list[dict[str, object]] = []
    for fold in folds:
        result: BacktestResult = simulate(
            bars, strategy,
            commission_bps_per_side=commission_bps_per_side,
            slippage_bps_per_side=slippage_bps_per_side,
            evaluation_start=fold.test_start,
            evaluation_end=fold.test_end,
            start_flat_at_evaluation=True,
        )
        buy_hold = buy_and_hold(
            bars, evaluation_start=fold.test_start, evaluation_end=fold.test_end,
            commission_bps_per_side=commission_bps_per_side,
            slippage_bps_per_side=slippage_bps_per_side,
        )
        cash = cash_baseline(bars, evaluation_start=fold.test_start, evaluation_end=fold.test_end)
        results.append({
            "fold": asdict(fold),
            "trend30w": result.metrics,
            "buyAndHold": buy_hold.metrics,
            "cash": cash.metrics,
        })
    valid = [item["trend30w"] for item in results if item["trend30w"]["totalReturnPct"] is not None]
    return {
        "folds": results,
        "aggregate": {
            "foldCount": len(valid),
            "medianTotalReturnPct": round(float(pd.Series([m["totalReturnPct"] for m in valid]).median()), 2) if valid else None,
            "meanMaxDrawdownPct": round(float(pd.Series([m["maxDrawdownPct"] for m in valid]).mean()), 2) if valid else None,
            "totalTrades": sum(int(m["trades"]) for m in valid),
            "foldsBeatingBuyAndHold": sum(
                item["trend30w"]["totalReturnPct"] > item["buyAndHold"]["totalReturnPct"] for item in results
            ),
            "foldsBeatingCash": sum(item["trend30w"]["totalReturnPct"] > 0 for item in results),
        },
    }

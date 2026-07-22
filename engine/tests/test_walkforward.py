from datetime import date

from trendlab.backtest.core import simulate
from trendlab.backtest.walkforward import holdout_cutoff, make_folds
from trendlab.states.trend30w import Trend30Week


def test_folds_end_before_holdout_and_include_embargo(bars):
    cutoff = holdout_cutoff(bars[-1].date, 18)
    folds = make_folds(
        [bar.date for bar in bars], train_years=1, test_years=1,
        step_years=1, embargo_sessions=5, through=cutoff,
    )
    assert folds
    assert all(fold.test_end <= cutoff for fold in folds)
    dates = [bar.date for bar in bars]
    first = folds[0]
    assert dates.index(first.test_start) - dates.index(first.train_end) == 6


def test_walk_forward_evaluation_starts_flat_and_counts_only_test_trades(bars):
    evaluation_start = bars[600].date
    result = simulate(
        bars, Trend30Week(), evaluation_start=evaluation_start,
        evaluation_end=bars[-1].date, start_flat_at_evaluation=True,
    )
    assert result.equity[0].date == evaluation_start.isoformat()
    assert all(date.fromisoformat(trade.entry_date) >= evaluation_start for trade in result.trades)

from datetime import date, timedelta

import pandas as pd

from trendlab.models import Bar
from trendlab.replay import _calendar_friday_decisions, _signal_checks
from trendlab.reporting.weekly import build_actions
from trendlab.states.trend30w import Trend30Week


def _rising(bars):
    output = []
    for index, item in enumerate(bars):
        close = 100 + index * .1
        output.append(Bar(
            item.date, close - .1, close + 1, close - 1, close, item.volume,
            close - .1, close + 1, close - 1, close, item.adj_volume, 0.0, 1.0,
        ))
    return output


def _configs():
    return {
        "research": {"strategy": {
            "weekly_fast_period": 10, "weekly_slow_period": 30,
            "warmup_daily_bars": 210, "version": 1,
        }},
        "risk": {
            "account": {
                "closed_equity": 50_000, "risk_fraction_per_trade": .01,
                "maximum_portfolio_heat_fraction": .01,
            },
            "protection": {"atr_period": 14, "atr_multiple": 3, "minimum_stop_distance_fraction": .005},
        },
        "assets": {"provider": "tiingo", "assets": [{"symbol": "GLD"}, {"symbol": "SPY"}]},
    }


def test_calendar_friday_replay_includes_good_friday_without_a_friday_bar():
    sessions = pd.to_datetime(["2024-03-25", "2024-03-26", "2024-03-27", "2024-03-28"])
    frames = {symbol: pd.DataFrame({"date": sessions}) for symbol in ("GLD", "SPY", "TLT")}
    assert _calendar_friday_decisions(frames, date(2024, 3, 29), 1) == [date(2024, 3, 29)]


def test_replay_oracle_records_heat_cap_without_signal_mismatch_or_halt(bars):
    rising = _rising(bars)
    thursday_index = max(index for index, bar in enumerate(rising) if bar.date.weekday() == 3)
    truncated = rising[: thursday_index + 1]
    decision_date = truncated[-1].date + timedelta(days=1)
    bars_by_symbol = {"GLD": truncated, "SPY": truncated}
    document = build_actions(
        bars_by_symbol=bars_by_symbol, configs=_configs(), provider="tiingo",
        report_date=decision_date,
    )

    checks = _signal_checks(document, bars_by_symbol, Trend30Week(), set(), decision_date)

    assert all(check["matches"] for check in checks)
    assert all(check["calendarWeekComplete"] is False for check in checks)
    assert all(check["oracleDataThrough"] < check["dataThrough"] for check in checks)
    assert sum(check["status"] == "heat-capped" for check in checks) == 1
    capped = next(action for action in document["actions"] if action["action"] == "DEFER")
    assert capped["signalIntent"] == "BUY"

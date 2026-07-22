from trendlab.backtest.core import BacktestResult, EquityPoint, Trade
from trendlab.backtest.diagnostics import cycle_diagnostics, whipsaw_diagnostics


def _result(values, positions=None, trades=()):
    positions = positions or ["long"] * len(values)
    equity = tuple(
        EquityPoint(f"2020-01-{index + 1:02d}", float(value), position != "flat", position)
        for index, (value, position) in enumerate(zip(values, positions))
    )
    return BacktestResult(tuple(trades), equity, {})


def _trade(entry_date, exit_date, entry_price, exit_price):
    return Trade(entry_date, exit_date, entry_price, exit_price, 0.0, "signal")


def test_clean_cycle_has_exact_episode_metrics():
    buy_hold = _result([100, 110, 99, 88, 99, 110, 115])
    strategy = _result(
        [100, 100, 100, 100, 112.5, 125, 130],
        ["long", "long", "flat", "flat", "long", "long", "long"],
    )

    result = cycle_diagnostics(buy_hold, strategy, major_drawdown_threshold_pct=15)

    assert result["episodeCount"] == 1
    episode = result["episodes"][0]
    assert episode["peakDate"] == "2020-01-02"
    assert episode["troughDate"] == "2020-01-04"
    assert episode["recoveryDate"] == "2020-01-06"
    assert episode["declineAvoidedPct"] == 100
    assert episode["recoveryCapturedPct"] == 100
    assert episode["exitDelaySessions"] == 1
    assert episode["reentryDelaySessions"] == 1
    assert episode["cycleCapturePct"] == 100


def test_double_dip_stays_inside_one_episode_and_uses_lower_trough():
    buy_hold = _result([100, 84, 90, 80, 100])
    strategy = _result([100, 100, 100, 100, 125], ["long", "flat", "flat", "flat", "long"])

    result = cycle_diagnostics(buy_hold, strategy, major_drawdown_threshold_pct=15)

    assert result["episodeCount"] == 1
    assert result["episodes"][0]["troughDate"] == "2020-01-04"
    assert result["episodes"][0]["recoveryDate"] == "2020-01-05"


def test_unrecovered_decline_is_incomplete_and_computes_available_values():
    buy_hold = _result([100, 95, 84, 80])
    strategy = _result([100, 100, 100, 100], ["long", "flat", "flat", "flat"])

    result = cycle_diagnostics(buy_hold, strategy, major_drawdown_threshold_pct=15)

    episode = result["episodes"][0]
    assert episode["incomplete"] is True
    assert episode["recoveryDate"] is None
    assert episode["declineAvoidedPct"] == 100
    assert episode["recoveryCapturedPct"] is None
    assert episode["cycleCapturePct"] is None
    assert result["completeEpisodeCount"] == 0
    assert result["meanDeclineAvoidedPct"] is None


def test_whipsaw_sequence_has_known_cost_and_sessions_out():
    sessions = [f"2020-01-{index + 1:02d}" for index in range(7)]
    trades = (
        _trade(sessions[0], sessions[1], 90, 100),
        _trade(sessions[3], sessions[4], 110, 120),
        _trade(sessions[6], sessions[6], 114, 114),
    )

    result = whipsaw_diagnostics(trades, sessions)

    assert result["exitReentryPairCount"] == 2
    assert result["whipsawCount"] == 1
    assert result["whipsawCostPct"] == 10
    assert result["avgSessionsOut"] == 2
    assert result["pairs"][0]["isWhipsaw"] is True
    assert result["pairs"][1]["costPct"] == 0

from datetime import date

import pytest

from trendlab.models import Bar
from trendlab.reporting.weekly import build_actions, validate_actions


def rising_bars(bars):
    output = []
    for index, item in enumerate(bars):
        close = 100 + index * 0.1
        output.append(Bar(
            item.date, close - .1, close + 1, close - 1, close, item.volume,
            close - .1, close + 1, close - 1, close, item.adj_volume, 0.0, 1.0,
        ))
    return output


def heat_configs():
    return {
        "research": {"strategy": {"weekly_fast_period": 10, "weekly_slow_period": 30, "warmup_daily_bars": 210, "version": 1}},
        "risk": {
            "account": {"closed_equity": 50000, "risk_fraction_per_trade": .008, "maximum_portfolio_heat_fraction": .01},
            "protection": {"atr_period": 14, "atr_multiple": 3, "minimum_stop_distance_fraction": .005},
        },
        "assets": {"provider": "tiingo", "assets": [{"symbol": "GLD"}, {"symbol": "SPY"}]},
    }


def test_weekly_actions_require_human_approval_and_protection(bars):
    configs = {
        "research": {"strategy": {"weekly_fast_period": 10, "weekly_slow_period": 30, "warmup_daily_bars": 210, "version": 1}},
        "risk": {
            "account": {"closed_equity": 50000, "risk_fraction_per_trade": .0025, "maximum_portfolio_heat_fraction": .01},
            "protection": {"atr_period": 14, "atr_multiple": 3, "minimum_stop_distance_fraction": .005},
        },
        "assets": {"provider": "tiingo", "assets": [{"symbol": "SPY"}]},
    }
    document = build_actions(
        bars_by_symbol={"SPY": bars}, configs=configs, provider="tiingo",
        report_date=date(2026, 7, 22), held_symbols=set(),
    )
    validate_actions(document)
    assert document["schemaVersion"] == 2
    assert document["requiresHumanApproval"] is True
    assert document["actions"][0]["activeStop"] is None
    assert document["actions"][0]["proposedStop"] < document["actions"][0]["referencePrice"]


def test_second_buy_in_same_week_respects_aggregate_heat_cap(bars):
    rising = rising_bars(bars)
    document = build_actions(
        bars_by_symbol={"GLD": rising, "SPY": rising}, configs=heat_configs(),
        provider="tiingo", report_date=rising[-1].date,
    )
    buys = [item for item in document["actions"] if item["action"] == "BUY"]
    assert len(buys) == 2
    assert document["portfolioHeat"]["afterProposedBuys"] <= 500
    assert buys[1]["risk"]["risk_budget"] < buys[0]["risk"]["risk_budget"]


def test_buy_with_existing_open_risk_respects_heat_cap(bars):
    rising = rising_bars(bars)
    current = rising[-1].close
    document = build_actions(
        bars_by_symbol={"GLD": rising, "SPY": rising}, configs=heat_configs(),
        provider="tiingo", report_date=rising[-1].date,
        held_positions={"SPY": 50}, active_stops={"SPY": current - 8},
    )
    gld = next(item for item in document["actions"] if item["symbol"] == "GLD")
    assert document["portfolioHeat"]["current"] == 400
    assert document["portfolioHeat"]["afterProposedBuys"] <= 500
    assert gld["risk"]["risk_budget"] <= 100
    spy = next(item for item in document["actions"] if item["symbol"] == "SPY")
    assert spy["activeStop"] == round(current - 8, 4)
    assert spy["proposedStop"] != spy["activeStop"]


def test_held_position_without_active_stop_halts(bars):
    rising = rising_bars(bars)
    with pytest.raises(RuntimeError, match="no confirmed active stop"):
        build_actions(
            bars_by_symbol={"GLD": rising, "SPY": rising}, configs=heat_configs(),
            provider="tiingo", report_date=rising[-1].date,
            held_positions={"SPY": 50}, active_stops={},
        )


def test_heat_capped_buy_is_deferred_without_losing_signal_intent(bars):
    rising = rising_bars(bars)
    configs = heat_configs()
    configs["risk"]["account"]["risk_fraction_per_trade"] = .01
    document = build_actions(
        bars_by_symbol={"GLD": rising, "SPY": rising}, configs=configs,
        provider="tiingo", report_date=rising[-1].date,
    )
    deferred = next(item for item in document["actions"] if item["action"] == "DEFER")
    assert deferred["state"] == "uptrend"
    assert deferred["signalIntent"] == "BUY"
    assert deferred["quantity"] == 0
    assert "heat cap" in deferred["rationale"]

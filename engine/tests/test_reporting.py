from datetime import date

from trendlab.reporting.weekly import build_actions, validate_actions


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
    assert document["requiresHumanApproval"] is True
    assert document["actions"][0]["protectiveStop"] < document["actions"][0]["referencePrice"]

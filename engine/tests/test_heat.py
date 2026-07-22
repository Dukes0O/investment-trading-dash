import json

from trendlab.portfolio.heat import action_stops, portfolio_active_stops


def test_schema_v2_heat_uses_active_not_proposed_stop():
    document = {
        "schemaVersion": 2,
        "actions": [{"symbol": "SPY", "activeStop": 95, "proposedStop": 97}],
    }
    assert action_stops(document) == {"SPY": 95}


def test_schema_v1_stop_remains_readable_for_historical_evidence():
    document = {
        "schemaVersion": 1,
        "actions": [{"symbol": "GLD", "protectiveStop": 185}],
    }
    assert action_stops(document) == {"GLD": 185}


def test_portfolio_confirmed_stop_overrides_actions_source(tmp_path):
    path = tmp_path / "portfolio.json"
    path.write_text(json.dumps({
        "positions": [{"symbol": "SPY", "qty": 5, "activeStop": 101.25}],
    }))
    assert portfolio_active_stops(path, {"SPY"}) == {"SPY": 101.25}

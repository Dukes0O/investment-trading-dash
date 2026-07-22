import pytest

from trendlab.portfolio.sizing import size_position


def test_size_uses_lower_trade_or_heat_budget():
    result = size_position(
        closed_equity=50_000, entry_price=100, stop_price=95,
        risk_fraction=0.0025, maximum_heat_fraction=0.01, current_heat=400,
    )
    assert result.quantity == 20
    assert result.risk_budget == 100
    assert result.portfolio_heat_after == 500


def test_long_stop_must_be_below_entry():
    with pytest.raises(ValueError, match="stop must be below"):
        size_position(closed_equity=50_000, entry_price=100, stop_price=101, risk_fraction=.0025, maximum_heat_fraction=.01)

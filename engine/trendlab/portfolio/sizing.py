from __future__ import annotations

from dataclasses import asdict, dataclass
from math import floor


@dataclass(frozen=True, slots=True)
class PositionSize:
    quantity: int
    risk_budget: float
    risk_per_unit: float
    position_value: float
    portfolio_heat_after: float

    def to_dict(self) -> dict[str, float | int]:
        return asdict(self)


def size_position(
    *, closed_equity: float, entry_price: float, stop_price: float,
    risk_fraction: float, maximum_heat_fraction: float, current_heat: float = 0.0,
) -> PositionSize:
    if closed_equity <= 0 or entry_price <= 0 or stop_price <= 0:
        raise ValueError("equity, entry, and stop must be positive")
    risk_per_unit = entry_price - stop_price
    if risk_per_unit <= 0:
        raise ValueError("long-position stop must be below entry")
    trade_budget = closed_equity * risk_fraction
    heat_budget = max(0.0, closed_equity * maximum_heat_fraction - current_heat)
    risk_budget = min(trade_budget, heat_budget)
    quantity = min(floor(risk_budget / risk_per_unit), floor(closed_equity / entry_price))
    actual_risk = quantity * risk_per_unit
    return PositionSize(quantity, round(actual_risk, 2), round(risk_per_unit, 4), round(quantity * entry_price, 2), round(current_heat + actual_risk, 2))

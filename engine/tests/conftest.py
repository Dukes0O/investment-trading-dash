from __future__ import annotations

from datetime import date, timedelta
from math import sin

import pytest

from trendlab.models import Bar


def market_bars(count: int = 900, start: date = date(2010, 1, 4)) -> list[Bar]:
    output: list[Bar] = []
    current = start
    index = 0
    while len(output) < count:
        if current.weekday() < 5:
            trend = 100 + index * 0.025 + 18 * sin(index / 55)
            open_price = trend * (1 + 0.001 * sin(index / 7))
            close = trend * (1 + 0.002 * sin(index / 11))
            high = max(open_price, close) + 1.2
            low = min(open_price, close) - 1.2
            output.append(Bar(
                current, open_price, high, low, close, 1_000_000,
                open_price, high, low, close, 1_000_000, 0.0, 1.0,
            ))
            index += 1
        current += timedelta(days=1)
    return output


@pytest.fixture
def bars() -> list[Bar]:
    return market_bars()

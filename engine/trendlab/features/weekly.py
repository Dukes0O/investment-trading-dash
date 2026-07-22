from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from trendlab.models import Bar


@dataclass(frozen=True, slots=True)
class WeeklyBar:
    date: date
    open: float
    high: float
    low: float
    close: float
    volume: float


def sma(values: list[float], period: int) -> list[float | None]:
    output: list[float | None] = [None] * len(values)
    running = 0.0
    for index, value in enumerate(values):
        running += value
        if index >= period:
            running -= values[index - period]
        if index >= period - 1:
            output[index] = running / period
    return output


def to_weekly(bars: list[Bar], *, adjusted: bool = True) -> list[WeeklyBar]:
    weeks: list[WeeklyBar] = []
    current_key: date | None = None
    current: WeeklyBar | None = None
    for bar in bars:
        key = bar.date - timedelta(days=bar.date.weekday())
        open_value = bar.adj_open if adjusted else bar.open
        high_value = bar.adj_high if adjusted else bar.high
        low_value = bar.adj_low if adjusted else bar.low
        close_value = bar.adj_close if adjusted else bar.close
        volume_value = bar.adj_volume if adjusted else bar.volume
        if key != current_key:
            if current is not None:
                weeks.append(current)
            current_key = key
            current = WeeklyBar(bar.date, open_value, high_value, low_value, close_value, volume_value)
        else:
            assert current is not None
            current = WeeklyBar(
                bar.date, current.open, max(current.high, high_value),
                min(current.low, low_value), close_value, current.volume + volume_value,
            )
    if current is not None:
        weeks.append(current)
    return weeks


def completed_week_features(
    bars: list[Bar], fast_period: int = 10, slow_period: int = 30,
) -> tuple[list[float | None], list[float | None], list[float | None]]:
    # A week's values are exposed from its FINAL session's close onward: the
    # Friday row sees its own completed week (decide at Friday close, fill at
    # Monday open), while mid-week rows see the prior completed week. The
    # dataset's final partial week is exposed on its last row only; a signal
    # there has no next bar to fill, and live decisions go through
    # Trend30Week.latest, which applies the calendar completeness test.
    weekly = to_weekly(bars, adjusted=True)
    output_close: list[float | None] = [None] * len(bars)
    output_fast: list[float | None] = [None] * len(bars)
    output_slow: list[float | None] = [None] * len(bars)
    if not weekly:
        return output_close, output_fast, output_slow
    closes = [bar.close for bar in weekly]
    fast = sma(closes, fast_period)
    slow = sma(closes, slow_period)
    week_index = 0
    for index, bar in enumerate(bars):
        while week_index < len(weekly) - 1 and weekly[week_index + 1].date <= bar.date:
            week_index += 1
        if weekly[week_index].date <= bar.date:
            output_close[index] = closes[week_index]
            output_fast[index] = fast[week_index]
            output_slow[index] = slow[week_index]
    return output_close, output_fast, output_slow


def week_is_complete(last_session: date, as_of: date) -> bool:
    """Whether the Monday-start week containing last_session is complete.

    Complete when the session is the week's Friday (end-of-day data implies
    the close happened), or when as_of is past that Friday. A holiday-
    shortened week is treated as incomplete until the calendar week ends -
    conservative by one session in that rare case.
    """
    friday = last_session - timedelta(days=last_session.weekday()) + timedelta(days=4)
    return last_session == friday or as_of > friday


def wilder_atr(bars: list[Bar], period: int = 14) -> list[float | None]:
    output: list[float | None] = [None] * len(bars)
    previous: float | None = None
    for index in range(1, len(bars)):
        bar, prior = bars[index], bars[index - 1]
        true_range = max(bar.high - bar.low, abs(bar.high - prior.close), abs(bar.low - prior.close))
        if index <= period:
            previous = (previous or 0.0) + true_range / period
            if index == period:
                output[index] = previous
        else:
            assert previous is not None
            previous = (previous * (period - 1) + true_range) / period
            output[index] = previous
    return output

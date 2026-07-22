from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from trendlab.features.weekly import completed_week_features, sma, to_weekly, week_is_complete
from trendlab.models import Bar


@dataclass(frozen=True, slots=True)
class TrendState:
    date: str
    state: str
    action: str
    weekly_close: float | None
    fast_sma: float | None
    slow_sma: float | None


class Trend30Week:
    id = "trend-30w"

    def __init__(self, fast_period: int = 10, slow_period: int = 30, warmup: int = 210) -> None:
        self.fast_period = fast_period
        self.slow_period = slow_period
        self.warmup = warmup

    def prepare(self, bars: list[Bar]) -> tuple[list[float | None], list[float | None], list[float | None]]:
        return completed_week_features(bars, self.fast_period, self.slow_period)

    @staticmethod
    def entry(index: int, context: tuple[list[float | None], list[float | None], list[float | None]]) -> bool:
        weekly_close, fast, slow = (series[index] for series in context)
        return weekly_close is not None and fast is not None and slow is not None and weekly_close > slow and fast > slow

    @staticmethod
    def exit(index: int, context: tuple[list[float | None], list[float | None], list[float | None]]) -> bool:
        weekly_close, _, slow = (series[index] for series in context)
        return weekly_close is not None and slow is not None and weekly_close < slow

    def latest(self, bars: list[Bar], as_of: date | None = None) -> TrendState:
        # Live decision path. Uses the most recent CALENDAR-complete week: on a
        # weekend run the week that just ended on Friday, mid-week the prior
        # week. The backtest feature arrays cannot decide this for the final
        # bar (a partial week is indistinguishable from a short one there), so
        # completeness is checked against as_of, the decision date.
        if len(bars) <= self.warmup:
            raise RuntimeError(f"{self.id} requires more than {self.warmup} daily bars")
        as_of = as_of or bars[-1].date
        weekly = to_weekly(bars, adjusted=True)
        series = weekly if week_is_complete(weekly[-1].date, as_of) else weekly[:-1]
        closes = [week.close for week in series]
        weekly_close = closes[-1] if closes else None
        fast = sma(closes, self.fast_period)[-1] if len(closes) >= self.fast_period else None
        slow = sma(closes, self.slow_period)[-1] if len(closes) >= self.slow_period else None
        index = len(bars) - 1
        if weekly_close is None or fast is None or slow is None:
            state, action = "insufficient", "HOLD"
        elif weekly_close > slow and fast > slow:
            state, action = "uptrend", "BUY"
        elif weekly_close < slow:
            state, action = "downtrend", "EXIT"
        else:
            state, action = "transition", "HOLD"
        return TrendState(bars[index].date.isoformat(), state, action, weekly_close, fast, slow)


class Trend30WeekLongShort(Trend30Week):
    """Exact zero-parameter short mirror of the registered long/flat rule."""

    id = "trend-30w-ls"

    @staticmethod
    def short_entry(index: int, context: tuple[list[float | None], list[float | None], list[float | None]]) -> bool:
        weekly_close, fast, slow = (series[index] for series in context)
        return weekly_close is not None and fast is not None and slow is not None and weekly_close < slow and fast < slow

    @staticmethod
    def short_exit(index: int, context: tuple[list[float | None], list[float | None], list[float | None]]) -> bool:
        weekly_close, _, slow = (series[index] for series in context)
        return weekly_close is not None and slow is not None and weekly_close > slow

    def target(
        self, index: int,
        context: tuple[list[float | None], list[float | None], list[float | None]],
        current_position: int,
    ) -> int:
        long_entry = self.entry(index, context)
        short_entry = self.short_entry(index, context)
        if current_position > 0:
            return -1 if short_entry else 0 if self.exit(index, context) else 1
        if current_position < 0:
            return 1 if long_entry else 0 if self.short_exit(index, context) else -1
        if long_entry:
            return 1
        if short_entry:
            return -1
        return 0

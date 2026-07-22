from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import pandas as pd


BAR_COLUMNS = [
    "date", "open", "high", "low", "close", "volume",
    "adj_open", "adj_high", "adj_low", "adj_close", "adj_volume",
    "div_cash", "split_factor",
]


@dataclass(frozen=True, slots=True)
class Bar:
    date: date
    open: float
    high: float
    low: float
    close: float
    volume: float
    adj_open: float
    adj_high: float
    adj_low: float
    adj_close: float
    adj_volume: float
    div_cash: float = 0.0
    split_factor: float = 1.0


def bars_from_frame(frame: pd.DataFrame) -> list[Bar]:
    missing = sorted(set(BAR_COLUMNS) - set(frame.columns))
    if missing:
        raise ValueError(f"market frame missing columns: {', '.join(missing)}")
    rows: list[Bar] = []
    for row in frame.sort_values("date")[BAR_COLUMNS].itertuples(index=False):
        rows.append(Bar(
            date=pd.Timestamp(row.date).date(),
            open=float(row.open), high=float(row.high), low=float(row.low),
            close=float(row.close), volume=float(row.volume),
            adj_open=float(row.adj_open), adj_high=float(row.adj_high),
            adj_low=float(row.adj_low), adj_close=float(row.adj_close),
            adj_volume=float(row.adj_volume), div_cash=float(row.div_cash),
            split_factor=float(row.split_factor),
        ))
    return rows


def frame_from_bars(bars: list[Bar]) -> pd.DataFrame:
    return pd.DataFrame([{name: getattr(bar, name) for name in BAR_COLUMNS} for bar in bars])

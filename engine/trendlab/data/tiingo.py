from __future__ import annotations

import os
from typing import Any

import httpx
import pandas as pd

from trendlab.data.base import EODRequest
from trendlab.models import BAR_COLUMNS


class TiingoProvider:
    name = "tiingo"

    def __init__(self, token: str | None = None, timeout: float = 30.0) -> None:
        self._token = token or os.environ.get("TIINGO_API_TOKEN") or os.environ.get("TIINGO_API_KEY")
        self._timeout = timeout
        if not self._token:
            raise RuntimeError(
                "Tiingo credential missing. Set TIINGO_API_TOKEN; no demo or synthetic fallback is permitted."
            )

    def fetch(self, request: EODRequest) -> pd.DataFrame:
        params: dict[str, Any] = {"resampleFreq": "daily", "token": self._token}
        if request.start:
            params["startDate"] = request.start.isoformat()
        if request.end:
            params["endDate"] = request.end.isoformat()
        url = f"https://api.tiingo.com/tiingo/daily/{request.symbol}/prices"
        try:
            response = httpx.get(url, params=params, timeout=self._timeout)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise RuntimeError(f"Tiingo fetch failed for {request.symbol}: {exc}") from exc
        return parse_tiingo(payload, request.symbol)


def parse_tiingo(payload: Any, symbol: str) -> pd.DataFrame:
    if not isinstance(payload, list) or not payload:
        raise ValueError(f"Tiingo returned no daily bars for {symbol}")
    mapping = {
        "date": "date", "open": "open", "high": "high", "low": "low",
        "close": "close", "volume": "volume", "adjOpen": "adj_open",
        "adjHigh": "adj_high", "adjLow": "adj_low", "adjClose": "adj_close",
        "adjVolume": "adj_volume", "divCash": "div_cash",
        "splitFactor": "split_factor",
    }
    rows: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        row = {target: item.get(source) for source, target in mapping.items()}
        row["date"] = str(row["date"] or "")[:10]
        rows.append(row)
    frame = pd.DataFrame(rows, columns=BAR_COLUMNS)
    if frame.empty:
        raise ValueError(f"Tiingo returned no parseable daily bars for {symbol}")
    frame["date"] = pd.to_datetime(frame["date"], errors="raise").dt.date
    numeric = [column for column in BAR_COLUMNS if column != "date"]
    frame[numeric] = frame[numeric].apply(pd.to_numeric, errors="raise")
    return frame.sort_values("date").reset_index(drop=True)

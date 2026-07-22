from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol

import pandas as pd


@dataclass(frozen=True, slots=True)
class EODRequest:
    symbol: str
    start: date | None = None
    end: date | None = None


class EODProvider(Protocol):
    name: str

    def fetch(self, request: EODRequest) -> pd.DataFrame:
        """Return normalized raw/adjusted daily bars ordered by date."""

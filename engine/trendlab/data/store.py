from __future__ import annotations

from pathlib import Path

import duckdb
import pandas as pd


DDL = """
CREATE TABLE IF NOT EXISTS market_bars (
  provider VARCHAR NOT NULL,
  symbol VARCHAR NOT NULL,
  date DATE NOT NULL,
  open DOUBLE NOT NULL,
  high DOUBLE NOT NULL,
  low DOUBLE NOT NULL,
  close DOUBLE NOT NULL,
  volume DOUBLE NOT NULL,
  adj_open DOUBLE NOT NULL,
  adj_high DOUBLE NOT NULL,
  adj_low DOUBLE NOT NULL,
  adj_close DOUBLE NOT NULL,
  adj_volume DOUBLE NOT NULL,
  div_cash DOUBLE NOT NULL,
  split_factor DOUBLE NOT NULL,
  snapshot_path VARCHAR NOT NULL,
  PRIMARY KEY (provider, symbol, date)
)
"""


class MarketStore:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path

    def ingest_snapshot(self, path: Path, provider: str, symbol: str) -> int:
        frame = pd.read_parquet(path)
        frame["provider"] = provider
        frame["symbol"] = symbol.upper()
        frame["snapshot_path"] = str(path)
        with duckdb.connect(str(self.path)) as connection:
            connection.execute(DDL)
            connection.execute("DELETE FROM market_bars WHERE provider = ? AND symbol = ?", [provider, symbol.upper()])
            connection.register("incoming", frame)
            connection.execute(
                "INSERT INTO market_bars SELECT provider, symbol, date, open, high, low, close, volume, "
                "adj_open, adj_high, adj_low, adj_close, adj_volume, div_cash, split_factor, snapshot_path FROM incoming"
            )
        return len(frame)

    def read(self, provider: str, symbol: str, through: str | None = None) -> pd.DataFrame:
        query = "SELECT * EXCLUDE(provider, symbol, snapshot_path) FROM market_bars WHERE provider = ? AND symbol = ?"
        params: list[object] = [provider, symbol.upper()]
        if through:
            query += " AND date <= ?"
            params.append(through)
        query += " ORDER BY date"
        with duckdb.connect(str(self.path), read_only=True) as connection:
            return connection.execute(query, params).fetchdf()

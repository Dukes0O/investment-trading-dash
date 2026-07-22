from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from trendlab.models import BAR_COLUMNS


@dataclass(frozen=True, slots=True)
class ValidationResult:
    ok: bool
    errors: tuple[str, ...]
    warnings: tuple[str, ...]

    def require_ok(self) -> None:
        if not self.ok:
            raise RuntimeError("market-data validation failed: " + "; ".join(self.errors))


def validate_bars(frame: pd.DataFrame, maximum_calendar_gap_days: int = 7) -> ValidationResult:
    errors: list[str] = []
    warnings: list[str] = []
    missing = sorted(set(BAR_COLUMNS) - set(frame.columns))
    if missing:
        return ValidationResult(False, (f"missing columns: {', '.join(missing)}",), ())
    if frame.empty:
        return ValidationResult(False, ("no bars",), ())
    dates = pd.to_datetime(frame["date"])
    if dates.duplicated().any():
        errors.append("duplicate dates")
    if not dates.is_monotonic_increasing:
        errors.append("dates are not strictly ordered")
    numeric = [column for column in BAR_COLUMNS if column != "date"]
    if frame[numeric].isna().any().any():
        errors.append("null numeric values")
    for prefix in ("", "adj_"):
        open_col, high_col, low_col, close_col = f"{prefix}open", f"{prefix}high", f"{prefix}low", f"{prefix}close"
        if (frame[[open_col, high_col, low_col, close_col]] <= 0).any().any():
            errors.append(f"non-positive {prefix or 'raw_'}OHLC")
        if (frame[high_col] < frame[[open_col, close_col, low_col]].max(axis=1)).any():
            errors.append(f"invalid {high_col}")
        if (frame[low_col] > frame[[open_col, close_col, high_col]].min(axis=1)).any():
            errors.append(f"invalid {low_col}")
    gaps = dates.diff().dt.days
    if (gaps > maximum_calendar_gap_days).any():
        count = int((gaps > maximum_calendar_gap_days).sum())
        warnings.append(f"{count} calendar gaps exceed {maximum_calendar_gap_days} days; inspect exchange calendar/provider coverage")
    if (frame["split_factor"] <= 0).any():
        errors.append("non-positive split factor")
    if (frame["div_cash"] < 0).any():
        errors.append("negative distribution")
    return ValidationResult(not errors, tuple(errors), tuple(warnings))


def trenddesk_bars(database: Path, symbol: str) -> pd.DataFrame | None:
    if not database.exists():
        return None
    with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as connection:
        frame = pd.read_sql_query(
            "SELECT date, open, high, low, close, volume FROM price_bars WHERE symbol = ? ORDER BY date",
            connection,
            params=[symbol.upper()],
        )
    return frame if not frame.empty else None


def reconcile_close(
    primary: pd.DataFrame,
    secondary: pd.DataFrame | None,
    tolerance_pct: float,
    hard_limit_pct: float = 1.0,
    maximum_outlier_fraction: float = 0.001,
) -> dict[str, object]:
    if secondary is None or secondary.empty:
        return {"status": "not_available", "overlapRows": 0, "maximumDifferencePct": None}
    left = primary[["date", "close"]].copy()
    right = secondary[["date", "close"]].copy()
    left["date"] = pd.to_datetime(left["date"])
    right["date"] = pd.to_datetime(right["date"])
    merged = left.merge(right, on="date", suffixes=("_primary", "_secondary"))
    if merged.empty:
        return {"status": "no_overlap", "overlapRows": 0, "maximumDifferencePct": None}
    differences = ((merged.close_primary / merged.close_secondary) - 1).abs() * 100
    maximum = float(differences.max())
    outlier_count = int((differences > tolerance_pct).sum())
    outlier_fraction = outlier_count / len(merged)
    if maximum > hard_limit_pct or outlier_fraction > maximum_outlier_fraction:
        status = "review"
    elif outlier_count:
        status = "pass_with_warning"
    else:
        status = "pass"
    return {
        "status": status,
        "overlapRows": int(len(merged)),
        "maximumDifferencePct": round(maximum, 6),
        "tolerancePct": tolerance_pct,
        "hardLimitPct": hard_limit_pct,
        "outlierCount": outlier_count,
        "outlierFraction": round(outlier_fraction, 8),
        "maximumOutlierFraction": maximum_outlier_fraction,
    }

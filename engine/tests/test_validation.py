import pandas as pd

from trendlab.data.validate import reconcile_close, validate_bars
from trendlab.models import frame_from_bars


def test_validation_accepts_well_formed_bars(bars):
    result = validate_bars(frame_from_bars(bars[:50]))
    assert result.ok
    assert not result.errors


def test_validation_rejects_duplicate_dates(bars):
    frame = frame_from_bars(bars[:20])
    frame.loc[1, "date"] = frame.loc[0, "date"]
    result = validate_bars(frame)
    assert not result.ok
    assert "duplicate dates" in result.errors


def test_cross_source_reconciliation_reports_difference(bars):
    primary = frame_from_bars(bars[:20])
    secondary = primary[["date", "close"]].copy()
    secondary["close"] *= 1.01
    result = reconcile_close(primary, secondary, tolerance_pct=0.5)
    assert result["status"] == "review"
    assert result["overlapRows"] == 20


def test_cross_source_reconciliation_warns_for_one_small_isolated_vendor_outlier(bars):
    primary = frame_from_bars(bars[:2000])
    secondary = primary[["date", "close"]].copy()
    secondary.loc[100, "close"] = primary.loc[100, "close"] / 1.0051
    result = reconcile_close(primary, secondary, tolerance_pct=0.5, maximum_outlier_fraction=0.002)
    assert result["status"] == "pass_with_warning"
    assert result["outlierCount"] == 1
    assert result["outlierFraction"] == 0.00111111

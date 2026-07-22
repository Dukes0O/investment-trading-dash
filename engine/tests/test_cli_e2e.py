from datetime import date
import json
from pathlib import Path

from trendlab import cli
from trendlab.models import frame_from_bars


class FakeTiingo:
    def fetch(self, request):
        return frame_from_bars(self.bars)


def test_replay_defaults_to_52_weeks():
    args = cli.parser().parse_args(["replay"])
    assert args.weeks == 52


def test_run_weekly_end_to_end_with_provider_boundary(monkeypatch, tmp_path, bars):
    fake = FakeTiingo()
    fake.bars = bars
    engine_root = tmp_path / "engine"
    repo_root = tmp_path / "repo"
    configs = {
        "assets": {
            "provider": "tiingo",
            "assets": [
                {"symbol": "GLD", "inception": "2010-01-04"},
                {"symbol": "SPY", "inception": "2010-01-04"},
                {"symbol": "TLT", "inception": "2010-01-04"},
            ],
        },
        "research": {
            "strategy": {"weekly_fast_period": 10, "weekly_slow_period": 30, "warmup_daily_bars": 210, "version": 1},
            "validation": {
                "maximum_calendar_gap_days": 7,
                "reconcile_close_tolerance_pct": .5,
                "reconcile_hard_limit_pct": 1.0,
                "reconcile_maximum_outlier_fraction": .001,
            },
        },
        "risk": {
            "account": {"closed_equity": 50000, "risk_fraction_per_trade": .0025, "maximum_portfolio_heat_fraction": .01},
            "protection": {"atr_period": 14, "atr_multiple": 3, "minimum_stop_distance_fraction": .005},
        },
    }
    monkeypatch.setattr(cli, "ENGINE_ROOT", engine_root)
    monkeypatch.setattr(cli, "REPO_ROOT", repo_root)
    monkeypatch.setattr(cli, "RAW_ROOT", engine_root / "data" / "raw")
    monkeypatch.setattr(cli, "STORE_PATH", engine_root / "data" / "curated" / "market.duckdb")
    monkeypatch.setattr(cli, "OUTPUT_ROOT", engine_root / "output")
    monkeypatch.setattr(cli, "REGISTRY_ROOT", engine_root / "registry")
    monkeypatch.setattr(cli, "load_configs", lambda: configs)
    monkeypatch.setattr(cli, "TiingoProvider", lambda: fake)
    monkeypatch.setattr(cli, "trenddesk_bars", lambda database, symbol: None)

    result = cli.run_weekly(bars[-1].date)

    assert result["ok"] is True
    assert set(result["symbols"]) == {"GLD", "SPY", "TLT"}
    assert Path(result["actions"]).exists()
    actions = json.loads(Path(result["actions"]).read_text())
    assert actions["schemaVersion"] == 2
    assert all("activeStop" in item and "proposedStop" in item for item in actions["actions"])
    assert Path(result["html"]).exists()
    assert (engine_root / "data" / "curated" / "market.duckdb").exists()
    assert len(list((engine_root / "data" / "raw" / "tiingo").glob("*/*.parquet"))) == 3
    costs = (engine_root / "registry" / "costs.jsonl").read_text().splitlines()
    assert len(costs) == 1
    assert '"status":"incomplete"' in costs[0]

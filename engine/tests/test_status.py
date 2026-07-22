import json

from trendlab.status import build_status


def test_status_reports_latest_actions_strategies_experiments_and_costs(tmp_path):
    repo = tmp_path / "repo"
    registry = tmp_path / "registry"
    reports = repo / "data" / "reports"
    strategies = registry / "strategies"
    reports.mkdir(parents=True)
    strategies.mkdir(parents=True)
    (reports / "engine-actions-2026-07-22.json").write_text(json.dumps({
        "reportDate": "2026-07-22", "strategy": {"id": "trend-30w", "version": 1},
        "actions": [{"symbol": "SPY", "state": "uptrend", "action": "BUY"}],
    }))
    (strategies / "trend.yaml").write_text("id: trend-30w\nversion: 1\nstatus: research\n")
    (registry / "experiments.jsonl").write_text('{"id":"exp-1","date":"2026-07-22","verdict":"recorded"}\n')
    (registry / "costs.jsonl").write_text('{"week":"2026-07-22","status":"incomplete"}\n')

    status = build_status(repo, registry)

    assert status["latestActions"]["reportDate"] == "2026-07-22"
    assert status["strategyVersions"][0]["status"] == "research"
    assert status["lastExperiments"][-1]["id"] == "exp-1"
    assert status["costLedger"]["complete"] is False
    assert status["costLedger"]["incompleteWeeks"] == ["2026-07-22"]

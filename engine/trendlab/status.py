from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from trendlab.portfolio.heat import latest_actions_document


def build_status(repo_root: Path, registry_root: Path) -> dict[str, Any]:
    actions_path, actions = latest_actions_document(repo_root / "data" / "reports")
    strategies = _strategies(registry_root / "strategies")
    experiments = _jsonl(registry_root / "experiments.jsonl")
    diagnostics = [item for item in experiments if item.get("kind") == "diagnostics" and item.get("verdict") == "recorded"]
    costs = _effective_costs(registry_root / "costs.jsonl")
    return {
        "ok": True,
        "latestActions": None if actions is None else {
            "path": str(actions_path), "reportDate": actions.get("reportDate"),
            "strategy": actions.get("strategy"),
            "actions": [
                {"symbol": item.get("symbol"), "state": item.get("state"), "action": item.get("action")}
                for item in actions.get("actions", [])
            ],
        },
        "operatingStrategies": [item for item in strategies if item.get("status") == "operating"],
        "strategyVersions": strategies,
        "lastExperiments": [
            {"id": item.get("id"), "date": item.get("date"), "verdict": item.get("verdict")}
            for item in experiments[-5:]
        ],
        "lastDiagnostics": None if not diagnostics else {
            "id": diagnostics[-1].get("id"), "date": diagnostics[-1].get("date"),
        },
        "costLedger": {
            "complete": bool(costs) and all(item.get("status") == "complete" for item in costs),
            "latestWeek": costs[-1].get("week") if costs else None,
            "incompleteWeeks": [item.get("week") for item in costs if item.get("status") != "complete"],
        },
    }


def _strategies(path: Path) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for item_path in sorted(path.glob("*.yaml")):
        payload = yaml.safe_load(item_path.read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            output.append({
                "id": payload.get("id"), "version": payload.get("version"),
                "status": payload.get("status"), "file": str(item_path),
            })
    return output


def _jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _effective_costs(path: Path) -> list[dict[str, Any]]:
    by_week: dict[str, dict[str, Any]] = {}
    for item in _jsonl(path):
        by_week[str(item.get("week"))] = item
    return [by_week[key] for key in sorted(by_week)]

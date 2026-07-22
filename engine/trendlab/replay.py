from __future__ import annotations

import csv
import hashlib
import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable

import pandas as pd

from trendlab.backtest.walkforward import holdout_cutoff
from trendlab.config import config_hash
from trendlab.data.snapshot import latest_snapshot
from trendlab.data.validate import reconcile_close, trenddesk_bars, validate_bars
from trendlab.features.weekly import week_is_complete
from trendlab.models import Bar, bars_from_frame
from trendlab.registry import append_jsonl, experiment_id, write_manifest
from trendlab.reporting.weekly import build_actions
from trendlab.states.trend30w import Trend30Week


def run_replay(
    weeks: int, *, configs: dict[str, Any], raw_root: Path, repo_root: Path,
    output_root: Path, registry_root: Path, run_context: Callable[[], dict[str, object]],
) -> dict[str, Any]:
    if weeks <= 0:
        raise ValueError("replay weeks must be positive")
    provider = str(configs["assets"]["provider"])
    if provider != "tiingo":
        raise RuntimeError(f"replay requires the configured Tiingo snapshots, got {provider}")
    frames = _snapshot_frames(configs, raw_root, provider)
    latest_common = min(pd.Timestamp(frame["date"].max()).date() for frame in frames.values())
    boundary = holdout_cutoff(latest_common, int(configs["research"]["holdout"]["months"]))
    decision_dates = _calendar_friday_decisions(frames, boundary, weeks)

    identifier = experiment_id("replay")
    summary_path = output_root / f"{identifier}.csv"
    manifest_path = registry_root / "manifests" / f"{identifier}.json"
    sidecar_path = registry_root / "replay-actions" / f"{identifier}.jsonl"
    strategy_config = configs["research"]["strategy"]
    strategy = Trend30Week(
        int(strategy_config["weekly_fast_period"]), int(strategy_config["weekly_slow_period"]),
        int(strategy_config["warmup_daily_bars"]),
    )
    positions: dict[str, float] = {}
    active_stops: dict[str, float] = {}
    entries: list[dict[str, Any]] = []
    rows: list[dict[str, object]] = []

    manifest: dict[str, Any] = {
        "id": identifier, "kind": "operational-replay", "status": "running",
        "requestedWeeks": weeks, "holdoutEvaluated": False,
        "holdoutSafeBoundary": boundary.isoformat(), "configHash": config_hash(configs),
        "runContext": run_context(), "weeks": entries,
        "actionDocuments": {
            "format": "jsonl", "path": f"engine/registry/replay-actions/{identifier}.jsonl",
            "documents": 0, "sha256": None,
        },
    }
    write_manifest(manifest_path, manifest)

    for decision_date in decision_dates:
        held_before = set(positions)
        try:
            bars_by_symbol, validations = _validated_bars(
                frames, configs, repo_root, decision_date,
            )
            document = build_actions(
                bars_by_symbol=bars_by_symbol, configs=configs, provider=provider,
                report_date=decision_date, held_positions=positions,
                active_stops=active_stops, validation=validations,
            )
            checks = _signal_checks(document, bars_by_symbol, strategy, held_before, decision_date)
            mismatches = [item for item in checks if not item["matches"]]
            if mismatches:
                raise RuntimeError(f"signal regression mismatch: {mismatches}")
            append_jsonl(sidecar_path, document)
            entries.append({
                "date": decision_date.isoformat(), "status": "complete",
                "lastSessions": {symbol: bars[-1].date.isoformat() for symbol, bars in bars_by_symbol.items()},
                "holidayShortened": any(bars[-1].date < decision_date for bars in bars_by_symbol.values()),
                "signalChecks": checks,
                "actionSummary": _action_summary(document),
                "actionDocumentRef": {
                    "sidecarLine": sum(item["status"] == "complete" for item in entries) + 1,
                    "sha256": _document_hash(document),
                },
            })
            for action in document["actions"]:
                symbol = str(action["symbol"])
                if action["action"] == "BUY":
                    positions[symbol] = float(action["quantity"])
                elif action["action"] == "EXIT":
                    positions.pop(symbol, None)
            active_stops = {
                str(action["symbol"]): float(action["proposedStop"])
                for action in document["actions"] if str(action["symbol"]) in positions
            }
            checks_by_symbol = {str(item["symbol"]): item for item in checks}
            for action in document["actions"]:
                check = checks_by_symbol[str(action["symbol"])]
                rows.append({
                    "week": decision_date.isoformat(), "last_session": check["dataThrough"],
                    "calendar_week_complete": check["calendarWeekComplete"],
                    "status": check["status"], "reason": "",
                    "symbol": action["symbol"], "state": action["state"],
                    "signal_intent": action["signalIntent"], "action": action["action"],
                    "quantity": action["quantity"], "current_heat": document["portfolioHeat"]["current"],
                    "heat_after_buys": document["portfolioHeat"]["afterProposedBuys"],
                    "signal_match": check["matches"],
                })
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            entries.append({"date": decision_date.isoformat(), "status": "halted", "reason": reason})
            rows.append({
                "week": decision_date.isoformat(), "last_session": "", "calendar_week_complete": "",
                "status": "halted", "reason": reason,
                "symbol": "", "state": "", "signal_intent": "", "action": "", "quantity": "",
                "current_heat": "", "heat_after_buys": "", "signal_match": "",
            })

    _write_summary(summary_path, rows)
    halt_count = sum(item["status"] == "halted" for item in entries)
    heat_capped_count = sum(
        check.get("status") == "heat-capped"
        for entry in entries for check in entry.get("signalChecks", [])
    )
    manifest.update({
        "status": "complete", "completedWeeks": len(entries) - halt_count,
        "haltedWeeks": halt_count, "heatCappedActions": heat_capped_count,
        "summary": str(summary_path),
        "actionDocuments": {
            "format": "jsonl", "path": f"engine/registry/replay-actions/{identifier}.jsonl",
            "documents": len(entries) - halt_count,
            "sha256": _file_hash(sidecar_path) if sidecar_path.exists() else None,
        },
    })
    write_manifest(manifest_path, manifest)
    return {
        "ok": True, "replayId": identifier, "weeks": len(entries), "haltedWeeks": halt_count,
        "heatCappedActions": heat_capped_count,
        "holdoutEvaluated": False, "boundary": boundary.isoformat(),
        "manifest": str(manifest_path), "summary": str(summary_path),
    }


def _snapshot_frames(configs: dict[str, Any], raw_root: Path, provider: str) -> dict[str, pd.DataFrame]:
    output: dict[str, pd.DataFrame] = {}
    for asset in configs["assets"]["assets"]:
        symbol = str(asset["symbol"]).upper()
        output[symbol] = pd.read_parquet(latest_snapshot(raw_root, provider, symbol))
    return output


def _calendar_friday_decisions(
    frames: dict[str, pd.DataFrame], boundary: date, weeks: int,
) -> list[date]:
    """Return calendar Fridays with at least one session in every asset's week."""
    week_starts: list[set[date]] = []
    first_common = date.min
    for frame in frames.values():
        dates = [pd.Timestamp(value).date() for value in frame["date"] if pd.Timestamp(value).date() <= boundary]
        if not dates:
            raise RuntimeError("snapshot has no pre-holdout replay data")
        first_common = max(first_common, min(dates))
        week_starts.append({value - timedelta(days=value.weekday()) for value in dates})
    candidates = [value.date() for value in pd.date_range(first_common, boundary, freq="W-FRI")]
    eligible = [
        friday for friday in candidates
        if all(friday - timedelta(days=4) in starts for starts in week_starts)
    ]
    selected = eligible[-weeks:]
    if len(selected) < weeks:
        raise RuntimeError(f"only {len(selected)} common pre-holdout calendar Fridays are available for {weeks}-week replay")
    return selected


def _validated_bars(
    frames: dict[str, pd.DataFrame], configs: dict[str, Any], repo_root: Path, decision_date: date,
) -> tuple[dict[str, list[Bar]], dict[str, Any]]:
    bars_by_symbol: dict[str, list[Bar]] = {}
    validations: dict[str, Any] = {}
    validation_config = configs["research"]["validation"]
    inception_by_symbol = {
        str(item["symbol"]).upper(): date.fromisoformat(str(item["inception"]))
        for item in configs["assets"]["assets"]
    }
    for symbol, full in frames.items():
        frame = full[pd.to_datetime(full["date"]).dt.date <= decision_date].reset_index(drop=True)
        if frame.empty:
            raise RuntimeError(f"{symbol} has no bars through {decision_date}")
        validation = validate_bars(frame, int(validation_config["maximum_calendar_gap_days"]))
        validation.require_ok()
        first = pd.Timestamp(frame["date"].min()).date()
        if (first - inception_by_symbol[symbol]).days > 21:
            raise RuntimeError(f"{symbol} history begins {first}, materially after configured inception")
        last = pd.Timestamp(frame["date"].max()).date()
        if (decision_date - last).days > 7:
            raise RuntimeError(f"{symbol} data is stale at replay date {decision_date}: latest bar {last}")
        secondary = trenddesk_bars(repo_root / "data" / "trenddesk.db", symbol)
        reconciliation = reconcile_close(
            frame, secondary,
            float(validation_config["reconcile_close_tolerance_pct"]),
            float(validation_config["reconcile_hard_limit_pct"]),
            float(validation_config["reconcile_maximum_outlier_fraction"]),
        )
        if reconciliation["status"] == "review":
            raise RuntimeError(
                f"{symbol} cross-source close reconciliation exceeded tolerance: "
                f"{reconciliation['maximumDifferencePct']}%"
            )
        validations[symbol] = {
            "status": "pass", "rows": len(frame), "from": str(frame.date.min()),
            "to": str(frame.date.max()), "warnings": list(validation.warnings),
            "crossSource": reconciliation,
        }
        bars_by_symbol[symbol] = bars_from_frame(frame)
    return bars_by_symbol, validations


def _signal_checks(
    document: dict[str, Any], bars_by_symbol: dict[str, list[Bar]],
    strategy: Trend30Week, held_before: set[str], decision_date: date,
) -> list[dict[str, object]]:
    checks: list[dict[str, object]] = []
    by_symbol = {str(item["symbol"]): item for item in document["actions"]}
    for symbol, bars in bars_by_symbol.items():
        complete = week_is_complete(bars[-1].date, decision_date)
        oracle_bars = bars
        if not complete:
            monday = decision_date - timedelta(days=decision_date.weekday())
            oracle_bars = [bar for bar in bars if bar.date < monday]
        if not oracle_bars:
            raise RuntimeError(f"{symbol} has no completed-week bars for replay oracle at {decision_date}")
        context = strategy.prepare(oracle_bars)
        index = len(oracle_bars) - 1
        if strategy.entry(index, context):
            expected_state = "uptrend"
            expected_intent = "HOLD" if symbol in held_before else "BUY"
        elif strategy.exit(index, context):
            expected_state = "downtrend"
            expected_intent = "EXIT" if symbol in held_before else "AVOID"
        else:
            expected_state = "transition"
            expected_intent = "HOLD"
        actual = by_symbol[symbol]
        signal_matches = expected_state == actual["state"] and expected_intent == actual["signalIntent"]
        if signal_matches and actual["action"] == actual["signalIntent"]:
            status = "complete"
        elif (
            signal_matches and actual["action"] == "DEFER"
            and actual["signalIntent"] == "BUY" and actual["quantity"] == 0
        ):
            status = "heat-capped"
        else:
            status = "action-mismatch" if signal_matches else "signal-mismatch"
        checks.append({
            "symbol": symbol, "expectedState": expected_state, "actualState": actual["state"],
            "expectedIntent": expected_intent, "actualIntent": actual["signalIntent"],
            "actualAction": actual["action"], "status": status,
            "dataThrough": bars[-1].date.isoformat(), "calendarWeekComplete": complete,
            "oracleDataThrough": oracle_bars[-1].date.isoformat(),
            "matches": status in {"complete", "heat-capped"},
        })
    return checks


def _write_summary(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "week", "last_session", "calendar_week_complete", "status", "reason",
        "symbol", "state", "signal_intent", "action", "quantity",
        "current_heat", "heat_after_buys", "signal_match",
    ]
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def _action_summary(document: dict[str, Any]) -> dict[str, object]:
    return {
        "portfolioHeat": document["portfolioHeat"],
        "actions": [
            {
                "symbol": action["symbol"], "state": action["state"],
                "signalIntent": action["signalIntent"], "action": action["action"],
                "quantity": action["quantity"], "activeStop": action["activeStop"],
                "proposedStop": action["proposedStop"],
            }
            for action in document["actions"]
        ],
    }


def _document_hash(document: dict[str, Any]) -> str:
    body = json.dumps(document, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(body).hexdigest()


def _file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

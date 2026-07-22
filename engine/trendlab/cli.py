from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from trendlab.backtest.walkforward import holdout_cutoff, make_folds, run_walk_forward
from trendlab.config import ENGINE_ROOT, REPO_ROOT, config_hash, load_configs
from trendlab.data.base import EODRequest
from trendlab.data.snapshot import latest_snapshot, write_snapshot
from trendlab.data.store import MarketStore
from trendlab.data.tiingo import TiingoProvider
from trendlab.data.validate import reconcile_close, trenddesk_bars, validate_bars
from trendlab.models import bars_from_frame
from trendlab.parity import verify_node_parity
from trendlab.registry import append_jsonl, experiment_id, write_manifest
from trendlab.reporting.weekly import build_actions, write_actions, write_html
from trendlab.states.trend30w import Trend30Week


RAW_ROOT = ENGINE_ROOT / "data" / "raw"
STORE_PATH = ENGINE_ROOT / "data" / "curated" / "market.duckdb"
OUTPUT_ROOT = ENGINE_ROOT / "output"
REGISTRY_ROOT = ENGINE_ROOT / "registry"


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="trendlab")
    commands = root.add_subparsers(dest="command", required=True)
    weekly = commands.add_parser("run-weekly", help="fetch/validate, classify, size, and emit weekly actions")
    weekly.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    weekly.add_argument("--offline", action="store_true", help="use latest immutable Tiingo snapshots; never fetch")
    weekly.add_argument("--human-hours", type=float)
    weekly.add_argument("--agent-sessions", type=int, default=1)
    weekly.add_argument("--data-spend", type=float)
    backtest = commands.add_parser("backtest", help="run and register embargoed pre-holdout baseline folds")
    backtest.add_argument("--symbol", action="append", help="repeatable; defaults to configured assets")
    parity = commands.add_parser("verify-node", help="compare Python and Node 30-week baselines on identical pre-holdout bars")
    parity.add_argument("--symbol", action="append", help="repeatable; defaults to configured assets")
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "run-weekly":
            output = run_weekly(
                args.as_of, offline=args.offline, human_hours=args.human_hours,
                agent_sessions=args.agent_sessions, data_spend=args.data_spend,
            )
        elif args.command == "backtest":
            output = run_backtests(args.symbol)
        else:
            output = run_parity(args.symbol)
    except Exception as exc:
        print(f"trendlab: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(output, indent=2, default=str))
    return 0


def run_weekly(
    as_of: date, *, offline: bool = False, human_hours: float | None = None,
    agent_sessions: int = 1, data_spend: float | None = None,
) -> dict[str, Any]:
    configs = load_configs()
    assets = configs["assets"]["assets"]
    provider_name = configs["assets"]["provider"]
    if provider_name != "tiingo":
        raise RuntimeError(f"M1 configured provider must be tiingo, got {provider_name}")
    provider = None if offline else TiingoProvider()
    store = MarketStore(STORE_PATH)
    bars_by_symbol: dict[str, list[Any]] = {}
    validations: dict[str, Any] = {}
    snapshot_paths: dict[str, str] = {}
    for asset in assets:
        symbol = str(asset["symbol"]).upper()
        if offline:
            snapshot = latest_snapshot(RAW_ROOT, provider_name, symbol)
            frame = pd.read_parquet(snapshot)
        else:
            assert provider is not None
            frame = provider.fetch(EODRequest(symbol, date.fromisoformat(str(asset["inception"])), as_of))
            snapshot = write_snapshot(
                frame, root=RAW_ROOT, provider=provider_name, symbol=symbol, snapshot_date=as_of,
            )
        frame = frame[pd.to_datetime(frame["date"]).dt.date <= as_of].reset_index(drop=True)
        if frame.empty:
            raise RuntimeError(f"{symbol} snapshot has no bars through {as_of}")
        validation = validate_bars(
            frame, int(configs["research"]["validation"]["maximum_calendar_gap_days"]),
        )
        validation.require_ok()
        first = pd.Timestamp(frame["date"].min()).date()
        inception = date.fromisoformat(str(asset["inception"]))
        if (first - inception).days > 21:
            raise RuntimeError(f"{symbol} history begins {first}, materially after configured inception {inception}")
        last = pd.Timestamp(frame["date"].max()).date()
        if (as_of - last).days > 7:
            raise RuntimeError(f"{symbol} data is stale: latest bar {last}, run date {as_of}")
        store.ingest_snapshot(snapshot, provider_name, symbol)
        curated = store.read(provider_name, symbol, through=as_of.isoformat())
        secondary = trenddesk_bars(REPO_ROOT / "data" / "trenddesk.db", symbol)
        reconciliation = reconcile_close(
            curated, secondary,
            float(configs["research"]["validation"]["reconcile_close_tolerance_pct"]),
            float(configs["research"]["validation"]["reconcile_hard_limit_pct"]),
            float(configs["research"]["validation"]["reconcile_maximum_outlier_fraction"]),
        )
        if reconciliation["status"] == "review":
            raise RuntimeError(
                f"{symbol} cross-source close reconciliation exceeded tolerance: "
                f"{reconciliation['maximumDifferencePct']}%"
            )
        validations[symbol] = {
            "status": "pass", "rows": len(curated), "from": str(curated.date.min()),
            "to": str(curated.date.max()), "warnings": list(validation.warnings),
            "crossSource": reconciliation,
        }
        bars_by_symbol[symbol] = bars_from_frame(curated)
        snapshot_paths[symbol] = str(snapshot.relative_to(ENGINE_ROOT))
    held = _held_symbols(REPO_ROOT / "data" / "portfolio.json")
    document = build_actions(
        bars_by_symbol=bars_by_symbol, configs=configs, provider=provider_name,
        report_date=as_of, held_symbols=held, validation=validations,
    )
    document["runContext"] = _run_context()
    document["snapshots"] = snapshot_paths
    actions_path = REPO_ROOT / "data" / "reports" / f"engine-actions-{as_of.isoformat()}.json"
    html_path = OUTPUT_ROOT / f"weekly-{as_of.isoformat()}.html"
    write_actions(document, actions_path)
    write_html(document, html_path)
    # Weekly-run provenance is committed registry memory, not a local artifact:
    # these runs drive live orders, so they follow the backtest manifests.
    write_manifest(REGISTRY_ROOT / "manifests" / f"run-weekly-{as_of.isoformat()}.json", {
        "kind": "weekly-run", "date": as_of.isoformat(), "configHash": config_hash(configs),
        "snapshots": snapshot_paths, "actions": str(actions_path), "html": str(html_path),
        "completedAt": datetime.now(timezone.utc).isoformat(), "runContext": _run_context(),
    })
    _record_weekly_cost(as_of, human_hours, agent_sessions, data_spend)
    return {"ok": True, "actions": str(actions_path), "html": str(html_path), "symbols": sorted(bars_by_symbol)}


def run_backtests(symbols: list[str] | None = None) -> dict[str, Any]:
    configs = load_configs()
    provider = configs["assets"]["provider"]
    selected = _selected_symbols(configs, symbols)
    research = configs["research"]
    strategy = _strategy(research)
    store = MarketStore(STORE_PATH)
    identifier = experiment_id("baseline")
    manifest_path = REGISTRY_ROOT / "manifests" / f"{identifier}.json"
    manifest: dict[str, Any] = {
        "id": identifier, "date": date.today().isoformat(),
        "hypothesis": "The pre-registered 30-week trend baseline provides transparent out-of-sample reference evidence.",
        "configHash": config_hash(configs), "symbols": selected, "status": "running",
        "foldScheme": research["walk_forward"], "runContext": _run_context(),
    }
    write_manifest(manifest_path, manifest)
    results: dict[str, Any] = {}
    try:
        for symbol in selected:
            full = store.read(provider, symbol)
            bars_all = bars_from_frame(full)
            cutoff = holdout_cutoff(bars_all[-1].date, int(research["holdout"]["months"]))
            research_bars = [bar for bar in bars_all if bar.date <= cutoff]
            fold_config = research["walk_forward"]
            folds = make_folds(
                [bar.date for bar in research_bars], through=cutoff,
                train_years=int(fold_config["train_years"]), test_years=int(fold_config["test_years"]),
                step_years=int(fold_config["step_years"]), embargo_sessions=int(fold_config["embargo_sessions"]),
            )
            if not folds:
                raise RuntimeError(f"no walk-forward folds available for {symbol}")
            results[symbol] = {
                "holdoutCutoff": cutoff.isoformat(),
                **run_walk_forward(
                    research_bars, strategy, folds,
                    commission_bps_per_side=float(research["costs"]["commission_bps_per_side"]),
                    slippage_bps_per_side=float(research["costs"]["slippage_bps_per_side"]),
                ),
            }
        verdict = "recorded"
        manifest.update({"status": "complete", "results": results})
    except Exception as exc:
        verdict = "failed"
        manifest.update({"status": "failed", "error": str(exc)})
        write_manifest(manifest_path, manifest)
        append_jsonl(REGISTRY_ROOT / "experiments.jsonl", _registry_line(manifest, verdict))
        raise
    write_manifest(manifest_path, manifest)
    append_jsonl(REGISTRY_ROOT / "experiments.jsonl", _registry_line(manifest, verdict))
    return {"ok": True, "experimentId": identifier, "manifest": str(manifest_path), "results": results}


def run_parity(symbols: list[str] | None = None) -> dict[str, Any]:
    configs = load_configs()
    provider = configs["assets"]["provider"]
    selected = _selected_symbols(configs, symbols)
    research = configs["research"]
    strategy = _strategy(research)
    store = MarketStore(STORE_PATH)
    results: dict[str, Any] = {}
    for symbol in selected:
        full = bars_from_frame(store.read(provider, symbol))
        cutoff = holdout_cutoff(full[-1].date, int(research["holdout"]["months"]))
        bars = [bar for bar in full if bar.date <= cutoff]
        results[symbol] = verify_node_parity(
            bars, strategy, REPO_ROOT,
            float(research["costs"]["commission_bps_per_side"]),
            float(research["costs"]["slippage_bps_per_side"]),
        )
    return {"ok": all(value["ok"] for value in results.values()), "holdoutEvaluated": False, "results": results}


def _strategy(research: dict[str, Any]) -> Trend30Week:
    item = research["strategy"]
    return Trend30Week(int(item["weekly_fast_period"]), int(item["weekly_slow_period"]), int(item["warmup_daily_bars"]))


def _selected_symbols(configs: dict[str, Any], selected: list[str] | None) -> list[str]:
    allowed = [str(item["symbol"]).upper() for item in configs["assets"]["assets"]]
    if not selected:
        return allowed
    output = [value.upper() for value in selected]
    unknown = sorted(set(output) - set(allowed))
    if unknown:
        raise ValueError(f"symbols not in assets config: {', '.join(unknown)}")
    return output


def _held_symbols(path: Path) -> set[str]:
    if not path.exists():
        return set()
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {str(item["symbol"]).upper() for item in payload.get("positions", []) if float(item.get("qty", 0)) > 0}


def _registry_line(manifest: dict[str, Any], verdict: str) -> dict[str, Any]:
    return {
        "id": manifest["id"], "date": manifest["date"], "hypothesis": manifest["hypothesis"],
        "configHash": manifest["configHash"], "dataRange": {
            symbol: {"holdoutCutoff": value.get("holdoutCutoff")} for symbol, value in manifest.get("results", {}).items()
        },
        "foldScheme": manifest["foldScheme"],
        "headlineMetrics": {symbol: value.get("aggregate") for symbol, value in manifest.get("results", {}).items()},
        "verdict": verdict, "manifest": f"engine/registry/manifests/{manifest['id']}.json",
        "runContext": manifest["runContext"],
    }


def _run_context() -> dict[str, object]:
    try:
        commit = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, check=True,
            text=True, capture_output=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        commit = "unavailable"
    try:
        dirty = bool(subprocess.run(
            ["git", "status", "--porcelain"], cwd=REPO_ROOT, check=True,
            text=True, capture_output=True,
        ).stdout.strip())
    except (OSError, subprocess.CalledProcessError):
        dirty = True
    return {
        "model": os.environ.get("TRENDDESK_AGENT_MODEL", "unspecified"),
        "role": os.environ.get("TRENDDESK_AGENT_ROLE", "quant-implementation"),
        "commit": commit,
        "workingTreeDirty": dirty,
        "sourceHash": _source_hash(),
    }


def _source_hash() -> str:
    digest = hashlib.sha256()
    paths = sorted((ENGINE_ROOT / "trendlab").rglob("*.py"))
    paths += [
        REPO_ROOT / "scripts" / "lib" / "engine-actions.mjs",
        REPO_ROOT / "scripts" / "verify-trend30w.mjs",
    ]
    for path in paths:
        if not path.exists():
            continue
        digest.update(str(path.relative_to(REPO_ROOT)).replace("\\", "/").encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _record_weekly_cost(
    run_date: date, human_hours: float | None, agent_sessions: int, data_spend: float | None,
) -> None:
    # Append-only ledger with last-row-per-week-wins semantics: an incomplete
    # row can be corrected later by re-running with the missing values, which
    # appends a merged row rather than editing history.
    path = REGISTRY_ROOT / "costs.jsonl"
    existing: dict[str, Any] | None = None
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip() and json.loads(line).get("week") == run_date.isoformat():
                existing = json.loads(line)
    if existing is not None:
        if existing.get("status") == "complete":
            return
        adds_information = (
            (human_hours is not None and existing.get("humanHours") is None)
            or (data_spend is not None and existing.get("dataSpend") is None)
        )
        if not adds_information:
            return
        human_hours = human_hours if human_hours is not None else existing.get("humanHours")
        data_spend = data_spend if data_spend is not None else existing.get("dataSpend")
        agent_sessions = max(agent_sessions, int(existing.get("agentSessions") or 0))
    complete = human_hours is not None and data_spend is not None
    append_jsonl(path, {
        "week": run_date.isoformat(), "humanHours": human_hours,
        "agentSessions": agent_sessions, "dataSpend": data_spend,
        "currency": "USD", "status": "complete" if complete else "incomplete",
    })


if __name__ == "__main__":
    raise SystemExit(main())

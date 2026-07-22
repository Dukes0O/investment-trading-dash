from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from jinja2 import Template

from trendlab.config import config_hash
from trendlab.features.weekly import wilder_atr
from trendlab.models import Bar
from trendlab.portfolio.sizing import size_position
from trendlab.states.trend30w import Trend30Week


ACTION_SCHEMA_VERSION = 1
ACTION_VALUES = {"BUY", "HOLD", "EXIT", "AVOID"}


def build_actions(
    *, bars_by_symbol: dict[str, list[Bar]], configs: dict[str, Any],
    provider: str, report_date: date, held_symbols: set[str] | None = None,
    validation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    held_symbols = held_symbols or set()
    research = configs["research"]
    risk = configs["risk"]
    strategy_config = research["strategy"]
    strategy = Trend30Week(
        strategy_config["weekly_fast_period"],
        strategy_config["weekly_slow_period"],
        strategy_config["warmup_daily_bars"],
    )
    actions: list[dict[str, Any]] = []
    for symbol in sorted(bars_by_symbol):
        bars = bars_by_symbol[symbol]
        state = strategy.latest(bars, as_of=report_date)
        held = symbol in held_symbols
        action = "HOLD"
        if state.state == "uptrend" and not held:
            action = "BUY"
        elif state.state == "downtrend":
            action = "EXIT" if held else "AVOID"
        latest = bars[-1]
        atr_values = wilder_atr(bars, int(risk["protection"]["atr_period"]))
        atr = atr_values[-1]
        if atr is None:
            raise RuntimeError(f"ATR unavailable for {symbol}")
        distance = max(
            float(atr) * float(risk["protection"]["atr_multiple"]),
            latest.close * float(risk["protection"]["minimum_stop_distance_fraction"]),
        )
        stop = max(0.01, latest.close - distance)
        sizing = size_position(
            closed_equity=float(risk["account"]["closed_equity"]),
            entry_price=latest.close,
            stop_price=stop,
            risk_fraction=float(risk["account"]["risk_fraction_per_trade"]),
            maximum_heat_fraction=float(risk["account"]["maximum_portfolio_heat_fraction"]),
        )
        actions.append({
            "symbol": symbol,
            "held": held,
            "state": state.state,
            "action": action,
            "signalDate": state.date,
            "referencePrice": round(latest.close, 4),
            "protectiveStop": round(stop, 4),
            "atr14": round(float(atr), 4),
            "quantity": sizing.quantity if action == "BUY" else 0,
            "risk": sizing.to_dict() if action == "BUY" else None,
            "weekly": {
                "close": _round_or_none(state.weekly_close),
                "fastSma": _round_or_none(state.fast_sma),
                "slowSma": _round_or_none(state.slow_sma),
            },
            "rationale": _rationale(state.state, action),
        })
    document = {
        "schemaVersion": ACTION_SCHEMA_VERSION,
        "kind": "trendlab-weekly-actions",
        "reportDate": report_date.isoformat(),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "provider": provider,
        "strategy": {"id": strategy.id, "version": strategy_config["version"]},
        "configHash": config_hash(configs),
        "requiresHumanApproval": True,
        "executionTiming": "next market open after Kyle reviews and approves",
        "actions": actions,
        "validation": validation or {},
    }
    validate_actions(document)
    return document


def validate_actions(document: dict[str, Any]) -> None:
    if document.get("schemaVersion") != ACTION_SCHEMA_VERSION or document.get("kind") != "trendlab-weekly-actions":
        raise ValueError("invalid weekly-actions document header")
    if document.get("requiresHumanApproval") is not True:
        raise ValueError("weekly actions must require human approval")
    actions = document.get("actions")
    if not isinstance(actions, list) or not actions:
        raise ValueError("weekly actions must contain at least one action")
    for index, action in enumerate(actions):
        if action.get("action") not in ACTION_VALUES:
            raise ValueError(f"actions[{index}].action is invalid")
        if not action.get("symbol") or not action.get("signalDate"):
            raise ValueError(f"actions[{index}] is missing symbol/signalDate")
        if action["action"] == "BUY" and (not action.get("quantity") or not action.get("protectiveStop")):
            raise ValueError(f"actions[{index}] BUY requires quantity and protective stop")


def write_actions(document: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")


def write_html(document: dict[str, Any], path: Path) -> None:
    template = Template("""<!doctype html><html><head><meta charset="utf-8"><title>TrendLab {{ reportDate }}</title>
<style>body{font:16px system-ui;max-width:1000px;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:.5rem;text-align:left}.BUY{color:#087f23}.EXIT,.AVOID{color:#b71c1c}</style></head><body>
<h1>TrendLab weekly actions — {{ reportDate }}</h1><p>Strategy {{ strategy.id }} v{{ strategy.version }}. Human approval required; execution is never automated.</p>
<table><thead><tr><th>Symbol</th><th>State</th><th>Action</th><th>Reference</th><th>Stop</th><th>Qty</th><th>Rationale</th></tr></thead><tbody>
{% for item in actions %}<tr><td>{{ item.symbol }}</td><td>{{ item.state }}</td><td class="{{ item.action }}">{{ item.action }}</td><td>{{ item.referencePrice }}</td><td>{{ item.protectiveStop }}</td><td>{{ item.quantity }}</td><td>{{ item.rationale }}</td></tr>{% endfor %}
</tbody></table><p>Config hash: <code>{{ configHash }}</code></p></body></html>""")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(template.render(**document), encoding="utf-8")


def _round_or_none(value: float | None) -> float | None:
    return None if value is None else round(float(value), 4)


def _rationale(state: str, action: str) -> str:
    if state == "uptrend":
        return "Completed weekly close and 10-week SMA are above the 30-week SMA."
    if state == "downtrend":
        return "Completed weekly close is below the 30-week SMA."
    return f"The 30-week baseline is not aligned; remain {action.lower()}."

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
from trendlab.portfolio.heat import calculate_current_heat
from trendlab.portfolio.sizing import size_position
from trendlab.states.trend30w import Trend30Week


ACTION_SCHEMA_VERSION = 2
ACTION_VALUES = {"BUY", "HOLD", "EXIT", "AVOID", "DEFER"}
SIGNAL_INTENT_VALUES = {"BUY", "HOLD", "EXIT", "AVOID"}


def build_actions(
    *, bars_by_symbol: dict[str, list[Bar]], configs: dict[str, Any],
    provider: str, report_date: date, held_symbols: set[str] | None = None,
    held_positions: dict[str, float] | None = None,
    active_stops: dict[str, float] | None = None,
    validation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    held_positions = dict(held_positions or {})
    held_symbols = set(held_symbols or set()) | set(held_positions)
    # Compatibility callers may identify held symbols without quantities, but
    # production heat accounting always supplies held_positions.
    current_heat, heat_positions = calculate_current_heat(
        held_positions, bars_by_symbol, active_stops or {},
    ) if held_positions else (0.0, [])
    research = configs["research"]
    risk = configs["risk"]
    strategy_config = research["strategy"]
    strategy = Trend30Week(
        strategy_config["weekly_fast_period"],
        strategy_config["weekly_slow_period"],
        strategy_config["warmup_daily_bars"],
    )
    actions: list[dict[str, Any]] = []
    configured_order = [str(item["symbol"]).upper() for item in configs["assets"]["assets"]]
    symbol_order = [symbol for symbol in configured_order if symbol in bars_by_symbol]
    symbol_order.extend(sorted(set(bars_by_symbol) - set(symbol_order)))
    running_heat = current_heat
    maximum_heat = float(risk["account"]["closed_equity"]) * float(risk["account"]["maximum_portfolio_heat_fraction"])
    for symbol in symbol_order:
        bars = bars_by_symbol[symbol]
        state = strategy.latest(bars, as_of=report_date)
        held = symbol in held_symbols
        signal_intent = "HOLD"
        if state.state == "uptrend" and not held:
            signal_intent = "BUY"
        elif state.state == "downtrend":
            signal_intent = "EXIT" if held else "AVOID"
        action = signal_intent
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
            current_heat=running_heat,
        )
        risk_detail = None
        if action == "BUY" and sizing.quantity > 0:
            risk_detail = sizing.to_dict()
            running_heat = sizing.portfolio_heat_after
        elif action == "BUY":
            action = "DEFER"
        active_stop = (active_stops or {}).get(symbol) if held else None
        actions.append({
            "symbol": symbol,
            "held": held,
            "state": state.state,
            "signalIntent": signal_intent,
            "action": action,
            "signalDate": state.date,
            "referencePrice": round(latest.close, 4),
            "activeStop": _round_or_none(active_stop),
            "proposedStop": round(stop, 4),
            "atr14": round(float(atr), 4),
            "quantity": sizing.quantity if action == "BUY" else 0,
            "risk": risk_detail,
            "weekly": {
                "close": _round_or_none(state.weekly_close),
                "fastSma": _round_or_none(state.fast_sma),
                "slowSma": _round_or_none(state.slow_sma),
            },
            "rationale": _rationale(state.state, action, sizing.quantity),
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
        "portfolioHeat": {
            "current": current_heat,
            "maximum": round(maximum_heat, 2),
            "afterProposedBuys": round(running_heat, 2),
            "positions": heat_positions,
        },
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
        if action.get("signalIntent") not in SIGNAL_INTENT_VALUES:
            raise ValueError(f"actions[{index}].signalIntent is invalid")
        if not action.get("symbol") or not action.get("signalDate"):
            raise ValueError(f"actions[{index}] is missing symbol/signalDate")
        if not action.get("proposedStop"):
            raise ValueError(f"actions[{index}] requires a proposed stop")
        if action.get("held") and not action.get("activeStop"):
            raise ValueError(f"actions[{index}] held position requires an active stop")
        if action["action"] == "BUY" and (not action.get("quantity") or action["signalIntent"] != "BUY"):
            raise ValueError(f"actions[{index}] BUY requires quantity and BUY signal intent")
        if action["action"] == "DEFER" and (action["signalIntent"] != "BUY" or action.get("quantity") != 0):
            raise ValueError(f"actions[{index}] DEFER requires zero quantity and BUY signal intent")
        if action["action"] != "DEFER" and action["action"] != action["signalIntent"]:
            raise ValueError(f"actions[{index}] action must match signal intent unless heat-capped")


def write_actions(document: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")


def write_html(document: dict[str, Any], path: Path) -> None:
    template = Template("""<!doctype html><html><head><meta charset="utf-8"><title>TrendLab {{ reportDate }}</title>
<style>body{font:16px system-ui;max-width:1100px;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:.5rem;text-align:left}.BUY{color:#087f23}.EXIT,.AVOID{color:#b71c1c}.DEFER{color:#9a6700}</style></head><body>
<h1>TrendLab weekly actions — {{ reportDate }}</h1><p>Strategy {{ strategy.id }} v{{ strategy.version }}. Human approval required; execution is never automated.</p>
<table><thead><tr><th>Symbol</th><th>State</th><th>Intent</th><th>Action</th><th>Reference</th><th>Active stop</th><th>Proposed stop</th><th>Qty</th><th>Rationale</th></tr></thead><tbody>
{% for item in actions %}<tr><td>{{ item.symbol }}</td><td>{{ item.state }}</td><td>{{ item.signalIntent }}</td><td class="{{ item.action }}">{{ item.action }}</td><td>{{ item.referencePrice }}</td><td>{{ item.activeStop }}</td><td>{{ item.proposedStop }}</td><td>{{ item.quantity }}</td><td>{{ item.rationale }}</td></tr>{% endfor %}
</tbody></table><p>Config hash: <code>{{ configHash }}</code></p></body></html>""")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(template.render(**document), encoding="utf-8")


def _round_or_none(value: float | None) -> float | None:
    return None if value is None else round(float(value), 4)


def _rationale(state: str, action: str, sized_quantity: int) -> str:
    if state == "uptrend" and action == "DEFER" and sized_quantity == 0:
        return "The entry signal is active, but the portfolio heat cap leaves no capacity."
    if state == "uptrend":
        return "Completed weekly close and 10-week SMA are above the 30-week SMA."
    if state == "downtrend":
        return "Completed weekly close is below the 30-week SMA."
    return f"The 30-week baseline is not aligned; remain {action.lower()}."

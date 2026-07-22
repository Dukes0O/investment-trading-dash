from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from trendlab.models import Bar


def portfolio_positions(path: Path, allowed_symbols: set[str]) -> dict[str, float]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    positions: dict[str, float] = {}
    for item in payload.get("positions", []):
        symbol = str(item.get("symbol", "")).upper()
        quantity = float(item.get("qty", 0))
        if symbol in allowed_symbols and quantity > 0:
            positions[symbol] = positions.get(symbol, 0.0) + quantity
    return positions


def portfolio_active_stops(path: Path, allowed_symbols: set[str]) -> dict[str, float]:
    """Return broker-confirmed stops explicitly recorded on held positions."""
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    stops: dict[str, float] = {}
    for item in payload.get("positions", []):
        symbol = str(item.get("symbol", "")).upper()
        quantity = float(item.get("qty", 0))
        stop = item.get("activeStop")
        if symbol not in allowed_symbols or quantity <= 0 or stop is None:
            continue
        value = float(stop)
        if value <= 0:
            raise RuntimeError(f"{symbol} portfolio activeStop must be positive")
        if symbol in stops and stops[symbol] != value:
            raise RuntimeError(f"{symbol} portfolio positions have conflicting activeStop values")
        stops[symbol] = value
    return stops


def latest_actions_document(reports_root: Path, through: date | None = None) -> tuple[Path | None, dict[str, Any] | None]:
    candidates: list[tuple[date, Path, dict[str, Any]]] = []
    for path in reports_root.glob("engine-actions-*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            report_date = date.fromisoformat(str(payload["reportDate"]))
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            continue
        if through is None or report_date <= through:
            candidates.append((report_date, path, payload))
    if not candidates:
        return None, None
    _, path, payload = max(candidates, key=lambda item: (item[0], item[1].name))
    return path, payload


def action_stops(document: dict[str, Any] | None) -> dict[str, float]:
    if document is None:
        return {}
    output: dict[str, float] = {}
    schema_version = int(document.get("schemaVersion", 1))
    field = "activeStop" if schema_version >= 2 else "protectiveStop"
    for item in document.get("actions", []):
        symbol = str(item.get("symbol", "")).upper()
        stop = item.get(field)
        if symbol and stop is not None and float(stop) > 0:
            output[symbol] = float(stop)
    return output


def calculate_current_heat(
    positions: dict[str, float], bars_by_symbol: dict[str, list[Bar]], active_stops: dict[str, float],
) -> tuple[float, list[dict[str, float | str]]]:
    total = 0.0
    breakdown: list[dict[str, float | str]] = []
    for symbol in sorted(positions):
        quantity = float(positions[symbol])
        if quantity <= 0:
            raise RuntimeError(f"{symbol} held quantity must be positive")
        bars = bars_by_symbol.get(symbol)
        if not bars:
            raise RuntimeError(f"{symbol} held position has no current market price")
        stop = active_stops.get(symbol)
        if stop is None or stop <= 0:
            raise RuntimeError(f"{symbol} held position has no confirmed active stop in portfolio or latest engine actions")
        current_price = float(bars[-1].close)
        risk = max(0.0, quantity * (current_price - stop))
        total += risk
        breakdown.append({
            "symbol": symbol, "quantity": quantity, "currentPrice": round(current_price, 4),
            "activeStop": round(stop, 4), "risk": round(risk, 2),
        })
    return round(total, 2), breakdown

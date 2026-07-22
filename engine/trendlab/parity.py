from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

from trendlab.backtest.core import simulate
from trendlab.models import Bar
from trendlab.states.trend30w import Trend30Week


def verify_node_parity(
    bars: list[Bar], strategy: Trend30Week, repo_root: Path,
    commission_bps_per_side: float = 0.0, slippage_bps_per_side: float = 5.0,
) -> dict[str, object]:
    # Parity isolates strategy/weekly/execution math by giving both engines the
    # same adjusted OHLC and zero distributions. Production research separately
    # uses raw fills plus distributions.
    compatibility = [Bar(
        bar.date, bar.adj_open, bar.adj_high, bar.adj_low, bar.adj_close, bar.adj_volume,
        bar.adj_open, bar.adj_high, bar.adj_low, bar.adj_close, bar.adj_volume, 0.0, 1.0,
    ) for bar in bars]
    python_result = simulate(
        compatibility, strategy,
        commission_bps_per_side=commission_bps_per_side,
        slippage_bps_per_side=slippage_bps_per_side,
        include_distributions=False,
        finalize_equity_on_end=False,
        trade_rounding_digits=2,
    )
    node_bars = [{
        "date": bar.date.isoformat(), "open": bar.open, "high": bar.high,
        "low": bar.low, "close": bar.close, "volume": bar.volume,
    } for bar in compatibility]
    with tempfile.TemporaryDirectory(prefix="trendlab-parity-") as folder:
        input_path = Path(folder) / "bars.json"
        input_path.write_text(json.dumps(node_bars), encoding="utf-8")
        completed = subprocess.run(
            ["node", str(repo_root / "scripts" / "verify-trend30w.mjs"), str(input_path)],
            cwd=repo_root, check=True, text=True, capture_output=True,
        )
    node_result = json.loads(completed.stdout)
    python_trades = [
        {"entryDate": item.entry_date, "exitDate": item.exit_date, "entryPrice": item.entry_price,
         "exitPrice": item.exit_price, "returnPct": item.return_pct, "reason": item.reason}
        for item in python_result.trades
    ]
    metric_differences = {
        key: round(float(python_result.metrics[key]) - float(node_result["metrics"][key]), 8)
        for key in ("totalReturnPct", "cagrPct", "maxDrawdownPct", "years", "trades", "exposurePct")
        if python_result.metrics.get(key) is not None and node_result["metrics"].get(key) is not None
    }
    trades_match = python_trades == node_result["trades"]
    metrics_match = all(abs(value) <= 1e-8 for value in metric_differences.values())
    return {
        "ok": trades_match and metrics_match,
        "bars": len(bars),
        "from": bars[0].date.isoformat(),
        "to": bars[-1].date.isoformat(),
        "tradesMatch": trades_match,
        "metricsMatch": metrics_match,
        "metricDifferences": metric_differences,
        "pythonMetrics": python_result.metrics,
        "nodeMetrics": node_result["metrics"],
    }

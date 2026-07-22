from pathlib import Path

from trendlab.parity import verify_node_parity
from trendlab.states.trend30w import Trend30Week


def test_python_baseline_matches_node_on_identical_adjusted_bars(bars):
    repo_root = Path(__file__).resolve().parents[2]
    result = verify_node_parity(bars, Trend30Week(), repo_root)
    assert result["ok"], result

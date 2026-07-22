from trendlab.states.trend30w import Trend30WeekLongShort
from trendlab.cli import _long_short_verdict


def test_symmetric_strategy_targets_long_flat_and_short_without_overlap():
    strategy = Trend30WeekLongShort()
    context = ([110.0, 90.0, 101.0], [105.0, 95.0, 99.0], [100.0, 100.0, 100.0])
    assert strategy.target(0, context, 0) == 1
    assert strategy.target(1, context, 1) == -1
    assert strategy.target(1, context, 0) == -1
    assert strategy.target(2, context, -1) == 0


def test_symmetric_strategy_has_no_new_tunable_parameters():
    strategy = Trend30WeekLongShort(10, 30, 210)
    assert (strategy.fast_period, strategy.slow_period, strategy.warmup) == (10, 30, 210)


def test_mirror_is_rejected_when_results_are_not_broadly_supported():
    results = {
        "GLD": {"aggregate": {"foldCount": 13, "foldsBeatingLongFlatReturn": 3, "foldsBeatingLongFlatSharpe": 5, "shortContributionPct": -5.51}},
        "SPY": {"aggregate": {"foldCount": 24, "foldsBeatingLongFlatReturn": 5, "foldsBeatingLongFlatSharpe": 4, "shortContributionPct": -26.9}},
        "TLT": {"aggregate": {"foldCount": 15, "foldsBeatingLongFlatReturn": 6, "foldsBeatingLongFlatSharpe": 6, "shortContributionPct": 18.1}},
    }
    verdict, conclusion = _long_short_verdict(results)
    assert verdict == "rejected"
    assert conclusion["folds"] == 52
    assert conclusion["assetsWithPositiveShortContribution"] == ["TLT"]
    assert conclusion["holdoutEvaluated"] is False

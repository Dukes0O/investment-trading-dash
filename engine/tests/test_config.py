from datetime import date

from trendlab.config import config_hash, load_configs


def test_real_yaml_config_with_dates_has_stable_hash():
    configs = load_configs()
    assert isinstance(configs["assets"]["assets"][0]["inception"], date)
    first = config_hash(configs)
    second = config_hash(load_configs())
    assert first == second
    assert len(first) == 64
    assert configs["research"]["costs"]["short_borrow_bps_per_year"] == 25.0

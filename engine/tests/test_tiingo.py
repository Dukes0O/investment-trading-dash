from trendlab.data.tiingo import parse_tiingo


def test_parse_tiingo_preserves_raw_adjusted_and_distribution_fields():
    frame = parse_tiingo([{
        "date": "2026-07-20T00:00:00.000Z",
        "open": 100, "high": 105, "low": 99, "close": 103, "volume": 10,
        "adjOpen": 50, "adjHigh": 52.5, "adjLow": 49.5, "adjClose": 51.5,
        "adjVolume": 20, "divCash": 0.25, "splitFactor": 2,
    }], "SPY")
    assert str(frame.iloc[0].date) == "2026-07-20"
    assert frame.iloc[0].close == 103
    assert frame.iloc[0].adj_close == 51.5
    assert frame.iloc[0].div_cash == 0.25
    assert frame.iloc[0].split_factor == 2


def test_parse_tiingo_rejects_empty_payload():
    try:
        parse_tiingo([], "SPY")
    except ValueError as exc:
        assert "no daily bars" in str(exc)
    else:
        raise AssertionError("empty payload accepted")

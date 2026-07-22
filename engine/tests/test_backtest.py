from datetime import date, timedelta

from trendlab.backtest.core import buy_and_hold, cash_baseline, simulate
from trendlab.models import Bar


class OneShot:
    warmup = 14

    def prepare(self, bars):
        return None

    def entry(self, index, context):
        return index == 14

    def exit(self, index, context):
        return False


def flat_bars():
    output = []
    current = date(2020, 1, 1)
    for index in range(50):
        open_price = 100.0
        high, low, close = 101.0, 99.0, 100.0
        if index == 16:
            open_price, high, low, close = 90.0, 91.0, 89.0, 90.0
        output.append(Bar(current, open_price, high, low, close, 1, open_price, high, low, close, 1))
        current += timedelta(days=1)
    return output


def test_signal_executes_next_open_and_gap_stop_fills_at_open():
    result = simulate(flat_bars(), OneShot(), stop_atr_multiple=1.0)
    trade = result.trades[0]
    assert trade.entry_date == "2020-01-16"
    assert trade.exit_date == "2020-01-17"
    assert trade.entry_price == 100.05
    assert trade.exit_price == 89.955
    assert trade.reason == "stop"


def test_distribution_is_added_to_raw_price_pnl():
    values = flat_bars()
    values[16] = Bar(
        values[16].date, values[16].open, values[16].high, values[16].low, values[16].close,
        values[16].volume, values[16].adj_open, values[16].adj_high, values[16].adj_low,
        values[16].adj_close, values[16].adj_volume, 1.0, 1.0,
    )
    with_distribution = simulate(values, OneShot(), stop_atr_multiple=None, include_distributions=True)
    without_distribution = simulate(values, OneShot(), stop_atr_multiple=None, include_distributions=False)
    assert with_distribution.metrics["totalReturnPct"] > without_distribution.metrics["totalReturnPct"]


def test_split_adjusts_share_count_for_raw_price_pnl():
    values = flat_bars()
    before = values[16]
    values[16] = Bar(
        before.date, 50, 51, 49, 50, before.volume,
        before.adj_open, before.adj_high, before.adj_low, before.adj_close,
        before.adj_volume, 0.0, 2.0,
    )
    for index in range(17, len(values)):
        item = values[index]
        values[index] = Bar(
            item.date, 50, 51, 49, 50, item.volume,
            item.adj_open, item.adj_high, item.adj_low, item.adj_close,
            item.adj_volume, 0.0, 1.0,
        )
    result = simulate(values, OneShot(), stop_atr_multiple=None)
    assert abs(result.metrics["totalReturnPct"]) < 0.2


def test_buy_hold_and_cash_references_are_explicit():
    values = flat_bars()
    buy_hold = buy_and_hold(values, evaluation_start=values[0].date, evaluation_end=values[-1].date)
    cash = cash_baseline(values, evaluation_start=values[0].date, evaluation_end=values[-1].date)
    assert buy_hold.metrics["trades"] == 1
    assert cash.metrics["totalReturnPct"] == 0
    assert cash.metrics["exposurePct"] == 0

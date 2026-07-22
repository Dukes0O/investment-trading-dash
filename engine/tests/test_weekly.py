from trendlab.features.weekly import completed_week_features, to_weekly


def test_weekly_bars_are_monday_start_and_dated_by_last_session(bars):
    weekly = to_weekly(bars[:10])
    assert len(weekly) == 2
    assert weekly[0].date.isoformat() == "2010-01-08"
    assert weekly[1].date.isoformat() == "2010-01-15"


def test_completed_week_is_exposed_from_its_final_session(bars):
    weekly_close, fast, slow = completed_week_features(bars[:220], 2, 3)
    # Thursday sees no completed week yet; Friday's row sees its own
    # just-completed week (decide at Friday close, fill at Monday open).
    assert weekly_close[3] is None
    assert weekly_close[4] == bars[4].adj_close
    assert weekly_close[5] == bars[4].adj_close  # Monday still sees week 1
    assert fast[4] is None  # 2-week SMA needs a second completed week
    assert fast[9] == (bars[4].adj_close + bars[9].adj_close) / 2
    assert slow[9] is None  # 3-week SMA needs a third completed week


def test_partial_week_never_leaks_into_mid_week_features(bars):
    weekly_close, _, _ = completed_week_features(bars[:220], 2, 3)
    # Wednesday of week 2 (index 7) must still see week 1's close, not the
    # in-progress week's running values.
    assert weekly_close[7] == bars[4].adj_close


def test_week_is_complete_calendar_rule():
    from datetime import date

    from trendlab.features.weekly import week_is_complete

    friday, wednesday = date(2026, 7, 17), date(2026, 7, 15)
    assert week_is_complete(friday, friday)  # Friday-evening run
    assert week_is_complete(friday, date(2026, 7, 18))  # weekend run
    assert not week_is_complete(wednesday, wednesday)  # mid-week run
    # Holiday-shortened week: complete only once the calendar week has ended.
    thursday = date(2026, 7, 16)
    assert not week_is_complete(thursday, date(2026, 7, 17))
    assert week_is_complete(thursday, date(2026, 7, 18))


def test_latest_uses_just_completed_week_on_weekend_run(bars):
    from trendlab.states.trend30w import Trend30Week

    strategy = Trend30Week(10, 30, 210)
    friday_index = max(i for i, bar in enumerate(bars) if bar.date.weekday() == 4)
    cut = bars[: friday_index + 1]
    weekly = to_weekly(cut)
    weekend = strategy.latest(cut, as_of=cut[-1].date)
    assert weekend.weekly_close == weekly[-1].close  # the week that just ended
    mid_week = strategy.latest(cut[:-2], as_of=cut[-3].date)  # ends Wednesday
    assert mid_week.weekly_close == to_weekly(cut[:-2])[-2].close  # prior completed week

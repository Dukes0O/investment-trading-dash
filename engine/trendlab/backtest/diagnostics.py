from __future__ import annotations

from statistics import mean

from trendlab.backtest.core import BacktestResult, EquityPoint, Trade


def cycle_diagnostics(
    buy_hold: BacktestResult,
    strategy: BacktestResult,
    *,
    major_drawdown_threshold_pct: float,
) -> dict[str, object]:
    """Measure complete-cycle loss avoidance, recovery capture, and whipsaw.

    Both curves must cover identical sessions. Returns are measured from the
    two curves independently, so raw-price distributions and production costs
    already reflected by the simulators remain part of the accounting.
    """
    if not 0 < major_drawdown_threshold_pct < 100:
        raise ValueError("major drawdown threshold must be between 0 and 100")
    buy_points = list(buy_hold.equity)
    strategy_points = list(strategy.equity)
    if not buy_points or not strategy_points:
        raise ValueError("diagnostics require non-empty equity curves")
    buy_dates = [point.date for point in buy_points]
    if buy_dates != [point.date for point in strategy_points]:
        raise ValueError("buy-and-hold and strategy equity sessions must align exactly")

    episode_indexes = _decline_episode_indexes(buy_points, major_drawdown_threshold_pct)
    episodes = [
        _episode_metrics(buy_points, strategy_points, peak, trough, recovery)
        for peak, trough, recovery in episode_indexes
    ]
    complete = [episode for episode in episodes if not episode["incomplete"]]
    mean_decline = _mean_metric(complete, "declineAvoidedPct")
    mean_recovery = _mean_metric(complete, "recoveryCapturedPct")
    whipsaw = whipsaw_diagnostics(strategy.trades, buy_dates)
    constraint = _binding_constraint(mean_decline, mean_recovery, float(whipsaw["whipsawCostPct"]))

    return {
        "wealthRatio": _round(strategy_points[-1].value / buy_points[-1].value),
        "strategyFinalWealth": _round(strategy_points[-1].value),
        "buyAndHoldFinalWealth": _round(buy_points[-1].value),
        "episodeCount": len(episodes),
        "completeEpisodeCount": len(complete),
        "meanDeclineAvoidedPct": mean_decline,
        "meanRecoveryCapturedPct": mean_recovery,
        "episodes": episodes,
        "whipsaw": whipsaw,
        "conclusion": constraint,
    }


def whipsaw_diagnostics(trades: tuple[Trade, ...] | list[Trade], sessions: list[str]) -> dict[str, object]:
    session_index = {value: index for index, value in enumerate(sessions)}
    pairs: list[dict[str, object]] = []
    for prior, following in zip(trades, trades[1:]):
        if prior.direction != "long" or following.direction != "long":
            continue
        if prior.exit_date not in session_index or following.entry_date not in session_index:
            raise ValueError("trade date is absent from the diagnostics session calendar")
        sessions_out = session_index[following.entry_date] - session_index[prior.exit_date]
        if sessions_out < 0:
            raise ValueError("trade list is not chronological")
        cost = (following.entry_price / prior.exit_price - 1) * 100
        is_whipsaw = cost > 0
        pairs.append({
            "exitDate": prior.exit_date,
            "exitFill": _round(prior.exit_price),
            "reentryDate": following.entry_date,
            "reentryFill": _round(following.entry_price),
            "sessionsOut": sessions_out,
            "costPct": _round(cost) if is_whipsaw else 0.0,
            "isWhipsaw": is_whipsaw,
        })
    return {
        "exitReentryPairCount": len(pairs),
        "whipsawCount": sum(bool(item["isWhipsaw"]) for item in pairs),
        "whipsawCostPct": _round(sum(float(item["costPct"]) for item in pairs)),
        "avgSessionsOut": _round(mean(float(item["sessionsOut"]) for item in pairs)) if pairs else None,
        "pairs": pairs,
    }


def _decline_episode_indexes(
    equity: list[EquityPoint], threshold_pct: float,
) -> list[tuple[int, int, int | None]]:
    threshold = threshold_pct / 100
    episodes: list[tuple[int, int, int | None]] = []
    peak = 0
    trough: int | None = None
    for index in range(1, len(equity)):
        value = equity[index].value
        if trough is None:
            if value > equity[peak].value:
                peak = index
            elif (equity[peak].value - value) / equity[peak].value >= threshold:
                trough = index
        else:
            if value < equity[trough].value:
                trough = index
            if value >= equity[peak].value:
                episodes.append((peak, trough, index))
                # The recovery close is the reference peak for the next search;
                # only subsequent sessions can start another decline.
                peak = index
                trough = None
    if trough is not None:
        episodes.append((peak, trough, None))
    return episodes


def _episode_metrics(
    buy_hold: list[EquityPoint], strategy: list[EquityPoint],
    peak: int, trough: int, recovery: int | None,
) -> dict[str, object]:
    bh_decline = _return(buy_hold, peak, trough)
    strategy_decline = _return(strategy, peak, trough)
    # The M3 prose defines flat-through-decline as +100%. That meaning requires
    # strategy minus buy-and-hold; the work order's printed operands are reversed.
    decline_avoided = (strategy_decline - bh_decline) / abs(bh_decline) * 100
    observed_end = recovery if recovery is not None else len(strategy) - 1
    exit_delay = _first_position_delay(strategy, peak, trough, "flat")
    reentry_delay = _first_position_delay(strategy, trough, observed_end, "long")

    bh_recovery: float | None = None
    strategy_recovery: float | None = None
    recovery_captured: float | None = None
    bh_cycle: float | None = None
    strategy_cycle: float | None = None
    cycle_capture: float | None = None
    if recovery is not None:
        bh_recovery = _return(buy_hold, trough, recovery)
        strategy_recovery = _return(strategy, trough, recovery)
        bh_cycle = _return(buy_hold, peak, recovery)
        strategy_cycle = _return(strategy, peak, recovery)
        recovery_captured = strategy_recovery / bh_recovery * 100 if bh_recovery else None
        cycle_capture = strategy_cycle / bh_recovery * 100 if bh_recovery else None

    return {
        "peakDate": buy_hold[peak].date,
        "troughDate": buy_hold[trough].date,
        "recoveryDate": buy_hold[recovery].date if recovery is not None else None,
        "incomplete": recovery is None,
        "peakWealth": _round(buy_hold[peak].value),
        "troughWealth": _round(buy_hold[trough].value),
        "buyAndHoldDeclineReturnPct": _round(bh_decline * 100),
        "strategyDeclineReturnPct": _round(strategy_decline * 100),
        "buyAndHoldRecoveryReturnPct": _optional_pct(bh_recovery),
        "strategyRecoveryReturnPct": _optional_pct(strategy_recovery),
        "buyAndHoldCycleReturnPct": _optional_pct(bh_cycle),
        "strategyCycleReturnPct": _optional_pct(strategy_cycle),
        "declineAvoidedPct": _round(decline_avoided),
        "recoveryCapturedPct": _optional_round(recovery_captured),
        "exitDelaySessions": exit_delay,
        "reentryDelaySessions": reentry_delay,
        "cycleCapturePct": _optional_round(cycle_capture),
    }


def _first_position_delay(
    equity: list[EquityPoint], start: int, end: int, position: str,
) -> int | None:
    if equity[start].position == position:
        return 0
    for index in range(start + 1, end + 1):
        if equity[index].position == position:
            return index - start
    return None


def _binding_constraint(
    mean_decline_avoided_pct: float | None,
    mean_recovery_captured_pct: float | None,
    whipsaw_cost_pct: float,
) -> dict[str, object]:
    costs = {
        "late-exit": None if mean_decline_avoided_pct is None else _round(max(0.0, 100 - mean_decline_avoided_pct)),
        "late-reentry": None if mean_recovery_captured_pct is None else _round(max(0.0, 100 - mean_recovery_captured_pct)),
        "whipsaw": _round(max(0.0, whipsaw_cost_pct)),
    }
    measured = [(name, float(value)) for name, value in costs.items() if value is not None]
    winner, largest = max(measured, key=lambda item: item[1]) if measured else ("none", 0.0)
    if largest == 0:
        winner = "none"
    return {
        "bindingConstraint": winner,
        "largestMeasuredCostPct": _round(largest),
        "costComparisonPct": costs,
        "arithmetic": {
            "late-exit": "max(0, 100 - meanDeclineAvoidedPct)",
            "late-reentry": "max(0, 100 - meanRecoveryCapturedPct)",
            "whipsaw": "sum(max(0, reentryFill / exitFill - 1) * 100)",
            "selection": "largest available measured cost; none only when all are zero",
        },
    }


def _return(equity: list[EquityPoint], start: int, end: int) -> float:
    return equity[end].value / equity[start].value - 1


def _mean_metric(items: list[dict[str, object]], key: str) -> float | None:
    values = [float(item[key]) for item in items if item.get(key) is not None]
    return _round(mean(values)) if values else None


def _optional_pct(value: float | None) -> float | None:
    return None if value is None else _round(value * 100)


def _optional_round(value: float | None) -> float | None:
    return None if value is None else _round(value)


def _round(value: float) -> float:
    return round(value, 6)

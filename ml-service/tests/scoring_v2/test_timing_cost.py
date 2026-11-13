"""v2.2.0 (decision 7, 2026-11-13): the timing component scores an hour by its excess COST, not by its rank.

The hour profile is the median effective half-spread (bps) of public taker events that STARTED in that hour. The
v2.1.0 profile (median quoted half-spread + median absolute 1-minute move) mostly read volatility (LOG §L). A rank
over 24 hours would turn near-identical costs on one-tick markets into a 0-100 spread, so the score instead uses the
excess over the symbol's cheapest hours, with a materiality floor below which the score is full. All values by hand.
"""
import numpy as np
import pytest

from measure.data.aggtrades import AggTradeWindow
from scoring_v2.calibrate import day_summary, load_summary, merge_summaries, save_summary
from scoring_v2.components import TIMING_REFERENCE_HOURS, timing_cost_score, timing_excess_bps

H5 = 5 * 3_600_000
# The same rows as test_calibrate_events.ROWS, shifted into UTC hour 5.
ROWS = [(1, 100.00, 1.0, H5 + 1000, True), (2, 100.02, 1.0, H5 + 1500, False), (3, 100.02, 2.0, H5 + 2000, False),
        (4, 100.03, 1.0, H5 + 2000, False), (5, 100.05, 1.0, H5 + 2000, False), (6, 100.01, 3.0, H5 + 2000, True),
        (7, 100.00, 1.0, H5 + 2500, True)]


def test_day_summary_keeps_taker_event_costs_by_hour_of_the_event():
    # Event costs (test_calibrate_events): NaN (no quote), 2.0, 1.99980002, 0.0, 2.99910027, all starting in hour 5.
    s = day_summary(AggTradeWindow.from_rows("X", ROWS), tick=0.01)
    assert sorted(s["hourEvent"]) == [5]
    assert s["hourEvent"][5].tolist() == pytest.approx([2.0, 1.99980002, 0.0, 2.99910027], abs=1e-8)
    assert s["hourEventN"] == {5: 4}
    # Typical mid of the day: median of the mids before the five events with a quote: 100.00 (id2 proxy), 100.01
    # (ids 3-5), 100.01 (id 6), 100.03 (id 7) -> sorted 100.00, 100.01, 100.01, 100.03 -> median 100.01.
    assert s["mid"] == pytest.approx(100.01)


def test_hour_event_samples_are_a_deterministic_stride_when_over_the_cap():
    # 4 finite values, cap 3 -> stride ceil(4/3) = 2 -> values at positions 0 and 2: 2.0 and 0.0. The count stays 4.
    s = day_summary(AggTradeWindow.from_rows("X", ROWS), tick=0.01, hour_event_cap=3)
    assert s["hourEvent"][5].tolist() == pytest.approx([2.0, 0.0], abs=1e-8)
    assert s["hourEventN"][5] == 4


def test_summary_round_trip_keeps_hour_events(tmp_path):
    s = day_summary(AggTradeWindow.from_rows("X", ROWS), tick=0.01)
    save_summary(tmp_path / "d.npz", s)
    b = load_summary(tmp_path / "d.npz")
    assert np.array_equal(b["hourEvent"][5], s["hourEvent"][5])
    assert b["hourEventN"] == {5: 4} and b["mid"] == pytest.approx(s["mid"])


def _full_day(base):
    """24 hours; hour h has event costs [h + base, h + 3.0 + base]; typical mid 100, tick 0.01 -> step 1.0 bps."""
    return {"spread": {}, "drift": {}, "tick": 0.01, "events": 0, "mid": 100.0, "hourSpread": {}, "hourRet": {},
            "hourEvent": {h: np.array([h + 1.0 + base, h + 3.0]) for h in range(24)},
            "hourEventN": {h: 2 for h in range(24)}}


def test_merge_pools_events_then_takes_the_median_and_the_step():
    # Day A hour h: [h+1, h+3]; day B (base 1.0): [h+2, h+3]. Pooled [h+1, h+2, h+3, h+3] -> median (h+2 + h+3)/2.
    m = merge_summaries([_full_day(0.0), _full_day(1.0)], min_profile_days=2)
    assert m["costProfile"]["medianBps"] == pytest.approx([h + 2.5 for h in range(24)])
    assert m["costProfile"]["events"] == [4] * 24
    # One price step in bps: tick / mid x 1e4 = 0.01 / 100 x 1e4 = 1.0, median over days.
    assert m["costProfile"]["stepBps"] == pytest.approx(1.0)


def test_calibrate_summaries_has_a_cost_mode_and_a_volatility_mode():
    import importlib.util
    from pathlib import Path
    spec = importlib.util.spec_from_file_location("calibrate_v2", Path(__file__).resolve().parents[2] / "scripts" / "calibrate_v2.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    day = _full_day(0.0)
    day["hourSpread"] = {h: np.array([float(h)]) for h in range(24)}      # volatility mode: 2h (quoted half-spread h + return h)
    day["hourRet"] = {h: np.array([float(h)]) for h in range(24)}
    sums = {"X": [day, day]}
    _, prof, counts = mod.calibrate_summaries(sums, 2, "event_cost")
    # Each day hour h: [h+1, h+3] -> pooled over two identical days median h+2. step = 0.01 / 100 x 1e4 = 1.0; floor = 1 step.
    assert prof["X"] == [h + 2.0 for h in range(24)]
    assert counts["X"]["timing"]["stepBps"] == 1.0 and counts["X"]["timing"]["floorBps"] == 1.0
    _, prof_v, counts_v = mod.calibrate_summaries(sums, 2, "volatility")
    assert prof_v["X"] == [2.0 * h for h in range(24)] and "timing" not in counts_v["X"]


def test_cost_profile_needs_min_profile_days_in_every_hour():
    day = _full_day(0.0)
    day["hourEvent"].pop(7)
    assert merge_summaries([_full_day(0.0), day], min_profile_days=2)["costProfile"] is None
    assert merge_summaries([_full_day(0.0), day], min_profile_days=1)["costProfile"] is not None


# --- the score -----------------------------------------------------------------------------------------------
# Anchors (bps) a10..a99 = 0, 1, 3, 5 score 100, 75, 40, 0. Profile: hours 0-2 cost 1.0, hour 3 1.5, hour 4 2.0,
# hour 5 4.0, hour 6 onward 3.0. Reference = mean of the 3 cheapest hours = 1.0. Floor 0.25 bps.
PROFILE = [1.0, 1.0, 1.0, 1.5, 2.0, 4.0] + [3.0] * 18
ANCH = [0.0, 1.0, 3.0, 5.0]


def test_reference_is_the_mean_of_the_three_cheapest_hours():
    assert TIMING_REFERENCE_HOURS == 3
    assert timing_excess_bps(0, PROFILE) == pytest.approx(0.0)
    assert timing_excess_bps(5, PROFILE) == pytest.approx(3.0)
    # Cheapest three 1.0, 1.5, 1.5 -> reference (1.0 + 1.5 + 1.5) / 3 = 1.33333333. Hour 0 (1.0) is below it: clipped to 0.
    assert timing_excess_bps(0, [1.0, 1.5, 1.5] + [2.0] * 21) == 0.0
    assert timing_excess_bps(1, [1.0, 1.5, 1.5] + [2.0] * 21) == pytest.approx(1.5 - 4.0 / 3, abs=1e-12)    # 0.16666667


def test_reference_hours_can_be_set_for_the_sensitivity_table():
    p = [1.0, 1.5, 1.5] + [2.0] * 21
    # 1 hour: reference 1.0; hour 1 costs 1.5 -> 0.5.  6 hours: (1 + 1.5 + 1.5 + 2 + 2 + 2) / 6 = 10 / 6 -> hour 5 (2.0): 0.33333333.
    assert timing_excess_bps(1, p, 1) == pytest.approx(0.5)
    assert timing_excess_bps(5, p, 6) == pytest.approx(2.0 - 10 / 6, abs=1e-12)
    for bad in (0, 25, 2.5):
        with pytest.raises(ValueError):
            timing_excess_bps(0, p, bad)
    # The score takes the same parameter: hour 1, floor 0.25, reference 1 hour -> excess 0.25 -> x = 1.25 on ANCH -> 94.1666667.
    assert timing_cost_score(1, p, 0.25, ANCH, reference_hours=1) == pytest.approx(94.16666667, abs=1e-7)


@pytest.mark.parametrize("hour,expected", [
    (0, 100.0),                      # excess 0
    (3, 94.16666667),                # excess 0.5 - floor 0.25 = 0.25 -> x = 1.25: 75 - 0.25/2 x 35 = 70.625 -> /75 x 100
    (4, 82.5),                       # excess 1.0 - 0.25 = 0.75 -> x = 1.75: 75 - 0.75/2 x 35 = 61.875 -> 82.5
    (5, 33.33333333),                # excess 3.0 - 0.25 = 2.75 -> x = 3.75: 40 - 0.75/2 x 40 = 25 -> 33.3333
    (6, 59.16666667),                # excess 2.0 - 0.25 = 1.75 -> x = 2.75: 75 - 1.75/2 x 35 = 44.375 -> 59.1667
])
def test_score_from_excess_over_the_floor(hour, expected):
    assert timing_cost_score(hour, PROFILE, 0.25, ANCH) == pytest.approx(expected, abs=1e-7)


def test_below_the_floor_the_score_is_full_even_without_anchors():
    # Hour 3 costs 0.5 bps over the reference; a floor of 0.5 or more makes it full. No anchors needed for that.
    assert timing_cost_score(3, PROFILE, 0.5, None) == 100.0
    assert timing_cost_score(3, PROFILE, 0.75, None) == 100.0


def test_above_the_floor_without_anchors_is_insufficient_data():
    assert timing_cost_score(5, PROFILE, 0.25, None) is None
    assert timing_cost_score(5, PROFILE, 0.25, [1.0, 1.0, 2.0, 3.0]) is None   # anchors not strictly increasing


def test_very_costly_hour_scores_zero_not_negative():
    assert timing_cost_score(5, [1.0] * 23 + [100.0], 0.0, ANCH) == 100.0       # hour 5 is 1.0, a cheapest hour
    assert timing_cost_score(23, [1.0] * 23 + [100.0], 0.0, ANCH) == 0.0        # x = 1 + 99 >= a99


@pytest.mark.parametrize("bad", [[1.0] * 23, [1.0] * 25, [1.0] * 23 + [float("nan")], [1.0] * 23 + [-0.1]])
def test_profile_needs_24_finite_non_negative_values(bad):
    with pytest.raises(ValueError):
        timing_cost_score(0, bad, 0.0, ANCH)


def test_hour_and_floor_are_validated():
    with pytest.raises(ValueError):
        timing_cost_score(24, PROFILE, 0.0, ANCH)
    with pytest.raises(ValueError):
        timing_cost_score(0, PROFILE, -0.1, ANCH)


# --- account scoring under a version with timingUnit "excess_event_cost" ------------------------------------------
# Fixture of test_score.py: hour 14, fill notional 100.02 (bucket lt1k), spread anchors lt1k (0.5, 1.0, 2.0, 4.0),
# profile h+1 for hour h. Reference = mean(1, 2, 3) = 2.0; hour 14 costs 15.0 -> excess 13.0.
def _v(floor):
    from tests.scoring_v2.test_score import VERSION
    v = {**VERSION, "id": "v2.2.0", "timingUnit": "excess_event_cost"}
    if floor is not None:
        v["timingFloorBps"] = {"XUSDT": floor}
    return v


def _timing(floor):
    from scoring_v2.score import score_account_v2
    from tests.scoring_v2.test_score import ACC, make_db
    return score_account_v2(make_db(20), ACC, _v(floor), "ff" * 32, now_ms=0)["result"]["components"]["timing"]


def test_account_timing_zero_when_excess_far_above_the_floor():
    # floor 0: excess 13 -> x = 1.0 + 13 = 14 >= a99 (4) -> 0.
    assert _timing(0.0)["score"] == 0.0


def test_account_timing_on_the_spread_ladder_above_the_floor():
    # floor 12: excess 1.0 -> x = 1.0 + 1.0 = 2.0 = a90 -> 40 points -> 40 / 75 x 100 = 53.33333333.
    assert _timing(12.0)["score"] == pytest.approx(53.33333333, abs=1e-7)
    assert _timing(13.0)["score"] == 100.0            # floor 13 or more: no material excess


def test_account_timing_not_measured_without_a_floor():
    t = _timing(None)
    assert t["score"] is None and t["measured"] == 0

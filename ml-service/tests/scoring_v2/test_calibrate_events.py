"""M1.1: the public spread baseline is measured on taker events, not on single prints, and calibration streams one
small summary per day. Hand values below; the bias they fix is in docs/research/LOG.md §K and ADR-0012."""
import numpy as np
import pytest

from measure.data.aggtrades import AggTradeWindow
from scoring_v2.calibrate import (
    MIN_PROFILE_DAYS, day_summary, load_summary, merge_summaries, print_effective_half_bps, save_summary, spread_by_bucket,
    taker_events,
)

# One taker buy walks three levels at t=2000 (ids 3-5, same ms, same side), a seller hits the bid in the same ms
# (id 6, other side: a separate event), then a seller at t=2500.
#   id  price   qty  ts    is_buyer_maker
ROWS = [
    (1, 100.00, 1.0, 1000, True),    # seller-initiated: bid proxy 100.00
    (2, 100.02, 1.0, 1500, False),   # buyer-initiated: ask proxy 100.02
    (3, 100.02, 2.0, 2000, False),   # \
    (4, 100.03, 1.0, 2000, False),   #  } one taker event (buy)
    (5, 100.05, 1.0, 2000, False),   # /
    (6, 100.01, 3.0, 2000, True),    # one taker event (sell), same ms
    (7, 100.00, 1.0, 2500, True),    # one taker event (sell)
]


def W():
    return AggTradeWindow.from_rows("X", ROWS)


def test_taker_events_hand_values():
    # Events in id order:
    #   id1: no print before it -> NaN.                                              notional 100.00
    #   id2: before 1500 only the bid side exists -> last trade 100.00; buy: (100.02-100.00)/100.00 x 1e4 = 2.0
    #                                                                                notional 100.02
    #   ids3-5: mid strictly before 2000 = (100.02 + 100.00)/2 = 100.01; VWAP = (200.04+100.03+100.05)/4 = 100.03
    #           buy: (100.03 - 100.01)/100.01 x 1e4 = 1.99980002                    notional 400.12
    #   id6: same mid 100.01; sell at 100.01 -> 0.0                                  notional 300.03
    #   id7: before 2500: ask 100.05 (id5), bid 100.01 (id6) -> mid 100.03; sell at 100.00:
    #        -(100.00 - 100.03)/100.03 x 1e4 = 2.99910027                            notional 100.00
    eff, notional = taker_events(W())
    assert np.isnan(eff[0])
    assert eff[1:].tolist() == pytest.approx([2.0, 1.99980002, 0.0, 2.99910027], abs=1e-8)
    assert notional.tolist() == pytest.approx([100.00, 100.02, 400.12, 300.03, 100.00])


def test_print_level_rule_counts_the_walked_levels_separately():
    # The v2.0.0 rule measured ids 3, 4, 5 as three prints against the same mid 100.01:
    # 0.99990001, 1.99980002 and 3.99960004 bps. Two of the three "public takers" are levels of one order.
    eff, _ = print_effective_half_bps(W())
    assert eff[2:5].tolist() == pytest.approx([0.99990001, 1.99980002, 3.99960004], abs=1e-8)


def test_events_split_on_side_and_millisecond_but_not_on_price():
    # Same ms, same side, contiguous -> one event; a different side in between -> separate events.
    w = AggTradeWindow.from_rows("X", [(1, 10.0, 1.0, 1000, True), (2, 10.1, 1.0, 1000, False), (3, 10.2, 1.0, 2000, False),
                                       (4, 10.0, 1.0, 2000, True), (5, 10.3, 1.0, 2000, False), (6, 10.3, 1.0, 2001, False)])
    _, notional = taker_events(w)
    assert notional.tolist() == pytest.approx([10.0, 10.1, 10.2, 10.0, 10.3, 10.3])
    w2 = AggTradeWindow.from_rows("X", [(1, 10.0, 1.0, 1000, False), (2, 10.1, 2.0, 1000, False), (3, 10.2, 1.0, 1000, False)])
    _, n2 = taker_events(w2)
    assert n2.tolist() == pytest.approx([10.0 + 20.2 + 10.2])


def test_empty_window_has_no_events():
    eff, notional = taker_events(AggTradeWindow.from_rows("X", []))
    assert len(eff) == 0 and len(notional) == 0


def _day(offset_ms: int, n: int = 400):
    """A synthetic day: alternating seller/buyer prints every 1000 ms at 100.00 / 100.02, starting at offset."""
    rows = [(k + 1, 100.02 if k % 2 else 100.00, 1.0, offset_ms + k * 1000, k % 2 == 0) for k in range(n)]
    return AggTradeWindow.from_rows("X", rows)


def test_day_summary_round_trip_and_merge_equal_direct_computation(tmp_path):
    days = [_day(0), _day(86_400_000)]
    sums = [day_summary(w, tick=0.01) for w in days]
    for i, s in enumerate(sums):
        save_summary(tmp_path / f"d{i}.npz", s)
    loaded = [load_summary(tmp_path / f"d{i}.npz") for i in range(2)]
    for a, b in zip(sums, loaded):
        assert a["tick"] == b["tick"] and a["events"] == b["events"]
        for k in ("spread", "drift", "hourSpread", "hourRet"):
            assert sorted(a[k]) == sorted(b[k])
            for key in a[k]:
                assert np.array_equal(a[k][key], b[k][key])
    merged = merge_summaries(loaded, min_profile_days=1)
    assert merged["spread"] == spread_by_bucket(days)
    # Per day: the first print has no quote (NaN, dropped); the second sees only the bid side (last trade 100.00,
    # 2.0 bps); the other 397 pay (100.02 - 100.01)/100.01 x 1e4 = 0.99990001 bps. So p10 = p50 = p90: the
    # percentiles are not strictly increasing, and the anchors are None ("insufficient data"), never a made-up spread.
    assert merged["spread"]["lt1k"] is None
    assert merged["counts"]["spread"]["lt1k"] == 2 * 399


def test_hour_profile_needs_min_profile_days():
    # Each synthetic day covers 400 s of hour 0 only: hours 1-23 have no day, so the profile is None at any minimum.
    sums = [day_summary(_day(d * 86_400_000), tick=0.01) for d in range(3)]
    assert merge_summaries(sums, min_profile_days=1)["profile"] is None

    def full(day):
        # 24 hours: hour h has quoted half-spread samples [h] and returns [h]: profile value = 2h.
        return {"spread": {}, "drift": {}, "tick": 0.01, "events": 0,
                "hourSpread": {h: np.array([float(h)]) for h in range(24)},
                "hourRet": {h: np.array([float(h)]) for h in range(24) if not (day == 0 and h == 5)}}
    three = [full(0), full(1), full(2)]
    assert merge_summaries(three, min_profile_days=2)["profile"] == pytest.approx([2.0 * h for h in range(24)])
    assert merge_summaries(three, min_profile_days=3)["profile"] is None        # hour 5 has returns on 2 days only
    assert merge_summaries(three, min_profile_days=3)["profileDays"][5] == 2
    assert MIN_PROFILE_DAYS >= 30

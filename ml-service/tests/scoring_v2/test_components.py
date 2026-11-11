"""C2: component unit scores. Hand values from the M1 plan, Part C2."""
import pytest

from scoring_v2.components import (
    WEIGHTS, duration_bucket, fee_score, notional_bucket, slippage_score, spread_score, timing_score,
)


def test_weights_sum_to_one():
    assert WEIGHTS == {"slippage": 0.35, "fees": 0.25, "timing": 0.25, "spread": 0.15}
    assert sum(WEIGHTS.values()) == pytest.approx(1.0, abs=1e-12)


@pytest.mark.parametrize("paid,want", [(7.5, 100.0), (10, 100.0), (15, 50.0), (20, 0.0), (25, 0.0)])
def test_fee_score_best_rate_10_bps(paid, want):
    # 100 at or below the best rate; linear to 0 at 2x the best rate: paid 15 -> 100 x (20 - 15)/10 = 50
    assert fee_score(paid, best_bps=10.0) == pytest.approx(want, abs=1e-12)


@pytest.mark.parametrize("paid,want", [(0, 100.0), (5, 50.0), (10, 0.0), (12, 0.0)])
def test_fee_score_zero_best_rate_uses_published_taker(paid, want):
    assert fee_score(paid, best_bps=0.0, published_taker_bps=10.0) == pytest.approx(want, abs=1e-12)


def test_fee_score_zero_best_without_published_rate_is_unmeasured():
    assert fee_score(1.0, best_bps=0.0) is None


def test_fee_score_negative_paid_is_a_rebate():
    assert fee_score(-1.0, best_bps=10.0) == 100.0


def test_timing_strict_ranks():
    profile = [float(i + 1) for i in range(24)]          # hour h has index h + 1
    assert timing_score(0, profile) == pytest.approx(100.0)
    assert timing_score(23, profile) == pytest.approx(0.0)
    assert timing_score(11, profile) == pytest.approx(100 * (1 - 11 / 23), abs=1e-9)   # 52.17391304
    assert timing_score(11, profile) == pytest.approx(52.17391304, abs=1e-8)


def test_timing_ties_share_the_better_score():
    profile = [1.0, 1.0] + [float(i) for i in range(2, 24)]
    assert timing_score(0, profile) == 100.0 and timing_score(1, profile) == 100.0


@pytest.mark.parametrize("bad", [[1.0] * 23, [1.0] * 23 + [float("nan")], None])
def test_timing_needs_24_finite_values(bad):
    with pytest.raises(ValueError):
        timing_score(0, bad)


def test_timing_hour_range():
    with pytest.raises(ValueError):
        timing_score(24, [1.0] * 24)


def test_spread_at_or_below_half_tick_is_100_whatever_the_anchors():
    # tick 0.01, mid 100.00 -> half a tick = 0.005/100 x 1e4 = 0.5 bps
    anchors = (0.0, 0.1, 0.2, 0.3)
    assert spread_score(0.5, half_tick_bps=0.5, anchors=anchors) == 100.0
    assert spread_score(0.4, half_tick_bps=0.5, anchors=anchors) == 100.0
    assert spread_score(0.6, half_tick_bps=0.5, anchors=(0.5, 1.0, 2.0, 4.0)) == pytest.approx(100 - 0.1 / 0.5 * 25, abs=1e-9)


def test_spread_and_slippage_without_anchors_are_unmeasured():
    assert spread_score(1.0, half_tick_bps=0.5, anchors=None) is None
    assert slippage_score(1.0, anchors=None) is None
    assert slippage_score(1.0, anchors=(0, 0, 1, 2)) is None        # not strictly increasing -> insufficient data


def test_slippage_uses_anchor_mapping():
    assert slippage_score(2.0, anchors=(-2.0, 0.0, 4.0, 10.0)) == pytest.approx(57.5, abs=1e-12)


@pytest.mark.parametrize("ms,b", [(0, "lt1s"), (999, "lt1s"), (1000, "1s-10s"), (59_999, "10s-1m"), (60_000, "1m-10m"),
                                  (600_000, "10m-1h"), (3_600_000, "ge1h")])
def test_duration_buckets(ms, b):
    assert duration_bucket(ms) == b


@pytest.mark.parametrize("usd,b", [(5, "lt1k"), (1000, "1k-10k"), (99_999, "10k-100k"), (100_000, "ge100k")])
def test_notional_buckets(usd, b):
    assert notional_bucket(usd) == b

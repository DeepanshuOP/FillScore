"""M3 plan §2, hand-computed. Square-root impact model and split conformal intervals (numpy only)."""
import math

import pytest

from expected_cost.conformal import conformal_quantile, coverage, interval
from expected_cost.impact import expected_cost_bps, fit_y, in_range, participation_term


# ── square-root model ────────────────────────────────────────────────────────
# sigma 10 bps, Q 4, V 100: sqrt(4 / 100) = 0.2, feature = 10 x 0.2 = 2.0 bps.
# half-spread 0.5, Y 0.8: expected = 0.5 + 0.8 x 2.0 = 2.1 bps.
def test_participation_term_and_expected_cost():
    assert participation_term(10.0, 4.0, 100.0) == pytest.approx(2.0)
    assert expected_cost_bps(0.5, 10.0, 4.0, 100.0, 0.8) == pytest.approx(2.1)
    assert expected_cost_bps(0.5, 10.0, 0.0, 100.0, 0.8) == pytest.approx(0.5)       # no quantity: only the half-spread


def test_the_cost_grows_with_the_square_root_of_the_quantity():
    a = expected_cost_bps(0.0, 10.0, 1.0, 100.0, 1.0)
    b = expected_cost_bps(0.0, 10.0, 4.0, 100.0, 1.0)                                # 4 x the quantity: twice the impact
    assert b == pytest.approx(2 * a)


@pytest.mark.parametrize("args", [(-1.0, 4.0, 100.0), (10.0, -4.0, 100.0), (10.0, 4.0, 0.0), (10.0, 4.0, -5.0),
                                  (float("nan"), 4.0, 100.0), (10.0, float("inf"), 100.0)])
def test_participation_term_refuses_nonsense(args):
    with pytest.raises(ValueError):
        participation_term(*args)


# Fit: x = [1, 2, 3], r = [1.1, 1.9, 3.2]. sum(x r) = 1.1 + 3.8 + 9.6 = 14.5; sum(x^2) = 14; Y = 14.5 / 14 = 1.0357142857.
def test_fit_y_least_squares_through_the_origin():
    assert fit_y([1, 2, 3], [1.1, 1.9, 3.2]) == pytest.approx(14.5 / 14)
    assert fit_y([1, 2, 3], [2, 4, 6]) == pytest.approx(2.0)                          # an exact line recovers its slope


def test_fit_y_refuses_what_it_cannot_identify():
    with pytest.raises(ValueError):
        fit_y([1.0], [1.0])                                                           # one event
    with pytest.raises(ValueError):
        fit_y([0.0, 0.0, 0.0], [1.0, 2.0, 3.0])                                       # all features zero
    with pytest.raises(ValueError):
        fit_y([1.0, 2.0], [1.0])                                                      # length mismatch
    with pytest.raises(ValueError):
        fit_y([1.0, float("nan")], [1.0, 2.0])


def test_in_range_is_inclusive_and_outside_is_not_extrapolated():
    assert in_range(1.0, 1.0, 5.0) and in_range(5.0, 1.0, 5.0) and in_range(3.0, 1.0, 5.0)
    assert not in_range(0.999, 1.0, 5.0) and not in_range(5.001, 1.0, 5.0)


# ── split conformal ──────────────────────────────────────────────────────────
# n = 10 scores 1..10, alpha 0.1: k = ceil(11 x 0.9) = ceil(9.9) = 10 -> 10th smallest = 10.
# n = 9, alpha 0.1: k = ceil(10 x 0.9) = 9 -> 9.   n = 8, alpha 0.1: k = ceil(9 x 0.9) = ceil(8.1) = 9 > 8 -> None.
# n = 10, alpha 0.2: k = ceil(11 x 0.8) = ceil(8.8) = 9 -> 9.   n = 19, alpha 0.05: k = ceil(20 x 0.95) = 19 -> 19th.
def test_conformal_quantile_hand_values():
    assert conformal_quantile(list(range(1, 11)), 0.1) == 10.0
    assert conformal_quantile(list(range(1, 10)), 0.1) == 9.0
    assert conformal_quantile(list(range(1, 9)), 0.1) is None
    assert conformal_quantile(list(range(1, 11)), 0.2) == 9.0
    assert conformal_quantile(list(range(1, 20)), 0.05) == 19.0
    assert conformal_quantile([5, 1, 3, 2, 4, 9, 7, 8, 6, 10], 0.2) == 9.0            # order does not matter


def test_conformal_quantile_edges():
    assert conformal_quantile([], 0.1) is None
    with pytest.raises(ValueError):
        conformal_quantile([1.0, 2.0], 0.0)
    with pytest.raises(ValueError):
        conformal_quantile([1.0, -2.0], 0.1)
    with pytest.raises(ValueError):
        conformal_quantile([1.0, float("nan")], 0.1)


# Interval: prediction 3.0, 200 scores 0.01 .. 2.00 (step 0.01), alpha 0.1: k = ceil(201 x 0.9) = ceil(180.9) = 181 -> 1.81.
def test_interval_hand_value_and_the_sample_boundary():
    scores = [round(0.01 * i, 2) for i in range(1, 201)]
    lo, hi = interval(3.0, scores, 0.1)
    assert (lo, hi) == (pytest.approx(3.0 - 1.81), pytest.approx(3.0 + 1.81))
    assert interval(3.0, scores[:199], 0.1) is None                                   # 199 < 200: insufficient data
    assert interval(3.0, scores[:199], 0.1, min_sample=100) is not None               # the boundary is a parameter, not magic


def test_coverage_counts_held_out_events_inside_the_band():
    # |y - p| = [0, 1, 2, 3]; band half-width 2 -> 3 of 4 inside
    assert coverage([1, 2, 3, 4], [1, 1, 1, 1], 2.0) == pytest.approx(0.75)
    with pytest.raises(ValueError):
        coverage([], [], 1.0)


def test_conformal_coverage_is_close_to_nominal_on_exchangeable_data():
    # Deterministic pseudo-data: residuals from a fixed linear-congruential sequence, so the test is reproducible.
    state, vals = 12345, []
    for _ in range(4000):
        state = (1103515245 * state + 12345) % (2 ** 31)
        vals.append(state / 2 ** 31)                                                  # uniform on [0, 1)
    cal, test = vals[:2000], vals[2000:]
    q = conformal_quantile(cal, 0.1)
    assert q == pytest.approx(0.9, abs=0.02)                                          # the 90th percentile of a uniform
    cov = sum(1 for v in test if v <= q) / len(test)
    assert 0.88 <= cov <= 0.92 and math.isfinite(cov)

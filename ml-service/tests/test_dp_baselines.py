"""Differentially private baselines (M7): a way to publish "what users like this paid" without any one user's data being identifiable.

Design (ADR-0017): one contribution per user (the user's own median cost, clipped to [lo, hi]); add/remove-one-user adjacency; the released
mean is (shifted sum + Laplace noise) / (user count + Laplace noise), each part with epsilon/2, so the whole release costs epsilon
(sequential composition, Dwork and Roth 2014, Theorem 3.16; Laplace mechanism: scale = sensitivity / epsilon, Theorem 3.6).
Sensitivities: the count changes by at most 1 when one user is added or removed; the sum of values shifted to [0, hi - lo] changes by at
most hi - lo. The release is only made when the NOISY count reaches a minimum, because gating on the true count would itself leak.

Hand-computed facts used below:
  Laplace(b): mean 0, variance 2 b^2.                       b = sensitivity / epsilon.
  clip [0, 10]: values [0, 10, 100] -> [0, 10, 10], mean 20/3 = 6.6667 (with a huge epsilon the noise is negligible).
  shifted sum for lo = -5, hi = 5: values [-5, 0, 5] -> [0, 5, 10], sum 15; the mean is -5 + 15/3 = 0.
  half-width: P(|Laplace(b)| > t) = exp(-t / b), so the 90% half-width is b ln 10."""
import math

import numpy as np
import pytest

from dp_baselines.mechanisms import (Budget, BudgetExceeded, bounded_mean_release, dp_count, laplace, laplace_half_width, sum_sensitivity)


def rng(seed=7):
    return np.random.default_rng(seed)


def test_laplace_noise_has_mean_zero_and_variance_two_b_squared():
    b = 3.0
    x = laplace(b, rng(), size=400_000)
    assert abs(x.mean()) < 0.03
    assert x.var() == pytest.approx(2 * b * b, rel=0.02)


def test_the_scale_of_a_count_is_one_over_epsilon():
    eps = 0.5                                              # b = 1 / 0.5 = 2, variance 8
    noise = np.array([dp_count(100, eps, rng(s)) - 100 for s in range(20_000)])
    assert noise.var() == pytest.approx(8.0, rel=0.05)


def test_sensitivity_of_the_shifted_sum_is_the_range():
    assert sum_sensitivity(0.0, 10.0) == 10.0
    assert sum_sensitivity(-5.0, 5.0) == 10.0


def test_the_half_width_is_b_ln_10_at_90_percent():
    assert laplace_half_width(2.0, 0.9) == pytest.approx(2.0 * math.log(10))
    assert laplace_half_width(1.0, 0.5) == pytest.approx(math.log(2))


def test_clipping_bounds_one_user_s_influence_and_the_mean_is_right_without_noise():
    r = bounded_mean_release([0.0, 10.0, 100.0] * 20, lo=0.0, hi=10.0, epsilon=1e9, min_users=10, rng=rng(), budget=Budget(1e9))
    assert r["available"] is True
    assert r["mean"] == pytest.approx(20 / 3, abs=1e-3)


def test_values_are_shifted_so_the_sum_has_the_smallest_sensitivity():
    r = bounded_mean_release([-5.0, 0.0, 5.0] * 20, lo=-5.0, hi=5.0, epsilon=1e9, min_users=10, rng=rng(), budget=Budget(1e9))
    assert r["mean"] == pytest.approx(0.0, abs=1e-3)


def test_too_few_users_means_no_release_and_the_answer_says_insufficient_data():
    r = bounded_mean_release([1.0] * 10, lo=0.0, hi=10.0, epsilon=1e9, min_users=50, rng=rng(), budget=Budget(1e9))
    assert r == {"available": False, "reason": "insufficient data", "epsilonSpent": 1e9}   # the budget was spent: the count was looked at
    ok = bounded_mean_release([1.0] * 60, lo=0.0, hi=10.0, epsilon=1e9, min_users=50, rng=rng(), budget=Budget(1e9))
    assert ok["available"] is True and ok["mean"] == pytest.approx(1.0, abs=1e-3)


def test_a_release_costs_exactly_epsilon_and_a_budget_cannot_be_overspent():
    b = Budget(1.0)
    bounded_mean_release([1.0] * 100, lo=0.0, hi=10.0, epsilon=0.4, min_users=50, rng=rng(), budget=b)
    assert b.spent == pytest.approx(0.4) and b.remaining == pytest.approx(0.6)
    with pytest.raises(BudgetExceeded):
        bounded_mean_release([1.0] * 100, lo=0.0, hi=10.0, epsilon=0.7, min_users=50, rng=rng(), budget=b)
    assert b.spent == pytest.approx(0.4)                    # a refused release spends nothing and reads nothing


def test_the_noise_of_a_released_mean_matches_the_stated_scales():
    # n = 200 users, values in [0, 10], epsilon = 1: count scale 2, sum scale 20, so the mean's error is about 20 / 200 = 0.1
    errs = []
    for s in range(3000):
        r = bounded_mean_release([5.0] * 200, lo=0.0, hi=10.0, epsilon=1.0, min_users=50, rng=rng(s), budget=Budget(10))
        errs.append(r["mean"] - 5.0)
    assert np.std(errs) == pytest.approx(0.14, rel=0.35)    # sqrt(2) x 20 / 200 = 0.141 from the sum noise, plus a little from the count noise
    r = bounded_mean_release([5.0] * 200, lo=0.0, hi=10.0, epsilon=1.0, min_users=50, rng=rng(1), budget=Budget(10))
    assert r["noiseScales"] == {"count": 2.0, "sum": 20.0}
    assert r["epsilonSpent"] == 1.0 and r["users"] > 0


def test_the_release_holds_only_the_noisy_figures_and_what_they_cost():
    # `users` is the NOISY count, rounded; the true count and the raw sum are never part of the answer
    r = bounded_mean_release([5.0] * 200, lo=0.0, hi=10.0, epsilon=1.0, min_users=50, rng=rng(3), budget=Budget(10))
    assert set(r) == {"available", "mean", "users", "epsilonSpent", "noiseScales", "halfWidth90Sum"}
    assert isinstance(r["users"], int)


def test_the_same_seed_gives_the_same_release():
    a = bounded_mean_release([1.0, 2.0, 3.0] * 30, lo=0.0, hi=10.0, epsilon=1.0, min_users=10, rng=rng(11), budget=Budget(5))
    b = bounded_mean_release([1.0, 2.0, 3.0] * 30, lo=0.0, hi=10.0, epsilon=1.0, min_users=10, rng=rng(11), budget=Budget(5))
    assert a == b


@pytest.mark.parametrize("kw", [dict(epsilon=0.0), dict(epsilon=-1.0), dict(epsilon=float("nan")), dict(lo=5.0, hi=5.0), dict(lo=6.0, hi=5.0), dict(min_users=0)])
def test_bad_parameters_are_refused(kw):
    args = dict(values=[1.0] * 100, lo=0.0, hi=10.0, epsilon=1.0, min_users=10)
    args.update(kw)
    with pytest.raises(ValueError):
        bounded_mean_release(args.pop("values"), rng=rng(), budget=Budget(5), **args)


def test_a_value_that_is_not_a_finite_number_is_refused_not_dropped():
    for bad in (float("nan"), float("inf")):
        with pytest.raises(ValueError):
            bounded_mean_release([1.0, bad] * 50, lo=0.0, hi=10.0, epsilon=1.0, min_users=10, rng=rng(), budget=Budget(5))

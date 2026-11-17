"""Differentially private baselines (M7, ADR-0017): publish the mean of a per-user figure (for example each user's median execution cost)
across users, so that no single user's data can be recovered from it.

Facts (Dwork and Roth, "The Algorithmic Foundations of Differential Privacy", 2014): the Laplace mechanism adds noise of scale
sensitivity / epsilon (Theorem 3.6) and is epsilon-differentially private; the costs of several releases add up (sequential composition,
Theorem 3.16). Adjacency here: two datasets differ by adding or removing ONE USER, who contributes ONE value. The value is clipped to
[lo, hi] first, then shifted to [0, hi - lo], so the sum has sensitivity hi - lo and the count has sensitivity 1.

The mean is released as (noisy shifted sum) / (noisy count) + lo, the sum and the count each with epsilon / 2, so one release costs epsilon.
The minimum-users rule is applied to the NOISY count: gating on the true count would itself reveal whether the data are near the threshold.

Limits, stated: (1) floating-point Laplace noise is not exactly the real-number mechanism; Mironov (2012, "On significance of the least
significant bits for differential privacy") shows attacks on naive floating-point implementations, and this module does not use the snapping
mechanism or a discrete one, so it must not be used for a release of real users' data without that change; (2) the clipping bounds must be
chosen without looking at the data; (3) there are no real users yet, so nothing here is wired into the product.
"""
from __future__ import annotations

import math

import numpy as np


class BudgetExceeded(Exception):
    pass


class Budget:
    """A privacy budget under sequential composition: the epsilons of the releases add up and may not pass the total."""

    def __init__(self, total: float):
        if not (isinstance(total, (int, float)) and math.isfinite(total) and total > 0):
            raise ValueError("the total budget must be a positive finite number")
        self.total, self.spent = float(total), 0.0

    @property
    def remaining(self) -> float:
        return self.total - self.spent

    def spend(self, epsilon: float) -> None:
        if self.spent + epsilon > self.total * (1 + 1e-12):
            raise BudgetExceeded(f"a release of epsilon {epsilon} would pass the budget ({self.remaining:.6g} left)")
        self.spent += epsilon


def laplace(scale: float, rng: np.random.Generator, size=None):
    return rng.laplace(0.0, scale, size)


def laplace_half_width(scale: float, level: float = 0.9) -> float:
    """t with P(|Laplace(scale)| > t) = 1 - level: since that probability is exp(-t / scale), t = scale ln(1 / (1 - level))."""
    return scale * math.log(1.0 / (1.0 - level))


def sum_sensitivity(lo: float, hi: float) -> float:
    return hi - lo


def dp_count(n: int, epsilon: float, rng: np.random.Generator) -> float:
    """n plus Laplace noise of scale 1 / epsilon (adding or removing one user changes the count by 1)."""
    return n + float(laplace(1.0 / epsilon, rng))


def _check(epsilon: float, lo: float, hi: float, min_users: int) -> None:
    if not (isinstance(epsilon, (int, float)) and math.isfinite(epsilon) and epsilon > 0):
        raise ValueError("epsilon must be a positive finite number")
    if not (math.isfinite(lo) and math.isfinite(hi) and lo < hi):
        raise ValueError("the clipping bounds must be finite with lo < hi")
    if not (isinstance(min_users, int) and min_users >= 1):
        raise ValueError("min_users must be a whole number of at least 1")


def bounded_mean_release(values, lo: float, hi: float, epsilon: float, min_users: int, rng: np.random.Generator, budget: Budget) -> dict:
    """One value per user. Returns the noisy mean with its cost, or {"available": False, "reason": "insufficient data"} when the noisy
    count is below `min_users` (the epsilon is spent either way: the count was looked at). Refuses, spending nothing, when the budget
    cannot pay for it or a parameter or value is not valid."""
    _check(epsilon, lo, hi, min_users)
    xs = np.asarray(list(values), dtype=float)
    if not np.all(np.isfinite(xs)):
        raise ValueError("every value must be a finite number")
    budget.spend(epsilon)
    half = epsilon / 2.0
    shifted = np.clip(xs, lo, hi) - lo                       # in [0, hi - lo]
    count_scale = 1.0 / half
    sum_scale = sum_sensitivity(lo, hi) / half
    noisy_count = dp_count(len(xs), half, rng)
    noisy_sum = float(shifted.sum()) + float(laplace(sum_scale, rng))
    if noisy_count < min_users:
        return {"available": False, "reason": "insufficient data", "epsilonSpent": epsilon}
    return {
        "available": True,
        "mean": lo + noisy_sum / noisy_count,
        "users": int(round(noisy_count)),
        "epsilonSpent": epsilon,
        "noiseScales": {"count": count_scale, "sum": sum_scale},
        "halfWidth90Sum": laplace_half_width(sum_scale, 0.9),
    }

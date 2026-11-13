"""Split conformal prediction intervals, numpy only (Vovk et al.; Lei et al. 2018, "Distribution-free predictive inference
for regression", JASA 113(523)).

Given n calibration scores s_i = |y_i - yhat_i| (absolute residuals of the fitted model on days it was not fitted on) and a
miscoverage level alpha, the interval half-width is the k-th smallest score with k = ceil((n + 1)(1 - alpha)). If k > n
the sample is too small for the level: no interval ("insufficient data"). Under exchangeability of calibration and test
events the interval [yhat - q, yhat + q] covers a new event with probability at least 1 - alpha.
"""
from __future__ import annotations

import math
from typing import Sequence

import numpy as np

MIN_BUCKET_SAMPLE = 200   # plan §2: below this many calibration events in a notional bucket the answer is "insufficient data"


def conformal_quantile(scores: Sequence[float], alpha: float = 0.1) -> float | None:
    """The k-th smallest absolute residual, k = ceil((n + 1)(1 - alpha)); None when k > n (too few scores for alpha)."""
    if not 0.0 < alpha < 1.0:
        raise ValueError(f"alpha must be within (0, 1), got {alpha!r}")
    s = np.asarray(scores, dtype=float)
    if s.ndim != 1 or s.size == 0:
        return None
    if not np.all(np.isfinite(s)) or np.any(s < 0):
        raise ValueError("scores must be finite and non-negative")
    n = int(s.size)
    k = math.ceil((n + 1) * (1.0 - alpha) - 1e-12)     # the epsilon keeps (n + 1)(1 - alpha) = 9.000000000000002 at 9
    if k > n:
        return None
    return float(np.sort(s)[k - 1])


def interval(prediction: float, scores: Sequence[float], alpha: float = 0.1, min_sample: int = MIN_BUCKET_SAMPLE) -> tuple[float, float] | None:
    """[prediction - q, prediction + q] from the calibration scores of the order's bucket, or None ("insufficient data")
    when the bucket has fewer than `min_sample` scores or too few for alpha."""
    if len(scores) < min_sample:
        return None
    q = conformal_quantile(scores, alpha)
    if q is None:
        return None
    return float(prediction) - q, float(prediction) + q


def coverage(truth: Sequence[float], predictions: Sequence[float], q: float) -> float:
    """Share of held-out events inside [prediction - q, prediction + q] (inclusive)."""
    y, p = np.asarray(truth, dtype=float), np.asarray(predictions, dtype=float)
    if y.shape != p.shape or y.size == 0:
        raise ValueError("truth and predictions must be non-empty and of equal length")
    return float(np.mean(np.abs(y - p) <= q + 1e-12))

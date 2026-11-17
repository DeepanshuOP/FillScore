"""Calibration of the expected-cost model on public taker events, split by day (numpy only).

Per symbol:
  s/2  = median effective half-spread of the fit events of the smallest notional bucket (under 1,000 quote units);
  Y    = least squares through the origin of (eff - s/2) on x = sigma sqrt(Q / V), over all fit events (impact.fit_y);
  q    = split-conformal half-width per notional bucket from the calibration days: the k-th smallest |eff - prediction|,
         k = ceil((n + 1)(1 - alpha)); None ("insufficient data") for a bucket with fewer than `min_sample` events;
  coverage = share of the test days' events inside prediction +/- q, reported per bucket, never tuned.
The three day sets are disjoint and chosen by a fixed rule (split_days). Nothing here is used to predict a trade: the
numbers describe what taker events of similar size cost in similar hours on the calibration days.
"""
from __future__ import annotations

import numpy as np

from expected_cost.conformal import MIN_BUCKET_SAMPLE, conformal_quantile, coverage
from expected_cost.features import Events
from expected_cost.impact import fit_y
from scoring_v2.components import NOTIONAL_BUCKETS, notional_bucket

SMALLEST_BUCKET = NOTIONAL_BUCKETS[0][1]       # "lt1k"
BUCKET_NAMES = [b for _, b in NOTIONAL_BUCKETS] + ["ge100k"]


def split_days(days: list[str]) -> dict[str, list[str]]:
    """Day of month d -> (d - 1) % 4: 0 or 1 fit, 2 calibration, 3 test. Input is a list of YYYY-MM-DD."""
    out: dict[str, list[str]] = {"fit": [], "calibration": [], "test": []}
    for day in sorted(days):
        r = (int(day[8:10]) - 1) % 4
        out["fit" if r < 2 else "calibration" if r == 2 else "test"].append(day)
    return out


def participation(ev: Events) -> np.ndarray:
    """x = sigma sqrt(Q / V) per event (bps)."""
    return ev.sigma * np.sqrt(ev.qty / ev.vol)


def _buckets(ev: Events) -> np.ndarray:
    return np.array([notional_bucket(float(v)) for v in ev.notional], dtype=object)


def predict(half_spread: float, y: float, x: np.ndarray) -> np.ndarray:
    return half_spread + y * x


def calibrate_symbol(fit: Events, cal: Events, test: Events, alpha: float = 0.1, min_sample: int = MIN_BUCKET_SAMPLE,
                     range_pct: tuple[float, float] = (0.1, 99.9)) -> dict:
    fb = _buckets(fit)
    small = fit.eff[fb == SMALLEST_BUCKET]
    if len(small) == 0:
        raise ValueError(f"no fit event under {NOTIONAL_BUCKETS[0][0]}: the half-spread is not measurable")
    half = float(np.median(small))
    xf = participation(fit)
    use = xf > 0
    y = fit_y(xf[use], fit.eff[use] - half)
    lo, hi = np.percentile(xf[use], range_pct)
    cb, tb = _buckets(cal), _buckets(test)
    xc, xt = participation(cal), participation(test)
    buckets = {}
    for name in BUCKET_NAMES:
        mc, mt = cb == name, tb == name
        scores = np.abs(cal.eff[mc] - predict(half, y, xc[mc]))
        q = conformal_quantile(scores, alpha) if len(scores) >= min_sample else None
        cov = coverage(test.eff[mt], predict(half, y, xt[mt]), q) if q is not None and mt.any() else None
        buckets[name] = {"nCalibration": int(mc.sum()), "q": q, "nTest": int(mt.sum()), "coverage": cov}
    return {"halfSpreadBps": half, "y": y, "featureRange": [float(lo), float(hi)], "nFit": int(len(fit)),
            "nFitSmall": int(len(small)), "alpha": alpha, "buckets": buckets}

"""C1: map a measured cost to a 0–100 score through data-derived anchors.

Anchors are percentiles of a market baseline (a10 < a50 < a90 < a99). The score is piecewise-linear through
(a10, 100), (a50, 75), (a90, 40), (a99, 0): 100 at or below a10 and 0 at or above a99. Lower cost scores higher.
"""
from __future__ import annotations

import math

KNOTS = (100.0, 75.0, 40.0, 0.0)


def check_anchors(a10: float, a50: float, a90: float, a99: float) -> None:
    xs = (a10, a50, a90, a99)
    if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in xs):
        raise ValueError(f"anchors must be finite numbers, got {xs!r}")
    if not (a10 < a50 < a90 < a99):
        raise ValueError(f"anchors must strictly increase, got {xs!r}")


def score_from_anchors(x: float, a10: float, a50: float, a90: float, a99: float) -> float:
    check_anchors(a10, a50, a90, a99)
    if not isinstance(x, (int, float)) or isinstance(x, bool) or not math.isfinite(x):
        raise ValueError(f"x must be a finite number, got {x!r}")
    xs = (a10, a50, a90, a99)
    if x <= a10:
        return 100.0
    if x >= a99:
        return 0.0
    for (x0, y0), (x1, y1) in zip(zip(xs, KNOTS), zip(xs[1:], KNOTS[1:])):
        if x <= x1:
            return y0 + (x - x0) / (x1 - x0) * (y1 - y0)
    return 0.0   # unreachable

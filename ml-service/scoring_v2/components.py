"""C2: unit scores for the four components. Each returns a score in [0, 100], or None for "insufficient data".

| Component | Weight | Unit  | Input                                   | Mapping                                         |
| slippage  | 0.35   | order | impactTimingBps (execution net of spread) | anchors of signed mid drift, by duration bucket |
| fees      | 0.25   | fill  | fee paid, bps, vs best available rate   | 100 at <= best, linear to 0 at 2 x best          |
| timing    | 0.25   | fill  | UTC hour in the symbol's hour profile   | 100 x (1 - hours strictly cheaper / 23)          |
| spread    | 0.15   | fill  | effective half-spread, bps              | anchors by notional bucket; <= half a tick = 100 |
"""
from __future__ import annotations

import math
from typing import Sequence

from .anchors import check_anchors, score_from_anchors

WEIGHTS = {"slippage": 0.35, "fees": 0.25, "timing": 0.25, "spread": 0.15}

DURATION_BUCKETS = ((1_000, "lt1s"), (10_000, "1s-10s"), (60_000, "10s-1m"), (600_000, "1m-10m"), (3_600_000, "10m-1h"))
NOTIONAL_BUCKETS = ((1_000, "lt1k"), (10_000, "1k-10k"), (100_000, "10k-100k"))


def duration_bucket(ms: float) -> str:
    for edge, name in DURATION_BUCKETS:
        if ms < edge:
            return name
    return "ge1h"


def notional_bucket(usd: float) -> str:
    for edge, name in NOTIONAL_BUCKETS:
        if usd < edge:
            return name
    return "ge100k"


def _finite(name: str, v) -> float:
    if not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v):
        raise ValueError(f"{name} must be a finite number, got {v!r}")
    return float(v)


def fee_score(paid_bps: float, best_bps: float, published_taker_bps: float | None = None) -> float | None:
    paid, best = _finite("paid_bps", paid_bps), _finite("best_bps", best_bps)
    if best < 0:
        raise ValueError("best rate cannot be negative")
    if best == 0:
        # A zero-fee promotion: the zero anchor becomes the published taker rate. Without one, nothing to compare.
        if published_taker_bps is None or published_taker_bps <= 0:
            return None
        t = _finite("published_taker_bps", published_taker_bps)
        return max(0.0, min(100.0, 100.0 * (t - paid) / t))
    if paid <= best:
        return 100.0
    return max(0.0, 100.0 * (2 * best - paid) / best)


def timing_score(hour: int, profile: Sequence[float] | None) -> float:
    if profile is None or len(profile) != 24:
        raise ValueError("an hour profile has 24 values")
    vals = [_finite("hour index", v) for v in profile]
    if not isinstance(hour, int) or not 0 <= hour <= 23:
        raise ValueError(f"hour must be 0..23, got {hour!r}")
    cheaper = sum(1 for v in vals if v < vals[hour])
    return 100.0 * (1 - cheaper / 23)


def _anchors_ok(anchors) -> bool:
    if anchors is None:
        return False
    try:
        check_anchors(*anchors)
        return True
    except (ValueError, TypeError):
        return False


def spread_score(eff_half_bps: float, half_tick_bps: float, anchors: Sequence[float] | None) -> float | None:
    x = _finite("eff_half_bps", eff_half_bps)
    if x <= _finite("half_tick_bps", half_tick_bps) + 1e-12:
        return 100.0
    if not _anchors_ok(anchors):
        return None
    return score_from_anchors(x, *anchors)


def slippage_score(impact_timing_bps: float, anchors: Sequence[float] | None) -> float | None:
    x = _finite("impact_timing_bps", impact_timing_bps)
    if not _anchors_ok(anchors):
        return None
    return score_from_anchors(x, *anchors)

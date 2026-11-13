"""Summary of the measured order shortfall (collection `order_measurements`, written by ml-service/measure) for the
packets of an account whose trades carry no per-trade v1 fields (metrics 1.3.0).

Deterministic statistics only: medians (linear interpolation, numpy's default) over the orders that have each value.
An order whose shortfall was not measured is ignored, never imputed. Returns None when nothing was measured, so a packet
then carries no measured block at all (never zeros).
"""
from __future__ import annotations

import math


def _median(values: list[float]) -> float | None:
    x = sorted(v for v in values if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v))
    if not x:
        return None
    mid = (len(x) - 1) / 2
    lo, hi = math.floor(mid), math.ceil(mid)
    return float(x[lo] + (mid - lo) * (x[hi] - x[lo]))


def summarise_measurements(measurements: list[dict] | None) -> dict | None:
    rows = [m["shortfall"] for m in (measurements or []) if m.get("shortfall") and not m.get("unmeasuredReason")]
    if not rows:
        return None
    unfilled = [r for r in rows if r.get("fillRatio") == 0]
    out = {
        "measured_order_count": len(rows),
        "median_spread_paid_bps": _median([r.get("spreadBps") for r in rows]),
        "median_impact_timing_bps": _median([r.get("impactTimingBps") for r in rows]),
        "median_execution_bps": _median([r.get("executionBps") for r in rows]),
        "unfilled_order_count": len(unfilled),
        "median_opportunity_bps_unfilled": _median([r.get("opportunityBps") for r in unfilled]),
    }
    return out

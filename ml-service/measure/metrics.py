"""Fill-level execution metrics. Pure functions, registered for the generated methodology page.

Conventions: D = +1 for a buy, -1 for a sell. All results are in basis points of the mid at fill time
(x 1e4). A positive value is a cost to the trader; a negative value is a gain.

Vocabulary follows SEC Rule 605 as amended in 2024 (effective spread, realized spread at fixed horizons,
effective over quoted) and Holden & Jacobsen (2014). The decomposition
    effective half-spread = realized half-spread(h) + price impact(h)
is an identity, and `check_decomposition` enforces it at runtime on every measured fill.
"""
from __future__ import annotations

import math

from .registry import metric

IDENTITY_TOL = 1e-9


class IdentityError(AssertionError):
    """A decomposition that must hold by construction did not. This is a bug, never a data problem."""


def _check(side: int, *prices: float) -> None:
    if side not in (1, -1):
        raise ValueError("side must be +1 (buy) or -1 (sell)")
    for p in prices:
        if not isinstance(p, (int, float)) or isinstance(p, bool) or not math.isfinite(p) or p <= 0:
            raise ValueError(f"price must be a positive finite number, got {p!r}")


@metric(
    id="fill.effective_half_spread_bps", unit="bps of mid", inputs=["side", "fill price", "mid at fill time"],
    doc="D x (fill - mid) / mid x 10,000. The distance from the mid that the fill paid. A taker normally pays about "
        "half the quoted spread. A negative value means price improvement, or a maker fill that earned the spread. "
        "Example: buy at 100.02 with mid 100.01 gives 0.9999 bps.",
)
def effective_half_spread_bps(side: int, fill: float, mid: float) -> float:
    _check(side, fill, mid)
    return side * (fill - mid) / mid * 1e4


@metric(
    id="fill.realized_half_spread_bps", unit="bps of mid", inputs=["side", "fill price", "mid at fill time", "mid at fill time + h"],
    doc="D x (fill - mid after h) / mid at fill x 10,000, for h = 1, 15, 60 and 300 seconds. The part of the "
        "effective half-spread that was still a cost after the market had h seconds to move. "
        "Example: buy at 100.02, mid 100.01, mid 15 s later 100.04 gives -1.9998 bps.",
)
def realized_half_spread_bps(side: int, fill: float, mid_t: float, mid_th: float) -> float:
    _check(side, fill, mid_t, mid_th)
    return side * (fill - mid_th) / mid_t * 1e4


@metric(
    id="fill.price_impact_bps", unit="bps of mid", inputs=["side", "mid at fill time", "mid at fill time + h"],
    doc="D x (mid after h - mid at fill) / mid at fill x 10,000. How far the mid moved in the direction of the "
        "trade within h seconds. It coincided with the trade; the measurement does not show causation. "
        "Example: buy, mid 100.01, mid 15 s later 100.04 gives 2.9997 bps.",
)
def price_impact_bps(side: int, mid_t: float, mid_th: float) -> float:
    _check(side, mid_t, mid_th)
    return side * (mid_th - mid_t) / mid_t * 1e4


@metric(
    id="fill.eq_ratio", unit="ratio", inputs=["effective half-spread (bps)", "quoted spread (price units)", "mid at fill time"],
    doc="Effective half-spread divided by the quoted half-spread, where the quoted half-spread is "
        "(quoted spread / 2) / mid x 10,000 and the quoted spread is max(ask proxy - bid proxy, one tick). "
        "1.0 means the fill paid exactly the quoted half-spread; below 1.0 is price improvement. "
        "Not available when the quote is not two-sided.",
)
def eq_ratio(eff_half_bps: float, quoted_spread: float | None, mid: float) -> float | None:
    if quoted_spread is None or quoted_spread <= 0 or not math.isfinite(quoted_spread):
        return None
    _check(1, mid)
    return eff_half_bps / (quoted_spread / 2.0 / mid * 1e4)


def check_decomposition(effective: float, realized: float, impact: float, tol: float = IDENTITY_TOL) -> None:
    """Raise IdentityError unless effective == realized + impact. The tolerance is `tol` in bps, scaled up by
    the largest term so that float rounding on very large values is not reported as a bug."""
    scale = max(1.0, abs(effective), abs(realized), abs(impact))
    if abs(effective - (realized + impact)) > tol * scale:
        raise IdentityError(f"effective {effective!r} != realized {realized!r} + impact {impact!r}")

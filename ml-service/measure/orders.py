"""Order-level implementation shortfall (Perold 1988, "The implementation shortfall: paper versus reality").

All parts are in bps of the intended notional = ordered quantity x arrival mid. D = +1 buy, -1 sell.
  execution     = sum D (p_i - arrival) q_i                   (what the fills cost against the arrival mid)
    spread      = sum D (p_i - mid_i) q_i                      (paid against the mid at each fill)
    impact/timing = sum D (mid_i - arrival) q_i                (the mid moved between arrival and each fill)
  opportunity   = D (end_mid - arrival) (ordered - filled)     (the unfilled part, valued at the end mid)
  fees          = fees in quote currency
  total         = execution + opportunity + fees
Identities checked at runtime: execution = spread + impact/timing, and total = execution + opportunity + fees.

Rules (no imputation):
  * A fully filled order has opportunity 0, never None.
  * basis "first_fill" (no order record): ordered = filled, the arrival mid is the mid at the first fill, and
    opportunity and total are None because the unfilled part is unknown.
  * A fill with no fresh mid: execution is still measured, but the spread / impact split is None for the order.
  * Delay cost needs a decision time, which an exchange never records, so it is always None.
Every value here coincided with the order; none is shown to be caused by it.
"""
from __future__ import annotations

import math
from typing import Literal, Sequence

from .metrics import IDENTITY_TOL, IdentityError
from .registry import metric

QTY_TOL = 1e-9


def _bps(x: float, notional: float) -> float:
    return x / notional * 1e4


def _pos(name: str, v) -> None:
    if not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v) or v <= 0:
        raise ValueError(f"{name} must be a positive finite number, got {v!r}")


def _identity(name: str, lhs: float, parts: Sequence[float]) -> None:
    scale = max(1.0, abs(lhs), *(abs(p) for p in parts))
    if abs(lhs - sum(parts)) > IDENTITY_TOL * scale:
        raise IdentityError(f"{name}: {lhs!r} != sum of {list(parts)!r}")


@metric(
    id="order.implementation_shortfall_bps", unit="bps of intended notional",
    inputs=["side", "ordered quantity", "fills (price, quantity, mid at fill)", "arrival mid", "end mid", "fees"],
    doc="Execution + opportunity + fees, each divided by ordered quantity x arrival mid, x 10,000. Execution = "
        "sum D (fill - arrival mid) x qty, split into spread = sum D (fill - mid at fill) x qty and impact/timing = "
        "sum D (mid at fill - arrival mid) x qty. Opportunity = D (end mid - arrival mid) x unfilled qty; 0 for a "
        "fully filled order; unknown without an order record. Delay cost is not computed (no decision time). "
        "Example: buy 2.0 at arrival 100.00, fills 1.0 at 100.02 and 0.5 at 100.04, end mid 100.10, fees 0.15 "
        "gives execution 2.0, opportunity 2.5, fees 7.5, total 12.0 bps.",
)
def order_is(side: int, ordered_qty: float | None, fills: Sequence[tuple[float, float, float | None]],
             arrival_mid: float, end_mid: float | None, fees_quote: float | None,
             basis: Literal["order", "first_fill"]) -> dict:
    """`fills` may be empty for basis "order" (an order that never filled: pure opportunity cost).
    `fees_quote` None means the fees could not be valued in the quote currency: fees and total are then None."""
    if side not in (1, -1):
        raise ValueError("side must be +1 (buy) or -1 (sell)")
    if basis not in ("order", "first_fill"):
        raise ValueError(f"unknown basis {basis!r}")
    if not fills and basis == "first_fill":
        raise ValueError("basis 'first_fill' needs at least one fill")
    _pos("arrival_mid", arrival_mid)
    if end_mid is not None:
        _pos("end_mid", end_mid)
    if fees_quote is not None and (not isinstance(fees_quote, (int, float)) or not math.isfinite(fees_quote) or fees_quote < 0):
        raise ValueError(f"fees_quote must be a finite number >= 0, got {fees_quote!r}")
    for p, q, m in fills:
        _pos("fill price", p)
        _pos("fill qty", q)
        if m is not None:
            _pos("mid at fill", m)

    filled = sum(q for _, q, _ in fills)
    if basis == "order":
        if ordered_qty is None:
            raise ValueError("basis 'order' needs the ordered quantity")
        _pos("ordered_qty", ordered_qty)
        if filled > ordered_qty * (1 + QTY_TOL):
            raise ValueError(f"filled {filled} exceeds ordered {ordered_qty}")
        ordered = ordered_qty
    else:
        ordered = filled
    notional = ordered * arrival_mid

    exec_raw = sum(side * (p - arrival_mid) * q for p, q, _ in fills)
    without_mid = sum(1 for _, _, m in fills if m is None)
    out = {
        "basis": basis,
        "intendedNotional": notional,
        "orderedQty": ordered,
        "filledQty": filled,
        "fillRatio": filled / ordered,
        "executionBps": _bps(exec_raw, notional),
        "spreadBps": None,
        "impactTimingBps": None,
        "opportunityBps": None,
        "feesBps": _bps(fees_quote, notional) if fees_quote is not None else None,
        "totalBps": None,
        "totalReason": None,
        "delayBps": None,
        "delayReason": "no decision timestamp",
        "fillsWithoutMid": without_mid,
    }
    if without_mid == 0:
        spread_raw = sum(side * (p - m) * q for p, q, m in fills)
        impact_raw = sum(side * (m - arrival_mid) * q for _, q, m in fills)
        out["spreadBps"], out["impactTimingBps"] = _bps(spread_raw, notional), _bps(impact_raw, notional)
        _identity("execution", out["executionBps"], [out["spreadBps"], out["impactTimingBps"]])

    unfilled = max(ordered - filled, 0.0)
    if basis == "first_fill":
        out["totalReason"] = "opportunity cost unknown without an order record"
        return out
    if unfilled <= ordered * QTY_TOL:
        opp_raw = 0.0
        out["opportunityBps"] = 0.0
    elif end_mid is None:
        out["totalReason"] = "no mid at the order's end"
        return out
    else:
        opp_raw = side * (end_mid - arrival_mid) * unfilled
        out["opportunityBps"] = _bps(opp_raw, notional)
    if fees_quote is None:
        out["totalReason"] = "fees in the quote currency unknown"
        return out
    out["totalBps"] = _bps(exec_raw + opp_raw + fees_quote, notional)
    _identity("total", out["totalBps"], [out["executionBps"], out["opportunityBps"], out["feesBps"]])
    return out

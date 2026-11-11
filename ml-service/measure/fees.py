"""The commission rate an account actually pays, from a stored commission snapshot (backend FeeSnapshot).

Source: Binance spot Commission FAQ, https://developers.binance.com/docs/binance-spot-api-docs/faqs/commission_faq
(read 2026-11-11), and "Query Commission Rates" in .../rest-api/account-endpoints:
  rate = (standard[liquidity] + standard[side]) x d + (tax[liquidity] + tax[side]) + (special[liquidity] + special[side])
where liquidity is maker or taker, side is buyer or seller, and d is the discount multiplier when the account and the
symbol both have the discount enabled and the fee was paid in the discount asset (BNB), else 1. The discount does
not apply to tax or special commissions. Test: tests/measure/test_fees.py reproduces the FAQ's worked example.
"""
from __future__ import annotations

import math

from .registry import metric

_PARTS = ("maker", "taker", "buyer", "seller")


def _part(snapshot: dict, block: str, key: str) -> float:
    try:
        v = float(snapshot[block][key])
    except (KeyError, TypeError, ValueError):
        raise ValueError(f"commission snapshot lacks {block}.{key}") from None
    if not math.isfinite(v) or v < 0:
        raise ValueError(f"commission snapshot {block}.{key} must be a finite rate >= 0, got {v!r}")
    return v


@metric(
    id="fee.effective_rate", unit="fraction of notional",
    inputs=["commission snapshot (standard, tax, special, discount)", "side", "maker or taker", "paid in discount asset"],
    doc="(standard[maker|taker] + standard[buyer|seller]) x discount + (tax[...] + tax[...]) + (special[...] + "
        "special[...]). The discount multiplier applies only when the account and the symbol have it enabled and the "
        "fee was paid in the discount asset; it never applies to tax or special commissions (Binance Commission FAQ). "
        "Example from the FAQ: taker sell, standard 0.0000002 + 0.0000004, tax 0.00000114 + 0.00000116, special "
        "0.02 + 0.04, discount 0.25 gives 0.06000245.",
)
def effective_rate(snapshot: dict, side: str, is_maker: bool, paid_in_discount_asset: bool) -> float:
    if side not in ("BUY", "SELL"):
        raise ValueError(f"side must be 'BUY' or 'SELL', got {side!r}")
    liq = "maker" if is_maker else "taker"
    who = "buyer" if side == "BUY" else "seller"
    standard = _part(snapshot, "standard", liq) + _part(snapshot, "standard", who)
    tax = _part(snapshot, "tax", liq) + _part(snapshot, "tax", who)
    special = (_part(snapshot, "special", liq) + _part(snapshot, "special", who)) if snapshot.get("special") else 0.0
    d = snapshot.get("discount") or {}
    mult = 1.0
    if paid_in_discount_asset and d.get("enabledForAccount") and d.get("enabledForSymbol"):
        mult = float(d.get("rate", 1.0))
        if not math.isfinite(mult) or not 0 <= mult <= 1:
            raise ValueError(f"discount multiplier must be in [0, 1], got {mult!r}")
    return standard * mult + tax + special

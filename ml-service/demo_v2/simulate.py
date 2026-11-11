"""Fills for demo orders from real public prints. No price is invented.

Market (taker) order placed at t: it walks the prints on its own aggressor side (buyer-initiated for a buy) with
t <= ts < t + horizon, taking min(remaining, print qty) at each print's own price and time. Whatever the prints do not
cover is left unfilled and the order is recorded as cancelled at the horizon end.

Limit (maker) order placed at t: the limit price is the same-side quote proxy at t (for a buy, the last
seller-initiated print strictly before t, at most 5 s old; measure.benchmarks rules). It fills, at the limit price,
only when an opposite-aggressor print TRADES THROUGH the limit (a seller-initiated print below a buy limit) with
t < ts <= t + ttl. Touching the limit is not a fill, because the queue position is unknown (conservative). Unfilled
quantity at t + ttl is cancelled.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from measure.benchmarks import MAX_QUOTE_AGE_MS
from measure.data.aggtrades import AggTradeWindow

QTY_EPS = 1e-12


@dataclass(frozen=True)
class Fill:
    price: float
    qty: float
    ts_ms: int


@dataclass
class SimOrder:
    side: str
    order_type: str
    orig_qty: float
    created_ms: int
    limit_price: float | None
    fills: list = field(default_factory=list)
    status: str = "NEW"
    updated_ms: int = 0

    @property
    def executed_qty(self) -> float:
        return float(sum(f.qty for f in self.fills))

    @property
    def resting_ms(self) -> int | None:
        if self.order_type != "LIMIT" or not self.fills:
            return None
        return self.fills[0].ts_ms - self.created_ms


def _check(side: str, qty: float) -> None:
    if side not in ("BUY", "SELL"):
        raise ValueError(f"side must be BUY or SELL, got {side!r}")
    if not qty > 0:
        raise ValueError("quantity must be positive")


def simulate_market(tape: AggTradeWindow, side: str, qty: float, t_ms: int, horizon_ms: int) -> SimOrder:
    _check(side, qty)
    o = SimOrder(side, "MARKET", qty, t_ms, None)
    lo = int(np.searchsorted(tape.ts_ms, t_ms, side="left"))
    hi = int(np.searchsorted(tape.ts_ms, t_ms + horizon_ms, side="left"))
    want_buyer = side == "BUY"
    remaining = qty
    for i in range(lo, hi):
        if bool(tape.is_buyer_maker[i]) == want_buyer:      # buyer-initiated has is_buyer_maker False
            continue
        take = min(remaining, float(tape.qty[i]))
        if take <= QTY_EPS:
            continue
        o.fills.append(Fill(float(tape.price[i]), take, int(tape.ts_ms[i])))
        remaining -= take
        if remaining <= qty * 1e-12:
            o.status, o.updated_ms = "FILLED", int(tape.ts_ms[i])
            return o
    o.status, o.updated_ms = "CANCELED", t_ms + horizon_ms
    return o


def same_side_proxy(tape: AggTradeWindow, side: str, t_ms: int, max_age_ms: int = MAX_QUOTE_AGE_MS) -> float | None:
    """For a buy, the bid proxy (last seller-initiated print strictly before t); for a sell, the ask proxy."""
    n = int(np.searchsorted(tape.ts_ms, t_ms, side="left"))
    idx = tape.side_index(buyer_initiated=(side == "SELL"))
    k = int(np.searchsorted(idx, n, side="left")) - 1
    if k < 0:
        return None
    i = int(idx[k])
    if t_ms - int(tape.ts_ms[i]) > max_age_ms:
        return None
    return float(tape.price[i])


def simulate_limit(tape: AggTradeWindow, side: str, qty: float, t_ms: int, ttl_ms: int) -> SimOrder | None:
    """None when there is no fresh same-side print to set the limit price (the decision is skipped and counted)."""
    _check(side, qty)
    limit = same_side_proxy(tape, side, t_ms)
    if limit is None:
        return None
    o = SimOrder(side, "LIMIT", qty, t_ms, limit)
    lo = int(np.searchsorted(tape.ts_ms, t_ms, side="right"))          # ts > t
    hi = int(np.searchsorted(tape.ts_ms, t_ms + ttl_ms, side="right"))  # ts <= t + ttl
    remaining = qty
    for i in range(lo, hi):
        p = float(tape.price[i])
        if side == "BUY":
            hit = bool(tape.is_buyer_maker[i]) and p < limit                 # a seller-initiated print below the bid
        else:
            hit = (not bool(tape.is_buyer_maker[i])) and p > limit           # a buyer-initiated print above the ask
        if not hit:
            continue
        take = min(remaining, float(tape.qty[i]))
        o.fills.append(Fill(limit, take, int(tape.ts_ms[i])))
        remaining -= take
        if remaining <= qty * 1e-12:
            o.status, o.updated_ms = "FILLED", int(tape.ts_ms[i])
            return o
    o.status, o.updated_ms = "CANCELED", t_ms + ttl_ms
    return o

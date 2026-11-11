"""Benchmarks built from public aggressor-side prints. Pure functions: no I/O, no scoring.

Why prints can stand in for quotes: a buyer-initiated print executed at the best ask of that moment, and a
seller-initiated print at the best bid. The exchange labels the aggressor on every print (`is_buyer_maker`),
so the side is measured, not inferred. Spot order-book history is not published, so these are proxies:

  ask proxy(t) = price of the last buyer-initiated print strictly before t
  bid proxy(t) = price of the last seller-initiated print strictly before t

Rules:
  * Strictly before t (`ts < t`). A fill's own print sits at its own millisecond and must never set its own
    benchmark. Prints inside one millisecond are ordered by aggregate id.
  * Each proxy must be at most `max_age_ms` old (default 5000). A stale proxy is never used.
  * Two-sided mid = (ask + bid)/2 when both are fresh and ask >= bid.
  * Otherwise the last print strictly before t, if fresh: quality "last_trade".
  * Otherwise nothing. A mid is never imputed.

Known limit: when the price moves between the two proxy prints, ask - bid overstates the real spread and the
mid lags by up to half that move. The ages of both proxies are returned so callers can report or filter on them.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from .data.aggtrades import AggTradeWindow

MAX_QUOTE_AGE_MS = 5000


@dataclass(frozen=True)
class Quote:
    ask: float | None
    bid: float | None
    mid: float | None
    quality: Literal["two_sided", "last_trade"] | None
    ask_age_ms: int | None
    bid_age_ms: int | None


_NO_QUOTE = Quote(None, None, None, None, None, None)


def _last_on_side(window: AggTradeWindow, n_before: int, buyer_initiated: bool) -> int | None:
    """Position of the last print on one aggressor side among the first `n_before` prints, or None."""
    idx = window.side_index(buyer_initiated)
    k = int(np.searchsorted(idx, n_before, side="left")) - 1
    return int(idx[k]) if k >= 0 else None


def quote_at(window: AggTradeWindow, t_ms: int, max_age_ms: int = MAX_QUOTE_AGE_MS) -> Quote:
    n = int(np.searchsorted(window.ts_ms, t_ms, side="left"))      # prints [0, n) have ts < t
    if n == 0:
        return _NO_QUOTE
    ia, ib = _last_on_side(window, n, True), _last_on_side(window, n, False)
    if ia is not None and ib is not None:
        ask, bid = float(window.price[ia]), float(window.price[ib])
        ask_age, bid_age = int(t_ms - window.ts_ms[ia]), int(t_ms - window.ts_ms[ib])
        if ask_age <= max_age_ms and bid_age <= max_age_ms and ask >= bid:
            return Quote(ask, bid, (ask + bid) / 2.0, "two_sided", ask_age, bid_age)
    last = n - 1
    if int(t_ms - window.ts_ms[last]) <= max_age_ms:
        return Quote(None, None, float(window.price[last]), "last_trade", None, None)
    return _NO_QUOTE


def quoted_spread(q: Quote, tick: float) -> float | None:
    """Quoted spread proxy in price units: max(ask - bid, one tick). None unless the quote is two-sided."""
    if q.quality != "two_sided" or q.ask is None or q.bid is None:
        return None
    return max(q.ask - q.bid, tick)


def interval_vwap(window: AggTradeWindow, start_ms: int, end_ms: int) -> float | None:
    """Volume-weighted average price of the prints with start_ms <= ts < end_ms.

    For an order's life this includes the user's own prints; they cannot be separated out of public data."""
    w = window.between(start_ms, end_ms)
    vol = float(w.qty.sum()) if len(w) else 0.0
    if vol <= 0:
        return None
    return float((w.price * w.qty).sum() / vol)


def twap(window: AggTradeWindow, start_ms: int, end_ms: int, step_ms: int = 1000) -> float | None:
    """Mean of the last print price at or before each sample time start, start+step, ... (< end).
    Sample times with no print at or before them are skipped."""
    if step_ms <= 0:
        raise ValueError("step_ms must be positive")
    samples = []
    for s in range(start_ms, end_ms, step_ms):
        n = int(np.searchsorted(window.ts_ms, s, side="right"))    # prints with ts <= s
        if n:
            samples.append(float(window.price[n - 1]))
    return float(np.mean(samples)) if samples else None

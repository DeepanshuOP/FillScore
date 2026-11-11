"""Price step (tick size) of a symbol on a given day, observed from its prints.

The exchange only publishes the CURRENT tick size (exchangeInfo PRICE_FILTER.tickSize), and tick sizes change
over time (BNBUSDT was 0.1 in January 2024). So for a historical day the step is observed: the smallest
positive gap between distinct printed prices. This is an upper bound on the true tick when few distinct prices
printed, so callers should take it from a whole day when they can.
"""
from __future__ import annotations

from typing import Iterable

import numpy as np


def tick_from_prints(prices: Iterable[float]) -> float | None:
    """Smallest positive gap between distinct prices, rounded to 8 decimals. None with fewer than 2 distinct prices.

    8 decimals is the price precision of the exchange. More digits keep float noise: at a price near 42,852 the
    difference of two neighbouring prices is 0.009999999995, not 0.01."""
    u = np.unique(np.round(np.asarray(list(prices) if not isinstance(prices, np.ndarray) else prices, dtype=np.float64), 8))
    if len(u) < 2:
        return None
    return float(round(float(np.diff(u).min()), 8))


def compare_exchange_info(symbol: str, observed: float | None, exchange_tick: float | None) -> str | None:
    """A warning string when the observed step and the exchange's current tick size disagree, else None."""
    if observed is None or exchange_tick is None:
        return None
    if abs(observed - exchange_tick) <= 1e-12:
        return None
    return f"{symbol}: observed price step {observed:g} differs from exchangeInfo tickSize {exchange_tick:g} (tick sizes change over time; the observed step is used)"

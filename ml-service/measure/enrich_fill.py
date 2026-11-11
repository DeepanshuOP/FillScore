"""One fill -> its measurement record. Composes data (window), benchmarks (quote_at) and metrics.

The caller supplies a window that covers [fill time - 5 s, fill time + 300 s]. A horizon whose mid is not
available (no fresh print, or the window ends first) is None. Nothing is imputed. The identity
    effective = realized(h) + impact(h)
is checked for every horizon that has values; a failure raises IdentityError and nothing is returned.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from config.versions import MEASURE_VERSION

from .benchmarks import MAX_QUOTE_AGE_MS, quote_at, quoted_spread
from .data.aggtrades import AggTradeWindow, ts_unit
from .metrics import check_decomposition, effective_half_spread_bps, eq_ratio, price_impact_bps, realized_half_spread_bps

HORIZONS_S = (1, 15, 60, 300)


@dataclass(frozen=True)
class FillInput:
    trade_id: str
    symbol: str
    side: int          # +1 buy, -1 sell
    price: float
    qty: float
    ts_ms: int         # epoch milliseconds


def _validate(f: FillInput, window: AggTradeWindow, tick: float) -> None:
    if f.side not in (1, -1):
        raise ValueError("side must be +1 (buy) or -1 (sell)")
    for name, v in (("price", f.price), ("qty", f.qty), ("tick", tick)):
        if not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v) or v <= 0:
            raise ValueError(f"{name} must be a positive finite number, got {v!r}")
    if f.symbol != window.symbol:
        raise ValueError(f"fill symbol {f.symbol!r} does not match window symbol {window.symbol!r}")
    if not isinstance(f.ts_ms, int) or isinstance(f.ts_ms, bool):
        raise ValueError("ts_ms must be an integer")
    if f.ts_ms >= 10**11 and ts_unit(f.ts_ms) != "ms":    # small values are synthetic test clocks
        raise ValueError(f"ts_ms {f.ts_ms} is not epoch milliseconds")


def measure_fill(f: FillInput, window: AggTradeWindow, tick: float) -> dict:
    _validate(f, window, tick)
    q = quote_at(window, f.ts_ms)
    realized: dict[str, float | None] = {str(h): None for h in HORIZONS_S}
    impact: dict[str, float | None] = {str(h): None for h in HORIZONS_S}
    rec = {
        "version": MEASURE_VERSION,
        "tradeId": f.trade_id,
        "symbol": f.symbol,
        "side": f.side,
        "mid": q.mid,
        "quoteQuality": q.quality,
        "quoteAgesMs": {"ask": q.ask_age_ms, "bid": q.bid_age_ms} if q.quality == "two_sided" else None,
        "effHalfBps": None,
        "eq": None,
        "realized": realized,
        "impact": impact,
        "tickSize": tick,
        "marketDataRefs": [r.to_dict() for r in window.refs],
        "unmeasuredReason": None,
    }
    if q.mid is None:
        rec["unmeasuredReason"] = f"no fresh print within {MAX_QUOTE_AGE_MS} ms before the fill"
        return rec

    eff = effective_half_spread_bps(f.side, f.price, q.mid)
    rec["effHalfBps"] = eff
    rec["eq"] = eq_ratio(eff, quoted_spread(q, tick), q.mid)
    for h in HORIZONS_S:
        qh = quote_at(window, f.ts_ms + h * 1000)
        if qh.mid is None:
            continue
        r = realized_half_spread_bps(f.side, f.price, q.mid, qh.mid)
        i = price_impact_bps(f.side, q.mid, qh.mid)
        check_decomposition(eff, r, i)
        realized[str(h)], impact[str(h)] = r, i
    return rec

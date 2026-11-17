"""The expected_cost hook of the production measurement job: the hour before an order comes from Binance public 1-minute
klines (measure/data/klines.py). No API key. The same model and calibration as the offline demo build (expected_cost.model).

A request is made only for an order the model can price (a MARKET order of a calibrated symbol); other orders get their
reason with no request. When the klines cannot be read (network, rate limit, request budget) the field says so; a missing
hour of trades says "no market context". The refs of the kline hours read are stored with the value (lineage)."""
from __future__ import annotations

import time
from typing import Callable

from expected_cost.model import Calibration, applies_to, expected_for_order, load_calibration, unavailable
from measure.data.klines import KlineStore, KlineUnavailable, LOOKBACK_MIN, MS_MIN, hour_context_from_klines

_STORE: KlineStore | None = None


def shared_store() -> KlineStore:
    """One store per process, so finished hours are cached across measurement jobs."""
    global _STORE
    if _STORE is None:
        _STORE = KlineStore()
    return _STORE


def kline_expected_cost_hook(store: KlineStore | None = None, cal: Calibration | None = None,
                             now_ms: Callable[[], int] = lambda: int(time.time() * 1000)):
    store = store or shared_store()
    cal = cal or load_calibration()
    store.start_job()

    def hook(info: dict) -> dict:
        symbol, t = info["symbol"], info["arrivalMs"]
        notional = (info["shortfall"] or {}).get("intendedNotional") or 0.0
        qty = info["orderedQty"] or 0.0
        if not applies_to(cal, symbol, info["orderType"]):
            return expected_for_order(cal, symbol=symbol, order_type=info["orderType"], notional=notional, quantity=qty, context=None)
        try:
            w = store.window(symbol, (t // MS_MIN - LOOKBACK_MIN - 1) * MS_MIN, (t // MS_MIN) * MS_MIN - 1, now_ms())
        except KlineUnavailable as e:
            return unavailable(cal, f"the market data for the hour before the order could not be read at measurement time ({e})")
        out = expected_for_order(cal, symbol=symbol, order_type=info["orderType"], notional=notional, quantity=qty,
                                 context=hour_context_from_klines(w, t))
        out["contextSource"] = "api/v3/klines"
        out["contextRefs"] = [r.to_dict() for r in w.refs]
        return out
    return hook

"""Features of the expected-cost model, from public aggregate trades (numpy only).

Hour context. For a time t, over the `lookback` whole minutes before the minute that holds t (minute = ts_ms // 60000):

    sigma  = sqrt(sum of squared 1-minute log returns of the minute closes), in bps   (realised volatility of the hour)
    volume = sum of the base quantity traded in those minutes

A minute close is the price of the last print of the minute. A minute without prints keeps the previous close and has
volume 0. The context is None ("insufficient data") when fewer than `min_bars` of the `lookback` minutes have prints, or
when no close exists before the window. These definitions are ours (the papers use the daily volatility and the daily
volume: see impact.py); they are the same in calibration and in use, which is what keeps the fitted multiplier honest.

Event features. A taker event is the set of prints of one millisecond and one aggressor side (scoring_v2.calibrate). For
each event with a context: its effective half-spread in bps against the mid strictly before its millisecond (the same
quote rules as the measurement layer), its notional and quantity, and the context of its minute.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from measure.data.aggtrades import AggTradeWindow
from scoring_v2.calibrate import event_starts, print_mids

LOOKBACK_MIN = 60
MIN_BARS = 30
MS_MIN = 60_000


@dataclass(frozen=True)
class Events:
    eff: np.ndarray        # effective half-spread of the event against the mid before it, bps (side-signed)
    notional: np.ndarray   # quote-currency value of the event
    qty: np.ndarray        # base quantity of the event
    sigma: np.ndarray      # hour volatility before the event, bps
    vol: np.ndarray        # hour volume before the event (base)
    ts_ms: np.ndarray      # millisecond of the event's first print

    def __len__(self) -> int:
        return int(len(self.eff))


def _grid(window: AggTradeWindow, lookback: int, min_bars: int, upto_minute: int | None = None):
    """Per-minute context for every minute from the first print's minute: arrays m0, sigma[m - m0], vol[m - m0]
    (NaN where the context is not defined). `upto_minute` extends the grid past the last print (the closes carry on)."""
    ts, price, qty = window.ts_ms, window.price, window.qty
    minute = ts // MS_MIN
    m0, m1 = int(minute[0]), max(int(minute[-1]), upto_minute or 0)
    n = m1 - m0 + 1
    last_pos = np.searchsorted(minute, np.arange(m0, m1 + 1), side="right") - 1     # last print at or before each minute end
    has = np.zeros(n, dtype=bool)
    has[np.unique(minute - m0)] = True
    close = price[last_pos]                                                         # carried forward by construction
    vol = np.bincount((minute - m0), weights=qty, minlength=n)
    ret2 = np.zeros(n)
    ret2[1:] = np.log(close[1:] / close[:-1]) ** 2
    c_ret, c_vol, c_has = (np.r_[0.0, np.cumsum(x)] for x in (ret2, vol, has.astype(float)))
    sigma = np.full(n, np.nan)
    volume = np.full(n, np.nan)
    # context for minute i uses minutes i - lookback .. i - 1, and the close of minute i - lookback - 1
    for_i = np.arange(lookback + 1, n)
    if len(for_i):
        lo, hi = for_i - lookback, for_i                                            # slice [lo, hi) of minute indexes
        s = c_ret[hi] - c_ret[lo]
        v = c_vol[hi] - c_vol[lo]
        ok = (c_has[hi] - c_has[lo]) >= min_bars
        sigma[for_i[ok]] = np.sqrt(s[ok]) * 1e4
        volume[for_i[ok]] = v[ok]
    return m0, sigma, volume


def hour_context(window: AggTradeWindow, t_ms: int, lookback: int = LOOKBACK_MIN, min_bars: int = MIN_BARS) -> tuple[float, float] | None:
    """(sigma in bps, volume) of the `lookback` minutes before the minute holding t_ms, or None."""
    if len(window) == 0:
        return None
    m0, sigma, volume = _grid(window, lookback, min_bars, upto_minute=int(t_ms // MS_MIN))
    i = int(t_ms // MS_MIN) - m0
    if i < 0 or i >= len(sigma) or not np.isfinite(sigma[i]):
        return None
    return float(sigma[i]), float(volume[i])


def event_features(window: AggTradeWindow, lookback: int = LOOKBACK_MIN, min_bars: int = MIN_BARS) -> Events:
    empty = Events(*(np.zeros(0) for _ in range(6)))
    if len(window) == 0:
        return empty
    starts = event_starts(window)
    gid = np.cumsum(starts) - 1
    ng = int(gid[-1]) + 1
    first = np.flatnonzero(starts)
    qty = np.bincount(gid, weights=window.qty, minlength=ng)
    notional = np.bincount(gid, weights=window.price * window.qty, minlength=ng)
    mids = print_mids(window)[first]
    side = np.where(window.is_buyer_maker[first], -1.0, 1.0)
    with np.errstate(invalid="ignore", divide="ignore"):
        vwap = notional / qty
        eff = side * (vwap - mids) / mids * 1e4
    m0, sigma, volume = _grid(window, lookback, min_bars)
    ts0 = window.ts_ms[first]
    idx = (ts0 // MS_MIN - m0).astype(np.int64)
    sg, vl = sigma[idx], volume[idx]
    ok = np.isfinite(eff) & np.isfinite(sg) & (qty > 0)
    return Events(eff[ok], notional[ok], qty[ok], sg[ok], vl[ok], ts0[ok])

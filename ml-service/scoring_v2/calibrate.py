"""C6: calibration of Scoring v2 from real public prints (Binance spot aggTrades, checksum-verified files).

For each symbol it builds:
  * spread anchors per notional bucket: percentiles (10, 50, 90, 99) of the effective half-spread that public taker
    prints paid against the same mid the user's fills are measured with (measure.benchmarks rules, vectorised);
  * slippage anchors per duration bucket: percentiles of the signed mid drift over that duration, from start times
    every `step` seconds, counted for both a buy and a sell (so the baseline is a random-side entry);
  * an hour profile: for each UTC hour, the median quoted half-spread proxy (bps) plus the median absolute 1-minute
    mid return (bps) (spec decision D5).
Anchors need MIN_SAMPLES samples and strictly increasing percentiles; otherwise they are None and the component reads
"insufficient data" for that bucket. Nothing here writes to a database.
"""
from __future__ import annotations

import math
from collections import defaultdict

import numpy as np

from measure.benchmarks import MAX_QUOTE_AGE_MS, quote_at
from measure.data.aggtrades import AggTradeWindow

from .components import notional_bucket

MIN_SAMPLES = 200
PCTS = (10, 50, 90, 99)
# One representative duration per slippage bucket (each falls inside its bucket; tested).
DURATION_SAMPLE_MS = {"lt1s": 500, "1s-10s": 5_000, "10s-1m": 30_000, "1m-10m": 300_000, "10m-1h": 1_800_000, "ge1h": 7_200_000}


def print_mids(window: AggTradeWindow, max_age_ms: int = MAX_QUOTE_AGE_MS) -> np.ndarray:
    """The mid strictly before each print, by the same rules as measure.benchmarks.quote_at (NaN where none)."""
    ts, price = window.ts_ms, window.price
    n = len(window)
    out = np.full(n, np.nan)
    if n == 0:
        return out
    n_before = np.searchsorted(ts, ts, side="left")                  # prints [0, n_before) have ts < ts_i

    def last_on(buyer: bool):
        idx = window.side_index(buyer)
        k = np.searchsorted(idx, n_before, side="left") - 1
        pos = np.where(k >= 0, idx[np.clip(k, 0, max(len(idx) - 1, 0))] if len(idx) else -1, -1)
        return pos

    ia, ib = last_on(True), last_on(False)
    have = (ia >= 0) & (ib >= 0)
    ask = np.where(have, price[np.clip(ia, 0, None)], np.nan)
    bid = np.where(have, price[np.clip(ib, 0, None)], np.nan)
    ask_age = np.where(have, ts - ts[np.clip(ia, 0, None)], np.iinfo(np.int64).max)
    bid_age = np.where(have, ts - ts[np.clip(ib, 0, None)], np.iinfo(np.int64).max)
    two = have & (ask_age <= max_age_ms) & (bid_age <= max_age_ms) & (ask >= bid)
    out[two] = (ask[two] + bid[two]) / 2.0
    last = n_before - 1
    fresh_last = (~two) & (last >= 0) & ((ts - ts[np.clip(last, 0, None)]) <= max_age_ms)
    out[fresh_last] = price[last[fresh_last]]
    return out


def print_effective_half_bps(window: AggTradeWindow) -> tuple[np.ndarray, np.ndarray]:
    """(effective half-spread in bps of each public print against the mid before it, notional of the print)."""
    mids = print_mids(window)
    side = np.where(window.is_buyer_maker, -1.0, 1.0)                 # buyer-initiated = +1
    with np.errstate(invalid="ignore"):
        eff = side * (window.price - mids) / mids * 1e4
    return eff, window.price * window.qty


def _mid(window: AggTradeWindow, t: int) -> float | None:
    return quote_at(window, int(t)).mid


def drift_samples(window: AggTradeWindow, duration_ms: int, step_ms: int) -> list[float]:
    """Signed mid drift over `duration_ms` (bps of the start mid), from start times every `step_ms`, for both sides."""
    if len(window) == 0:
        return []
    out: list[float] = []
    start, end = int(window.ts_ms[0]), int(window.ts_ms[-1])
    for t in range(start, end - duration_ms + 1, step_ms):
        m0, m1 = _mid(window, t), _mid(window, t + duration_ms)
        if m0 is None or m1 is None:
            continue
        d = (m1 - m0) / m0 * 1e4
        out += [d, -d]
    return out


def hour_samples(window: AggTradeWindow, tick: float, step_ms: int = 10_000) -> tuple[dict, dict]:
    """Per UTC hour: quoted half-spread proxy samples (bps, floored at half a tick) every `step_ms`, and absolute
    1-minute mid returns (bps) at whole minutes."""
    spreads: dict[int, list[float]] = defaultdict(list)
    rets: dict[int, list[float]] = defaultdict(list)
    if len(window) == 0:
        return dict(spreads), dict(rets)
    start, end = int(window.ts_ms[0]), int(window.ts_ms[-1])
    for t in range(start, end + 1, step_ms):
        q = quote_at(window, t)
        if q.quality == "two_sided":
            spreads[(t // 3_600_000) % 24].append(max(q.ask - q.bid, tick) / 2 / q.mid * 1e4)
    first_min = -(-start // 60_000) * 60_000
    for t in range(first_min, end + 60_001, 60_000):
        m0, m1 = _mid(window, t), _mid(window, t + 60_000)
        if m0 is None or m1 is None:
            continue
        rets[(t // 3_600_000) % 24].append(abs(math.log(m1 / m0)) * 1e4)
    return dict(spreads), dict(rets)


def anchors_from(samples) -> list[float] | None:
    x = np.asarray(samples, dtype=float)
    x = x[np.isfinite(x)]
    if len(x) < MIN_SAMPLES:
        return None
    a = [float(v) for v in np.percentile(x, PCTS)]
    if not all(a[i] < a[i + 1] for i in range(3)):
        return None
    return a


def spread_by_bucket(windows: list[AggTradeWindow]) -> dict[str, list[float] | None]:
    groups: dict[str, list[np.ndarray]] = defaultdict(list)
    for w in windows:
        eff, notional = print_effective_half_bps(w)
        buckets = np.array([notional_bucket(v) for v in notional])
        for b in set(buckets.tolist()):
            groups[b].append(eff[buckets == b])
    return {b: anchors_from(np.concatenate(v)) for b, v in groups.items()}


def slippage_by_bucket(windows: list[AggTradeWindow], step_ms: int = 60_000) -> dict[str, list[float] | None]:
    return {b: anchors_from([d for w in windows for d in drift_samples(w, ms, step_ms)]) for b, ms in DURATION_SAMPLE_MS.items()}


def hour_profile(windows: list[AggTradeWindow], tick: float, step_ms: int = 10_000) -> list[float] | None:
    spreads: dict[int, list[float]] = defaultdict(list)
    rets: dict[int, list[float]] = defaultdict(list)
    for w in windows:
        s, r = hour_samples(w, tick, step_ms)
        for h, v in s.items():
            spreads[h] += v
        for h, v in r.items():
            rets[h] += v
    if any(not spreads.get(h) or not rets.get(h) for h in range(24)):
        return None
    return [float(np.median(spreads[h]) + np.median(rets[h])) for h in range(24)]

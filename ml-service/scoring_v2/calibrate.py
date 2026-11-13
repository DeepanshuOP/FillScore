"""C6: calibration of Scoring v2 from real public prints (Binance spot aggTrades, checksum-verified files).

For each symbol it builds:
  * spread anchors per notional bucket: percentiles (10, 50, 90, 99) of the effective half-spread that public taker
    EVENTS paid against the same mid the user's fills are measured with (measure.benchmarks rules, vectorised).
    A taker event is a run of consecutive prints with the same millisecond and the same aggressor side: one taker
    order walking several price levels prints one aggTrade per level, all in one millisecond. The event pays its
    VWAP against the mid strictly before that millisecond, and is bucketed by its total notional. Since v2.1.0
    (M1.1, ADR-0012); v2.0.0 measured every print separately, which counted the deeper levels of one order as extra
    small takers and put the BTCUSDT lt1k median at 0.20 bps instead of half a tick (docs/research/LOG.md §K);
  * slippage anchors per duration bucket: percentiles of the signed mid drift over that duration, from start times
    every `step` seconds, counted for both a buy and a sell (so the baseline is a random-side entry);
  * an hour profile: for each UTC hour, the median quoted half-spread proxy (bps) plus the median absolute 1-minute
    mid return (bps) (spec decision D5).
Anchors need MIN_SAMPLES samples and strictly increasing percentiles; otherwise they are None and the component reads
"insufficient data" for that bucket. An hour profile needs MIN_PROFILE_DAYS days with samples in every hour.
Calibration streams: `day_summary` reduces one day's prints to the samples above (a few MB), `save_summary` /
`load_summary` keep it on disk so the raw file can be deleted, and `merge_summaries` builds the anchors from all days.
Nothing here writes to a database.
"""
from __future__ import annotations

import math
from collections import defaultdict
from pathlib import Path

import numpy as np

from measure.benchmarks import MAX_QUOTE_AGE_MS, quote_at
from measure.data.aggtrades import AggTradeWindow

from .components import notional_bucket

MIN_SAMPLES = 200
HOUR_EVENT_CAP = 4000   # per day and hour: finite event costs kept, as a deterministic stride (v2.2.0)
MIN_PROFILE_DAYS = 30  # days with samples in an hour before that hour's profile value is used (M1.1)
PCTS = (10, 50, 90, 99)
SUMMARY_FORMAT = 2      # 2 = adds per-hour taker-event costs and the typical mid (v2.2.0). Bump when day_summary changes, so stale summaries on disk are never merged
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
    """(effective half-spread in bps of each public print against the mid before it, notional of the print).
    The v2.0.0 baseline. Kept for the bias report (scripts/spread_bias_report.py); calibration uses taker_events."""
    mids = print_mids(window)
    side = np.where(window.is_buyer_maker, -1.0, 1.0)                 # buyer-initiated = +1
    with np.errstate(invalid="ignore"):
        eff = side * (window.price - mids) / mids * 1e4
    return eff, window.price * window.qty


def event_starts(window: AggTradeWindow) -> np.ndarray:
    """Boolean mask: True where a print starts a new taker event (another millisecond or another aggressor side
    than the print before it, in aggregate-id order)."""
    ts, m = window.ts_ms, window.is_buyer_maker
    if len(ts) == 0:
        return np.zeros(0, dtype=bool)
    return np.r_[True, (ts[1:] != ts[:-1]) | (m[1:] != m[:-1])]


def taker_events(window: AggTradeWindow) -> tuple[np.ndarray, np.ndarray]:
    """(effective half-spread in bps of each taker event's VWAP against the mid strictly before its millisecond,
    notional of the event). NaN where no mid exists. All prints of one event share one millisecond, so they share
    one mid, exactly as all fills of one user order in one millisecond do (measure.enrich_fill)."""
    eff, notional, _, _ = _events(window)
    return eff, notional


def _events(window: AggTradeWindow) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """(effective half-spread bps, notional, UTC hour of the first print, mid before the first print) per taker event."""
    n = len(window)
    if n == 0:
        z = np.zeros(0)
        return z, z, z.astype(np.int64), z
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
    eff = np.where(qty > 0, eff, np.nan)
    hours = ((window.ts_ms[first] // 3_600_000) % 24).astype(np.int64)
    return eff, notional, hours, mids


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


def _bucket_ids(notional: np.ndarray) -> np.ndarray:
    return np.array([notional_bucket(float(v)) for v in notional], dtype=object)


def day_summary(window: AggTradeWindow, tick: float, drift_step_ms: int = 60_000, hour_step_ms: int = 10_000,
                hour_event_cap: int = HOUR_EVENT_CAP) -> dict:
    """One day's prints -> the samples calibration needs: finite taker-event spreads per notional bucket, signed mid
    drifts per duration bucket, and per-hour quoted half-spread and absolute 1-minute return samples."""
    eff, notional, hours, mids = _events(window)
    ok = np.isfinite(eff)
    buckets = _bucket_ids(notional[ok]) if ok.any() else np.array([], dtype=object)
    e = eff[ok]
    hour_event, hour_n = {}, {}
    for h in sorted(set(hours[ok].tolist())):
        x = eff[ok & (hours == h)]
        k = max(1, -(-len(x) // max(1, hour_event_cap)))      # ceil(n / cap): a deterministic stride, not a random sample
        hour_event[int(h)], hour_n[int(h)] = x[::k].astype(np.float64), int(len(x))
    fm = mids[np.isfinite(mids)]
    spread ={b: e[buckets == b].astype(np.float64) for b in sorted(set(buckets.tolist()))}
    drift = {b: np.asarray(drift_samples(window, ms, drift_step_ms), dtype=np.float64) for b, ms in DURATION_SAMPLE_MS.items()}
    hs, hr = hour_samples(window, tick, hour_step_ms)
    return {"spread": spread, "drift": drift, "tick": float(tick), "events": int(len(eff)),
            "mid": float(np.median(fm)) if len(fm) else None, "hourEvent": hour_event, "hourEventN": hour_n,
            "hourSpread": {int(h): np.asarray(v, dtype=np.float64) for h, v in hs.items()},
            "hourRet": {int(h): np.asarray(v, dtype=np.float64) for h, v in hr.items()}}


def summary_code_key() -> str:
    """SHA-256 over the source of every function that shapes a day summary, and the constants they read. A summary
    stores it, so a resumed calibration never merges summaries made by other code (review M1.1)."""
    import hashlib
    import inspect

    from measure import benchmarks

    from . import components
    funcs = (day_summary, taker_events, _events, event_starts, print_mids, drift_samples, hour_samples, _mid, _bucket_ids,
             benchmarks.quote_at, benchmarks._last_on_side, components.notional_bucket)
    consts = (benchmarks.MAX_QUOTE_AGE_MS, components.NOTIONAL_BUCKETS, DURATION_SAMPLE_MS, SUMMARY_FORMAT, HOUR_EVENT_CAP)
    h = hashlib.sha256()
    for f in funcs:
        h.update(inspect.getsource(f).encode() + b"\0")
    h.update(repr(consts).encode())
    return h.hexdigest()


def save_summary(path, s: dict) -> None:
    """`s["codeKey"]` defaults to the current summary_code_key(); tests may pass another value."""
    arrays = {"format": np.array(SUMMARY_FORMAT), "tick": np.array(s["tick"]), "events": np.array(s["events"]),
              "codeKey": np.array(str(s.get("codeKey", summary_code_key())))}
    if s.get("sha256"):
        arrays["sha256"] = np.array(str(s["sha256"]))         # the source file's checksum, for the version's refs
    arrays["mid"] = np.array(np.nan if s.get("mid") is None else s["mid"])
    for kind in ("spread", "drift", "hourSpread", "hourRet", "hourEvent"):
        for key, v in s.get(kind, {}).items():
            arrays[f"{kind}|{key}"] = np.asarray(v, dtype=np.float64)
    for key, v in s.get("hourEventN", {}).items():
        arrays[f"hourEventN|{key}"] = np.array(int(v))
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".part.npz")
    np.savez_compressed(tmp, **arrays)
    tmp.replace(path)


def load_summary(path) -> dict:
    with np.load(Path(path), allow_pickle=False) as z:
        if int(z["format"]) != SUMMARY_FORMAT:
            raise ValueError(f"{path}: summary format {int(z['format'])}, expected {SUMMARY_FORMAT}")
        s = {"tick": float(z["tick"]), "events": int(z["events"]), "spread": {}, "drift": {}, "hourSpread": {}, "hourRet": {},
             "hourEvent": {}, "hourEventN": {}, "mid": None if np.isnan(float(z["mid"])) else float(z["mid"])}
        if "sha256" in z.files:
            s["sha256"] = str(z["sha256"])
        s["codeKey"] = str(z["codeKey"]) if "codeKey" in z.files else ""      # "" = made before keys existed
        for name in z.files:
            if "|" in name:
                kind, key = name.split("|", 1)
                s[kind][int(key) if kind.startswith("hour") else key] = int(z[name]) if kind == "hourEventN" else z[name]
    return s


def merge_summaries(summaries: list[dict], min_profile_days: int = MIN_PROFILE_DAYS) -> dict:
    """All days of one symbol -> spread and slippage anchors, the hour profile, and the sample counts behind them."""
    spread: dict[str, list[np.ndarray]] = defaultdict(list)
    drift: dict[str, list[np.ndarray]] = defaultdict(list)
    hs: dict[int, list[np.ndarray]] = defaultdict(list)
    hr: dict[int, list[np.ndarray]] = defaultdict(list)
    days_with = defaultdict(int)
    he: dict[int, list[np.ndarray]] = defaultdict(list)
    he_n: dict[int, int] = defaultdict(int)
    he_days = defaultdict(int)
    for s in summaries:
        for h, v in s.get("hourEvent", {}).items():
            if len(v):
                he[h].append(v)
                he_n[h] += int(s.get("hourEventN", {}).get(h, len(v)))
                he_days[h] += 1
        for b, v in s["spread"].items():
            spread[b].append(v)
        for b, v in s["drift"].items():
            drift[b].append(v)
        for h in range(24):
            a, r = s["hourSpread"].get(h), s["hourRet"].get(h)
            if a is not None and len(a) and r is not None and len(r):
                hs[h].append(a)
                hr[h].append(r)
                days_with[h] += 1
    sp = {b: np.concatenate(v) for b, v in spread.items()}
    dr = {b: np.concatenate(drift.get(b, [np.zeros(0)])) for b in DURATION_SAMPLE_MS}
    profile_days = [int(days_with[h]) for h in range(24)]
    profile = None
    if min(profile_days) >= max(1, min_profile_days):
        profile = [float(np.median(np.concatenate(hs[h])) + np.median(np.concatenate(hr[h]))) for h in range(24)]
    cost = None
    if min(he_days[h] for h in range(24)) >= max(1, min_profile_days):
        steps = [s["tick"] / s["mid"] * 1e4 for s in summaries if s.get("mid")]
        cost = {"medianBps": [float(np.median(np.concatenate(he[h]))) for h in range(24)],
                "events": [int(he_n[h]) for h in range(24)], "eventDays": [int(he_days[h]) for h in range(24)],
                "stepBps": float(np.median(steps)) if steps else None}
    return {"costProfile": cost, "spread": {b: anchors_from(v) for b, v in sp.items()},
            "slippage": {b: anchors_from(v) for b, v in dr.items()},
            "profile": profile, "profileDays": profile_days,
            "counts": {"spread": {b: int(len(v)) for b, v in sp.items()}, "slippage": {b: int(len(v)) for b, v in dr.items()},
                       "days": len(summaries)}}


def spread_by_bucket(windows: list[AggTradeWindow]) -> dict[str, list[float] | None]:
    groups: dict[str, list[np.ndarray]] = defaultdict(list)
    for w in windows:
        eff, notional = taker_events(w)
        ok = np.isfinite(eff)
        buckets = _bucket_ids(notional[ok]) if ok.any() else np.array([], dtype=object)
        for b in set(buckets.tolist()):
            groups[b].append(eff[ok][buckets == b])
    return {b: anchors_from(np.concatenate(v)) for b, v in groups.items()}


def slippage_by_bucket(windows: list[AggTradeWindow], step_ms: int = 60_000) -> dict[str, list[float] | None]:
    return {b: anchors_from([d for w in windows for d in drift_samples(w, ms, step_ms)]) for b, ms in DURATION_SAMPLE_MS.items()}

"""M1.1 report: is the public effective half-spread baseline biased by stale quote proxies or by multi-level taker
orders? Reads data.binance.vision daily aggTrades zips (checksum-verified by measure.data.vision.load_day) and prints,
per symbol over the given days:

  1. print level (the v2.0.0 calibration rule), notional < 1k USD: median effective half-spread overall, by quote
     age (max of ask/bid proxy age: <=50, 50-250, 250-1000, 1000-5000 ms), and for the first print of a
     same-millisecond same-side burst vs the later prints;
  2. taker events (the v2.1.0 rule), per notional bucket: median and 90th percentile by quote age cap, and the share
     of events that still have a two-sided quote under each cap (coverage);
  3. optionally (--us) the same event medians with events grouped by the files' exact microsecond transaction time
     instead of the millisecond, to check that millisecond grouping (what user fills carry) loses nothing material.

    cd ml-service && .venv/bin/python scripts/spread_bias_report.py --symbols BTCUSDT ETHUSDT BNBUSDT SOLUSDT \
        --start 2025-10-01 --end 2025-10-29 --every 7 [--us]

Population: an event (or print) is counted here only with a two-sided quote (both proxies within the cap, ask >= bid).
The calibration also keeps the "last trade" fallback for the rest (about 2-3% of events at 5000 ms), so these medians
describe the two-sided subset, not exactly the population behind the anchors.

Read-only: no database, no writes except the download cache.
"""
from __future__ import annotations

import argparse
import io
import sys
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from measure.data import vision  # noqa: E402
from scoring_v2.calibrate import event_starts, print_effective_half_bps  # noqa: E402
from scoring_v2.components import NOTIONAL_BUCKETS, notional_bucket  # noqa: E402

AGE_BUCKETS = ((-1, 50), (50, 250), (250, 1000), (1000, 5000))
CAPS = (50, 250, 1000, 5000)


def days(start: str, end: str, every: int) -> list[str]:
    from datetime import date, timedelta
    d, d1, out = date.fromisoformat(start), date.fromisoformat(end), []
    while d <= d1:
        out.append(d.isoformat())
        d += timedelta(days=every)
    return out


def last_before(key: np.ndarray, mask: np.ndarray, t: np.ndarray) -> np.ndarray:
    """Position of the last print with `mask` and key < t, or -1."""
    n_before = np.searchsorted(key, t, side="left")
    idx = np.flatnonzero(mask)
    if len(idx) == 0:
        return np.full(len(t), -1)
    k = np.searchsorted(idx, n_before, side="left") - 1
    return np.where(k >= 0, idx[np.clip(k, 0, None)], -1)


def quote_ages(key: np.ndarray, buy: np.ndarray, price: np.ndarray, t: np.ndarray, scale: float):
    """(mid, max proxy age in ms) of the two-sided quote strictly before each t; NaN / inf where there is none."""
    ia, ib = last_before(key, buy, t), last_before(key, ~buy, t)
    ok = (ia >= 0) & (ib >= 0)
    ask, bid = price[np.clip(ia, 0, None)], price[np.clip(ib, 0, None)]
    age = np.maximum(t - key[np.clip(ia, 0, None)], t - key[np.clip(ib, 0, None)]) / scale
    ok &= ask >= bid
    return np.where(ok, (ask + bid) / 2, np.nan), np.where(ok, age, np.inf)


def events(key, buy, price, qty, scale):
    starts = np.r_[True, (key[1:] != key[:-1]) | (buy[1:] != buy[:-1])] if len(key) else np.zeros(0, bool)
    gid = np.cumsum(starts) - 1
    ng = int(gid[-1]) + 1 if len(gid) else 0
    first = np.flatnonzero(starts)
    q = np.bincount(gid, weights=qty, minlength=ng)
    notional = np.bincount(gid, weights=price * qty, minlength=ng)
    mid, age = quote_ages(key, buy, price, key[first], scale)
    side = np.where(buy[first], 1.0, -1.0)
    with np.errstate(invalid="ignore"):
        eff = side * (notional / q - mid) / mid * 1e4
    return eff, notional, age


def raw_us(symbol: str, day: str, cache: Path):
    """Prints with their microsecond timestamps (vision.parse_csv floors to ms; here the raw column is kept)."""
    vision.load_day(symbol, day, cache)                 # download + checksum if needed
    z = cache / symbol / f"{symbol}-aggTrades-{day}.zip"
    with zipfile.ZipFile(z) as f:
        df = pd.read_csv(io.BytesIO(f.read(f.namelist()[0])), header=None, usecols=[1, 2, 5, 6])
    m = df[6]
    if m.dtype != bool:
        m = m.astype(str).str.lower().map({"true": True, "false": False})
    return df[5].to_numpy(np.int64), ~m.to_numpy(bool), df[1].to_numpy(float), df[2].to_numpy(float)


def med(x):
    x = x[np.isfinite(x)]
    return float(np.median(x)) if len(x) else float("nan")


def p90(x):
    x = x[np.isfinite(x)]
    return float(np.percentile(x, 90)) if len(x) else float("nan")


def report(symbol: str, chosen: list[str], cache: Path, with_us: bool) -> None:
    P = {"eff": [], "age": [], "first": []}
    E = {"eff": [], "not": [], "age": []}
    U = {"eff": [], "not": [], "age": []}
    for d in chosen:
        w = vision.load_day(symbol, d, cache)
        buy = ~w.is_buyer_maker
        eff, notional = print_effective_half_bps(w)
        _, age = quote_ages(w.ts_ms, buy, w.price, w.ts_ms, 1.0)
        small = (notional < 1000) & np.isfinite(eff) & np.isfinite(age) & (age <= 5000)
        P["eff"].append(eff[small]); P["age"].append(age[small]); P["first"].append(event_starts(w)[small])
        e, n, a = events(w.ts_ms, buy, w.price, w.qty, 1.0)
        E["eff"].append(e); E["not"].append(n); E["age"].append(a)
        if with_us:
            ts, b, p, q = raw_us(symbol, d, cache)
            e, n, a = events(ts, b, p, q, 1000.0 if ts.max() >= 10**15 else 1.0)
            U["eff"].append(e); U["not"].append(n); U["age"].append(a)
    pe, pa, pf = (np.concatenate(P[k]) for k in ("eff", "age", "first"))
    print(f"== {symbol}  days={len(chosen)}")
    print(f"  print level, <1k USD: all {med(pe):.5f} bps (n={len(pe):,}) | first of burst {med(pe[pf]):.5f} (n={pf.sum():,})"
          f" | later in burst {med(pe[~pf]):.5f} (n={(~pf).sum():,}, {(~pf).mean():.0%} of prints)")
    print("  print level, <1k USD, by max quote age: " + "  ".join(
        f"{lo + 1 if lo >= 0 else 0}-{hi} ms {med(pe[(pa > lo) & (pa <= hi)]):.5f}" for lo, hi in AGE_BUCKETS))
    for label, D in (("events (ms)", E), ("events (us)", U)):
        if not D["eff"]:
            continue
        ee, en, ea = (np.concatenate(D[k]) for k in ("eff", "not", "age"))
        bucket = np.array([notional_bucket(float(v)) for v in en], dtype=object)
        for _, b in list(NOTIONAL_BUCKETS) + [(None, "ge100k")]:
            s = bucket == b
            cells = "  ".join(f"<={c}ms {med(ee[s & (ea <= c)]):.5f}/{p90(ee[s & (ea <= c)]):.3f} cov {(s & (ea <= c)).sum() / max(s.sum(), 1):.2f}"
                              for c in CAPS)
            print(f"  {label} {b:8s} n={s.sum():>9,}  median/p90 bps and coverage by age cap: {cells}")


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--symbols", nargs="+", required=True)
    p.add_argument("--start", required=True)
    p.add_argument("--end", required=True)
    p.add_argument("--every", type=int, default=7)
    p.add_argument("--cache", default=str(ROOT / ".cache" / "market" / "zips"))
    p.add_argument("--us", action="store_true")
    a = p.parse_args(argv)
    chosen = days(a.start, a.end, a.every)
    for s in a.symbols:
        report(s, chosen, Path(a.cache), a.us)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

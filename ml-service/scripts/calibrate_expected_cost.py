"""Calibrate the expected-cost model on the January 2024 tapes in .cache/market/zips. Never writes to MongoDB.

    cd ml-service && .venv/bin/python scripts/calibrate_expected_cost.py --id ec1.0.0 \
        --symbols BTCUSDT ETHUSDT BNBUSDT SOLUSDT --start 2024-01-01 --end 2024-01-31 --out expected_cost/versions/ec1.0.0.json

Days are split by a fixed rule (expected_cost.calibrate.split_days) into fit, calibration and test days. Each day's taker
events are thinned by a deterministic stride to at most --cap events (the same rule every run), which bounds memory. The
raw files must already be in the cache (they are the checksum-verified files of the M2 build); nothing is downloaded.
The output is a candidate version file; committing it is a separate, reviewed step, and a committed version is never edited.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from expected_cost import calibrate as cal  # noqa: E402
from expected_cost.features import LOOKBACK_MIN, MIN_BARS, Events, event_features  # noqa: E402
from measure.data import vision  # noqa: E402

CACHE = ROOT / ".cache" / "market" / "zips"
CAP = 50_000


def day_list(start: str, end: str) -> list[str]:
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    return [(d0 + timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]


def thin(ev: Events, cap: int) -> Events:
    k = max(1, -(-len(ev) // cap))               # ceil(n / cap): a stride, not a random sample
    return Events(*(getattr(ev, f)[::k] for f in Events.__dataclass_fields__))


def concat(parts: list[Events]) -> Events:
    return Events(*(np.concatenate([getattr(p, f) for p in parts]) for f in Events.__dataclass_fields__))


def no_network(_url):
    raise RuntimeError("the raw file is not in the cache and this script does not download")


def code_hash() -> str:
    h = hashlib.sha256()
    for name in ("features.py", "calibrate.py", "impact.py", "conformal.py"):
        h.update((ROOT / "expected_cost" / name).read_bytes())
    return h.hexdigest()


def build(version_id: str, symbols: list[str], days: list[str], cap: int = CAP, alpha: float = 0.1) -> dict:
    split = cal.split_days(days)
    out = {"id": version_id, "alpha": alpha, "split": split, "eventCapPerDay": cap,
           "definitions": {"lookbackMinutes": LOOKBACK_MIN, "minBarsWithPrints": MIN_BARS,
                           "unit": "taker event (one millisecond, one aggressor side)",
                           "model": "expected = s/2 + Y * sigma * sqrt(Q / V); sigma = hour realised volatility (bps), Q = event quantity, V = hour volume",
                           "firstHour": "events in the first hour of a UTC day have no context and are dropped (days are read one at a time)"},
           "codeHash": code_hash(), "symbols": {}, "sources": {}}
    for symbol in symbols:
        parts: dict[str, list[Events]] = {k: [] for k in split}
        refs = {}
        for k, ds in split.items():
            for day in ds:
                w = vision.load_day(symbol, day, CACHE, opener=no_network)
                refs[day] = w.refs[0].sha256
                parts[k].append(thin(event_features(w), cap))
        out["sources"][symbol] = refs
        c = cal.calibrate_symbol(concat(parts["fit"]), concat(parts["calibration"]), concat(parts["test"]), alpha=alpha)
        c["nCalibration"], c["nTest"] = int(sum(len(p) for p in parts["calibration"])), int(sum(len(p) for p in parts["test"]))
        out["symbols"][symbol] = c
        print(f"{symbol}: s/2={c['halfSpreadBps']:.5f} bps  Y={c['y']:.4f}  fit={c['nFit']}  cal={c['nCalibration']}  test={c['nTest']}")
        for b, v in c["buckets"].items():
            q = "none" if v["q"] is None else f"{v['q']:.4f}"
            cv = "n/a" if v["coverage"] is None else f"{v['coverage']:.4f}"
            print(f"    {b:9s} nCal={v['nCalibration']:7d} q90={q:>8s}  nTest={v['nTest']:7d} coverage={cv}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--id", required=True)
    ap.add_argument("--symbols", nargs="+", required=True)
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    ap.add_argument("--cap", type=int, default=CAP)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    out = build(args.id, args.symbols, day_list(args.start, args.end), args.cap)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print("wrote", args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Calibrate Scoring v2 from checksum-verified data.binance.vision daily aggTrades. Never writes to MongoDB.

    cd ml-service && .venv/bin/python scripts/calibrate_v2.py --id v2.0.0 \
        --symbols BTCUSDT ETHUSDT BNBUSDT SOLUSDT --start 2025-10-01 --end 2025-10-29 --every 7 \
        --out scoring_v2/versions/v2.0.0.json

Days are chosen by a fixed rule (every `--every`-th day from --start, up to --end), never by hand, and are written
into the version file. Downloads are cached under MARKETDATA_CACHE_DIR (default .cache/market). The output is a
candidate version file; committing it is a separate, reviewed step, and a committed version is never edited.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from measure.data import vision  # noqa: E402
from measure.data.ticks import tick_from_prints  # noqa: E402
from scoring_v2 import calibrate as cal  # noqa: E402
from scoring_v2.version import build_version, dumps_version  # noqa: E402


def days(start: str, end: str, every: int) -> list[str]:
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    out, d = [], d0
    while d <= d1:
        out.append(d.isoformat())
        d += timedelta(days=every)
    return out


def calibrate(windows_by_symbol: dict, step_ms: int = 60_000, hour_step_ms: int = 10_000) -> tuple[dict, dict]:
    anchors, profiles = {}, {}
    for symbol, windows in sorted(windows_by_symbol.items()):
        tick = min(t for t in (tick_from_prints(w.price) for w in windows) if t is not None)
        anchors[symbol] = {"spread": cal.spread_by_bucket(windows), "slippage": cal.slippage_by_bucket(windows, step_ms),
                           "tick": tick}
        profiles[symbol] = cal.hour_profile(windows, tick, hour_step_ms)
    return anchors, profiles


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--id", required=True)
    p.add_argument("--symbols", nargs="+", required=True)
    p.add_argument("--start", required=True)
    p.add_argument("--end", required=True)
    p.add_argument("--every", type=int, default=7)
    p.add_argument("--out", required=True)
    p.add_argument("--cache", default=str(ROOT / ".cache" / "market" / "zips"))
    a = p.parse_args(argv)
    chosen = days(a.start, a.end, a.every)
    windows, refs = {}, []
    for s in a.symbols:
        windows[s] = []
        for d in chosen:
            w = vision.load_day(s, d, a.cache)
            print(f"{s} {d}: {len(w):,} prints, sha256 {w.refs[0].sha256[:12]}…", flush=True)
            windows[s].append(w)
            refs.append({"file": f"{s}-aggTrades-{d}.zip", "sha256": w.refs[0].sha256, "url": vision.day_url(s, d)})
    anchors, profiles = calibrate(windows)
    v = build_version(a.id, anchors, profiles, {"start": a.start, "end": a.end, "days": chosen, "rule": f"every {a.every} days"}, refs)
    Path(a.out).write_text(dumps_version(v), encoding="utf-8")
    for s in sorted(anchors):
        print(s, "tick", anchors[s]["tick"])
        for comp in ("spread", "slippage"):
            for b, an in sorted(anchors[s][comp].items()):
                print(f"  {comp:8s} {b:9s} {an if an is None else [round(x, 4) for x in an]}")
        print("  hours", None if profiles[s] is None else [round(x, 3) for x in profiles[s]])
    print(f"wrote {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Calibrate Scoring v2 from checksum-verified data.binance.vision daily aggTrades. Never writes to MongoDB.

    cd ml-service && .venv/bin/python scripts/calibrate_v2.py --id v2.1.0 \
        --symbols BTCUSDT ETHUSDT BNBUSDT SOLUSDT --start 2026-08-12 --end 2026-11-09 --every 1 \
        --summaries .cache/market/summaries --discard-raw --out scoring_v2/versions/v2.1.0.json

Days are chosen by a fixed rule (every `--every`-th day from --start, up to --end), never by hand, and are written
into the version file. Streaming: each day is downloaded (or read from --cache), checked against its published
SHA-256, reduced to a small summary (scoring_v2.calibrate.day_summary) saved under --summaries, and, with
--discard-raw, the raw zip is deleted. A rerun reuses the summaries, so an interrupted run resumes. The output is a
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

SPREAD_UNIT = "taker_event"   # v2.1.0+: spread anchors and user spread units are taker events (ADR-0012)


def days(start: str, end: str, every: int) -> list[str]:
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    out, d = [], d0
    while d <= d1:
        out.append(d.isoformat())
        d += timedelta(days=every)
    return out


TIMING_FLOOR_STEPS = 1.0      # v2.2.0: the materiality floor of the timing score, in price steps (ADR-0013)


def calibrate_summaries(summaries_by_symbol: dict, min_profile_days: int = cal.MIN_PROFILE_DAYS,
                        timing: str = "volatility") -> tuple[dict, dict, dict]:
    """timing "volatility" = the v2.1.0 profile (quoted half-spread + 1-minute move); "event_cost" = v2.2.0: the median
    effective half-spread of taker events per hour, plus counts, the price step in bps and the floor (in `counts`)."""
    anchors, profiles, counts = {}, {}, {}
    for symbol, sums in sorted(summaries_by_symbol.items()):
        m = cal.merge_summaries(sums, min_profile_days)
        anchors[symbol] = {"spread": m["spread"], "slippage": m["slippage"], "tick": min(s["tick"] for s in sums)}
        counts[symbol] = {**m["counts"], "profileDays": m["profileDays"]}
        if timing == "event_cost":
            c = m["costProfile"]
            profiles[symbol] = c["medianBps"] if c else None
            if c:
                counts[symbol]["timing"] = {"events": c["events"], "eventDays": c["eventDays"], "stepBps": c["stepBps"],
                                            "floorBps": c["stepBps"] * TIMING_FLOOR_STEPS if c["stepBps"] else None}
        else:
            profiles[symbol] = m["profile"]
    return anchors, profiles, counts


def calibrate(windows_by_symbol: dict, step_ms: int = 60_000, hour_step_ms: int = 10_000,
              min_profile_days: int = cal.MIN_PROFILE_DAYS) -> tuple[dict, dict]:
    """In-memory calibration of loaded windows (tests, small runs). Same code path as the streaming run."""
    sums = {}
    for symbol, windows in windows_by_symbol.items():
        tick = min(t for t in (tick_from_prints(w.price) for w in windows) if t is not None)
        sums[symbol] = [cal.day_summary(w, tick, step_ms, hour_step_ms) for w in windows]
    anchors, profiles, _ = calibrate_summaries(sums, min_profile_days)
    return anchors, profiles


def summary_path(summaries: Path, symbol: str, day: str) -> Path:
    return summaries / f"f{cal.SUMMARY_FORMAT}" / symbol / f"{symbol}-{day}.npz"


class StaleSummaryError(RuntimeError):
    """A summary on disk was made by other code (or by code from before summaries carried a key)."""


def summarise_day(symbol: str, day: str, cache: Path, summaries: Path, discard_raw: bool, accept_unkeyed: bool = False) -> dict:
    sp = summary_path(summaries, symbol, day)
    if sp.exists():
        s = cal.load_summary(sp)
        if s.get("sha256"):
            key = s.get("codeKey", "")
            if key == cal.summary_code_key() or (key == "" and accept_unkeyed):
                return s
            raise StaleSummaryError(f"{sp}: made by other code ({'no key' if not key else key[:12]}); delete it to "
                                    "recompute from the raw file" + ("" if key else ", or pass --accept-unkeyed-summaries "
                                    "if the summarising code has not changed since it was made"))
    w = vision.load_day(symbol, day, cache)                 # verifies the published SHA-256 before caching
    tick = tick_from_prints(w.price)
    if tick is None:
        raise ValueError(f"{symbol} {day}: no price step found")
    s = cal.day_summary(w, tick)
    s["sha256"] = w.refs[0].sha256
    cal.save_summary(sp, s)
    if discard_raw:
        (Path(cache) / symbol / f"{symbol}-aggTrades-{day}.zip").unlink(missing_ok=True)
    return s


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--id", required=True)
    p.add_argument("--symbols", nargs="+", required=True)
    p.add_argument("--start", required=True)
    p.add_argument("--end", required=True)
    p.add_argument("--every", type=int, default=1)
    p.add_argument("--out", required=True)
    p.add_argument("--cache", default=str(ROOT / ".cache" / "market" / "zips"))
    p.add_argument("--summaries", default=str(ROOT / ".cache" / "market" / "summaries"))
    p.add_argument("--discard-raw", action="store_true", help="delete each raw zip once its day summary is saved")
    p.add_argument("--min-profile-days", type=int, default=cal.MIN_PROFILE_DAYS)
    p.add_argument("--timing", choices=("volatility", "event_cost"), default="event_cost",
                   help="hour profile: event_cost (v2.2.0, default) or volatility (v2.1.0, for reproducing it)")
    p.add_argument("--accept-unkeyed-summaries", action="store_true",
                   help="also merge summaries saved before they carried a code key (v2.1.0's own, made at this code)")
    a = p.parse_args(argv)
    chosen = days(a.start, a.end, a.every)
    sums, refs = {}, []
    for s in a.symbols:
        sums[s] = []
        for d in chosen:
            summ = summarise_day(s, d, Path(a.cache), Path(a.summaries), a.discard_raw, a.accept_unkeyed_summaries)
            print(f"{s} {d}: {summ['events']:,} taker events, sha256 {summ['sha256'][:12]}…", flush=True)
            sums[s].append(summ)
            refs.append({"file": f"{s}-aggTrades-{d}.zip", "sha256": summ["sha256"], "url": vision.day_url(s, d)})
    anchors, profiles, counts = calibrate_summaries(sums, a.min_profile_days, a.timing)
    window = {"start": a.start, "end": a.end, "days": chosen, "rule": f"every {a.every} days" if a.every != 1 else "every day"}
    extra = {"spreadUnit": SPREAD_UNIT, "minProfileDays": a.min_profile_days, "calibrationCounts": counts}
    if a.timing == "event_cost":
        extra.update({"timingUnit": "excess_event_cost", "timingReferenceHours": 3, "timingFloorSteps": TIMING_FLOOR_STEPS,
                      "timingFloorBps": {s: counts[s].get("timing", {}).get("floorBps") for s in counts}})
    v = build_version(a.id, anchors, profiles, window, refs, extra=extra)
    Path(a.out).write_text(dumps_version(v), encoding="utf-8")
    for s in sorted(anchors):
        print(s, "tick", anchors[s]["tick"], "days", counts[s]["days"])
        for comp in ("spread", "slippage"):
            for b, an in sorted(anchors[s][comp].items()):
                print(f"  {comp:8s} {b:9s} n={counts[s][comp].get(b, 0):>10,} {an if an is None else [round(x, 5) for x in an]}")
        print("  hours", None if profiles[s] is None else [round(x, 3) for x in profiles[s]], "min days/hour", min(counts[s]["profileDays"]))
    print(f"wrote {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

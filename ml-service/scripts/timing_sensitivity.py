"""Sensitivity of the v2.2.0 timing component and of the demo grades (ADR-0013, decision 7). Prints markdown only;
writes nothing and never touches a database (scoring runs on the in-memory database of build_demo_v2).

    cd ml-service && .venv/bin/python scripts/timing_sensitivity.py [--version v2.2.0] [--no-demos]

Output:
  1. per symbol: the price step in bps (the floor at 1 step), the cheapest and dearest hourly median cost, how many
     hours exceed the floor, and the between-day noise of an hourly median (the data the floor is checked against);
  2. the demo grades for the v2.1.0 rank rule and for a grid of reference hours (1, 3, 6) x floor (0, 0.5, 1, 2 steps).
The grid shows how much the grades depend on the two choices; it is not used to pick among them (ADR-0013, point 5).
"""
from __future__ import annotations

import argparse
import copy
import importlib.util
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scoring_v2 import calibrate as cal  # noqa: E402
from scoring_v2.components import timing_excess_bps  # noqa: E402
from scoring_v2.score import score_account_v2  # noqa: E402
from scoring_v2.version import load_version, version_file_sha256  # noqa: E402

REFS = (1, 3, 6)
FLOOR_STEPS = (0.0, 0.5, 1.0, 2.0)


def _build_module():
    spec = importlib.util.spec_from_file_location("build_demo_v2", ROOT / "scripts" / "build_demo_v2.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def profile_table(version: dict, summaries: Path) -> list[str]:
    rows = ["| Symbol | step (bps) | cheapest hour (bps) | dearest hour (bps) | hours above 1-step floor | between-day noise of an hourly median (bps) |",
            "|---|---|---|---|---|---|"]
    for sym, prof in sorted(version["hourProfiles"].items()):
        t = version["calibrationCounts"][sym]["timing"]
        step = t["stepBps"]
        above = sum(1 for h in range(24) if timing_excess_bps(h, prof, version.get("timingReferenceHours", 3)) > step)
        noise = day_noise(sym, summaries)
        rows.append(f"| {sym} | {step:.5f} | {min(prof):.5f} | {max(prof):.5f} | {above} of 24 | {noise:.5f} |")
    return rows


def day_noise(symbol: str, summaries: Path) -> float:
    """Median over the 24 hours of the standard deviation, across days, of that hour's median event cost."""
    per_hour: dict[int, list[float]] = {h: [] for h in range(24)}
    for f in sorted((summaries / f"f{cal.SUMMARY_FORMAT}" / symbol).glob("*.npz")):
        s = cal.load_summary(f)
        for h, v in s["hourEvent"].items():
            if len(v):
                per_hour[h].append(float(np.median(v)))
    return float(np.median([np.std(v, ddof=1) for v in per_hour.values() if len(v) > 1]))


def with_timing(version: dict, ref_hours: int, floor_steps: float) -> dict:
    v = copy.deepcopy(version)
    v["timingReferenceHours"] = ref_hours
    v["timingFloorSteps"] = floor_steps
    v["timingFloorBps"] = {s: version["calibrationCounts"][s]["timing"]["stepBps"] * floor_steps for s in version["hourProfiles"]}
    return v


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--version", default="v2.2.0")
    p.add_argument("--summaries", default=str(ROOT / ".cache" / "market" / "summaries"))
    p.add_argument("--cache", default=str(ROOT / ".cache" / "market" / "zips"))
    p.add_argument("--no-demos", action="store_true")
    a = p.parse_args(argv)
    version = load_version(a.version)
    sha = version_file_sha256(a.version)
    print(f"## Hour profiles of {a.version}\n")
    print("\n".join(profile_table(version, Path(a.summaries))))
    if a.no_demos:
        return 0

    b = _build_module()
    from demo_v2.build import build_demo
    from demo_v2.decisions import generate_decisions

    decisions = generate_decisions(ROOT.parent / "backend" / "src" / "data" / "market")
    tapes = b.DayTapes(Path(a.cache))
    v21 = load_version("v2.1.0")
    sha21 = version_file_sha256("v2.1.0")
    table: dict[str, dict] = {}
    for prof, demo in b.DEMOS.items():
        out = build_demo(demo, decisions[prof], tapes, fee_rates=b.FEES, ttl_ms=b.TTL_MS, horizon_ms=b.HORIZON_MS, fee_source=b.FEE_SOURCE)
        db, now, _ = b.measure_offline(demo, out, tapes)
        def grade(v, s):
            r = score_account_v2(db, demo, v, s, now, data_source="synthetic-demo")["result"]
            return r["composite"], r["grade"], r["components"]["timing"]["score"]
        table[demo] = {"v2.1.0 (rank)": grade(v21, sha21)}
        for ref in REFS:
            for fs in FLOOR_STEPS:
                table[demo][f"ref {ref}h, floor {fs:g} step"] = grade(with_timing(version, ref, fs), sha)
        print(f"measured {demo}", file=sys.stderr, flush=True)

    demos = list(table)
    print(f"\n## Demo grades: composite / grade / timing score\n")
    print("| Rule | " + " | ".join(demos) + " |")
    print("|---|" + "---|" * len(demos))
    for rule in table[demos[0]]:
        cells = []
        for d in demos:
            c, g, t = table[d][rule]
            cells.append(f"{c:.2f} {g} / timing {'n/a' if t is None else f'{t:.1f}'}")
        mark = "  **(chosen: ref 3h, floor 1 step)**" if rule == "ref 3h, floor 1 step" else ""
        print(f"| {rule}{mark} | " + " | ".join(cells) + " |")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

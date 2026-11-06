"""Offline eval runner (no network, no DB, no LLM). Exit 1 on any invariant violation.

Scores (a) the stored demo fixtures in demo_runs/ and (b) recorded live responses in
evals/recordings/*.json (CouncilResult dumps captured by evals/live_eval.py) against evals/golden/*.json.
Usage: python evals/run_offline.py   (from ml-service/)"""
from __future__ import annotations

import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from evals.invariants import NAMES, check_all  # noqa: E402

# Allowed overall ratings per golden case. Ratings are advisory bands around the locked grades
# (A/B/C), wide enough for model variance, tight enough that a wildly wrong verdict fails.
ALLOWED_OVERALL = {
    "demo-disciplined": ["EXCELLENT", "GOOD", "FAIR"],
    "demo-moderate": ["EXCELLENT", "GOOD", "FAIR", "POOR"],
    "demo-aggressive": ["GOOD", "FAIR", "POOR", "CRITICAL"],
    "edge-all-maker": ["EXCELLENT", "GOOD", "FAIR"],
    "edge-all-taker": ["GOOD", "FAIR", "POOR", "CRITICAL"],
}


INFORMATIONAL_PREFIX = "rec:single-"


def load_golden() -> dict[str, dict]:
    out = {}
    for p in sorted(glob.glob(os.path.join(HERE, "golden", "*.json"))):
        g = json.load(open(p))
        if g["id"] in ALLOWED_OVERALL:
            g["allowed_overall"] = ALLOWED_OVERALL[g["id"]]
        out[g["id"]] = g
    return out


def collect_runs(golden: dict[str, dict], recordings: bool = True) -> list[tuple[str, str, dict]]:
    """(label, golden id, council_result) for every stored fixture and recording."""
    runs = []
    for p in sorted(glob.glob(os.path.join(ROOT, "demo_runs", "*.json"))):
        d = json.load(open(p))
        if d.get("account_id") in golden:
            runs.append((f"fixture:{d['account_id']}", d["account_id"], d["council_result"]))
    for p in (sorted(glob.glob(os.path.join(HERE, "recordings", "*.json"))) if recordings else []):
        d = json.load(open(p))
        if d.get("golden_id") in golden:
            runs.append((f"rec:{os.path.basename(p)[:-5]}", d["golden_id"], d["council_result"]))
    return runs


def run_stats(res: dict) -> str:
    g = res.get("grounding") or {}
    c = res.get("claims") or {}
    return (f"faith={g.get('faithfulness_after')} viol1={g.get('violations_first_pass')} "
            f"redact={len(g.get('redactions') or [])} claims1={c.get('flagged_first_pass')} "
            f"calls={res.get('n_calls_ok')}/{res.get('n_calls_expected')}")


def main(recordings: bool = True) -> int:
    golden = load_golden()
    runs = collect_runs(golden, recordings)
    print(f"golden cases: {len(golden)} ({', '.join(golden)})")
    w = max([len(r[0]) for r in runs] + [10])
    print(f"{'run':<{w}}  " + "  ".join(n[:12].ljust(12) for n in NAMES))
    failures = informational = 0
    for label, gid, res in runs:
        outs = check_all(res, golden[gid])
        print(f"{label:<{w}}  " + "  ".join(("pass" if outs[n].ok else "FAIL").ljust(12) for n in NAMES)
              + "  " + run_stats(res))
        for n in NAMES:
            if not outs[n].ok:
                # single-call recordings are ablation data (never shown to users). Safety invariants gate them
                # like any run; only evidence_cited (a different, stricter ask of that arm) is reported, not gated
                if label.startswith(INFORMATIONAL_PREFIX) and n == "evidence_cited":
                    informational += 1
                    print(f"    {label} {n}: {outs[n].detail}  [informational: ablation arm]")
                else:
                    failures += 1
                    print(f"    {label} {n}: {outs[n].detail}")
    print(f"\n{len(runs)} runs x {len(NAMES)} invariants: {failures} violation(s)"
          f" (+{informational} informational on the single-call ablation arm)")
    return 1 if failures or not runs else 0


if __name__ == "__main__":
    sys.exit(main())

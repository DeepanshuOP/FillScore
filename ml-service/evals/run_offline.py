"""Offline eval runner (no network, no DB, no LLM). Exit 1 on any invariant violation.

Scores (a) the stored demo fixtures in demo_runs/ and (b) recorded live responses in
evals/recordings/*.json (CouncilResult dumps captured by evals/live_eval.py) against the versioned golden sets
evals/golden/<set>/ (see evals/golden_sets.py). Every set with recorded: true is run against the fixtures and
recordings stamped with that set's versions; a recorded set with no recordings, or a recording that matches no set,
is a violation. A set with recorded: false is reported only (determinism: python -m evals.dump_golden_packets --check).
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

from evals import golden_sets  # noqa: E402
from evals.invariants import NAMES, agent_evidence, check_all  # noqa: E402

COLUMNS = NAMES + ("agent_evidence",)
MEASURED = ("evidence_cited", "agent_evidence")   # scored for both arms the same way, reported not gated

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


def load_golden(set_name: str = "v1", root: str | None = None) -> dict[str, dict]:
    out = golden_sets.load_golden(set_name, root)
    for gid, g in out.items():
        if gid in ALLOWED_OVERALL:
            g["allowed_overall"] = ALLOWED_OVERALL[gid]
    return out


def collect_runs(golden: dict[str, dict], recordings: bool = True, set_name: str = "v1", root: str | None = None,
                 recordings_dir: str | None = None, demo_runs_dir: str | None = None) -> list[tuple[str, str, dict]]:
    """(label, golden id, council_result) for every stored fixture and recording stamped with set_name's versions."""
    manifest = golden_sets.read_manifest(set_name, root)
    runs = []
    for p in sorted(glob.glob(os.path.join(demo_runs_dir or os.path.join(ROOT, "demo_runs"), "*.json"))):
        d = json.load(open(p))
        if d.get("account_id") in golden and golden_sets.stamp_matches(d["council_result"], manifest):
            runs.append((f"fixture:{d['account_id']}", d["account_id"], d["council_result"]))
    for p in (sorted(glob.glob(os.path.join(recordings_dir or os.path.join(HERE, "recordings"), "*.json")))
              if recordings else []):
        d = json.load(open(p))
        if d.get("golden_id") in golden and golden_sets.stamp_matches(d["council_result"], manifest):
            runs.append((f"rec:{os.path.basename(p)[:-5]}", d["golden_id"], d["council_result"]))
    return runs


def orphan_fixtures(root: str | None = None, demo_runs_dir: str | None = None) -> list[str]:
    """demo_runs fixtures whose versions match no golden set (a fixture owned by an unrecorded set is allowed:
    that is where freshly re-recorded demos sit until the set is recorded)."""
    out = []
    for p in sorted(glob.glob(os.path.join(demo_runs_dir or os.path.join(ROOT, "demo_runs"), "*.json"))):
        if not golden_sets.owning_sets(json.load(open(p))["council_result"], root):
            out.append(os.path.basename(p))
    return out


def unrecorded_recordings(root: str | None = None, recordings_dir: str | None = None) -> list[str]:
    """Recordings owned only by sets with recorded != true: they would be checked by nothing."""
    rec = set(golden_sets.recorded_sets(root))
    out = []
    for p in sorted(glob.glob(os.path.join(recordings_dir or os.path.join(HERE, "recordings"), "*.json"))):
        owners = golden_sets.owning_sets(json.load(open(p))["council_result"], root)
        if owners and not rec.intersection(owners):
            out.append(os.path.basename(p))
    return out


def orphan_recordings(root: str | None = None, recordings_dir: str | None = None) -> list[str]:
    """Recordings whose versions match no golden set at all: they would fall outside every check."""
    out = []
    for p in sorted(glob.glob(os.path.join(recordings_dir or os.path.join(HERE, "recordings"), "*.json"))):
        if not golden_sets.owning_sets(json.load(open(p))["council_result"], root):
            out.append(os.path.basename(p))
    return out


def run_stats(res: dict) -> str:
    g = res.get("grounding") or {}
    c = res.get("claims") or {}
    return (f"faith={g.get('faithfulness_after')} viol1={g.get('violations_first_pass')} "
            f"redact={len(g.get('redactions') or [])} claims1={c.get('flagged_first_pass')} "
            f"calls={res.get('n_calls_ok')}/{res.get('n_calls_expected')}")


def main(recordings: bool = True, golden_root: str | None = None, recordings_dir: str | None = None,
         demo_runs_dir: str | None = None) -> int:
    failures = 0
    measured = {"evidence_cited": 0, "agent_evidence": 0}
    total_runs = 0
    sets = golden_sets.list_sets(golden_root)
    if not sets:
        print("no golden sets found")
        return 1
    for name in sets:
        manifest = golden_sets.read_manifest(name, golden_root)
        if manifest.get("recorded") is not True:
            print(f"[{name}] {name}: not recorded, determinism check only "
                  f"(python -m evals.dump_golden_packets --check {name})")
            continue
        golden = load_golden(name, golden_root)
        runs = collect_runs(golden, recordings, name, golden_root, recordings_dir, demo_runs_dir)
        print(f"[{name}] prompt {manifest.get('prompt_version')} metrics {manifest.get('metrics_version')}; "
              f"golden cases: {len(golden)} ({', '.join(golden)})")
        if recordings and not any(r[0].startswith("rec:") for r in runs):
            failures += 1
            print(f"    [{name}] recorded set has no recordings stamped with its versions: it would be silently skipped")
        total_runs += len(runs)
        w = max([len(r[0]) for r in runs] + [10])
        print(f"{'run':<{w}}  " + "  ".join(n[:12].ljust(12) for n in COLUMNS))
        for label, gid, res in runs:
            outs = check_all(res, golden[gid])
            if "liquidity" in res:   # Council-only extra column; a single call has no specialists
                outs["agent_evidence"] = agent_evidence(res, golden[gid])
            print(f"{label:<{w}}  " + "  ".join(("pass" if outs[n].ok else "FAIL").ljust(12) for n in COLUMNS if n in outs)
                  + "  " + run_stats(res))
            for n in COLUMNS:
                if n in outs and not outs[n].ok:
                    if n in MEASURED:   # same rule for both arms; a measured rate, not a gate (see ablation_notes.md)
                        measured[n] += 1
                        continue
                    failures += 1
                    print(f"    {label} {n}: {outs[n].detail}")
    if recordings:
        for f in orphan_recordings(golden_root, recordings_dir):
            failures += 1
            print(f"    {f}: recording matches no golden set (prompt/metrics versions)")
        for f in unrecorded_recordings(golden_root, recordings_dir):
            failures += 1
            print(f"    {f}: recording is stamped with an unrecorded set's versions and would never be checked "
                  f"(flip that manifest to recorded: true, or delete the recording)")
    for f in orphan_fixtures(golden_root, demo_runs_dir):
        failures += 1
        print(f"    demo_runs/{f}: fixture matches no golden set (prompt/metrics versions)")
    print(f"\n{total_runs} runs x {len(NAMES)} invariants: {failures} violation(s)"
          f" (measured, not gated, same rule for both arms: evidence_cited misses {measured['evidence_cited']},"
          f" agent_evidence misses {measured['agent_evidence']} on Council runs)")
    return 1 if failures or not total_runs else 0


if __name__ == "__main__":
    sys.exit(main())

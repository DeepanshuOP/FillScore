"""Breakdown of the ablation recordings by run number, for the report of 2026-11-19 (item 2(c)).

  python evals/ablation_breakdown.py        # prints the table; writes nothing

For each arm: evidence_cited (the synthesis-level rule, the same for both arms) and the claim rules 1.2.0 violation
rate (applied to every run, whatever version it carries), for runs 1-3 apart from runs 4-6, each over all runs and
without the Council runs whose specialists were partly served by gpt-oss-20b (`modelUsage.specialists_model` names
it). A pure function of evals/recordings and the golden sets: no clock, no randomness. Degraded runs are left out."""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

ARMS = ("council", "single")
GROUPS = ("runs 1-3", "runs 4-6")
VARIANTS = ("all", "without 20b specialist runs")


def _group(run: int) -> str:
    return "runs 1-3" if run <= 3 else "runs 4-6"


def breakdown(rows: list[dict]) -> dict:
    """{(arm, group, variant): {runs, evidence_cited, claim_violations}}. A row: arm, run, evidence_ok, claims_ok,
    specialist_20b."""
    out = {}
    for arm in ARMS:
        for group in GROUPS:
            for variant in VARIANTS:
                sel = [r for r in rows if r["arm"] == arm and _group(r["run"]) == group
                       and not (variant != "all" and r["specialist_20b"])]
                out[(arm, group, variant)] = {"runs": len(sel),
                                              "evidence_cited": sum(1 for r in sel if r["evidence_ok"]),
                                              "claim_violations": sum(1 for r in sel if not r["claims_ok"])}
    return out


def _ratio(a: int, b: int) -> str:
    return f"{a}/{b} ({100.0 * a / b:.1f}%)" if b else "n/a"


def render(table: dict) -> str:
    lines = ["| arm | runs | variant | runs counted | evidence_cited (runs that cite every required value) "
             "| flagged by claim rules 1.2.0 |", "|---|---|---|---|---|---|"]
    for (arm, group, variant), v in table.items():
        lines.append(f"| {arm} | {group} | {variant} | {v['runs']} | {_ratio(v['evidence_cited'], v['runs'])} "
                     f"| {_ratio(v['claim_violations'], v['runs'])} |")
    return "\n".join(lines)


def load_rows(directory: str | None = None) -> list[dict]:
    from evals import golden_sets
    from evals.ablation import load_recordings
    from evals.invariants import claim_rules_1_2_0, evidence_cited
    from evals.run_offline import load_golden

    sets = {name: (golden_sets.read_manifest(name), load_golden(name)) for name in golden_sets.recorded_sets()}
    rows = []
    for r in load_recordings(directory or os.path.join(HERE, "recordings")):
        if r["res"].get("degraded"):
            continue
        owner = next((n for n, (m, _) in sets.items() if golden_sets.stamp_matches(r["res"], m)), None)
        if owner is None:
            continue
        golden = sets[owner][1][r["user"]]
        spec = ((r["res"].get("modelUsage") or {}).get("specialists_model")) or ""
        rows.append({"arm": r["arm"], "run": r["run"], "user": r["user"], "set": owner,
                     "evidence_ok": evidence_cited(r["res"], golden).ok,
                     "claims_ok": claim_rules_1_2_0(r["res"], golden).ok,
                     "specialist_20b": "gpt-oss-20b" in spec})
    return rows


if __name__ == "__main__":
    rows = load_rows()
    print(render(breakdown(rows)))
    print("\nCouncil runs with a specialist served by gpt-oss-20b: "
          + ", ".join(f"{r['user']}-{r['run']}" for r in rows if r["specialist_20b"]))

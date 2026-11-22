"""Placeholder compliance: how much of the model's text reached the user as the model wrote it.

  python evals/placeholder_compliance.py     # prints the table (markdown) for every stored run

Inputs: evals/recordings/*.json and demo_runs/demo-*.json (offline, no network, no LLM, no clock).
Unit: one agent output (the run's `grounding.per_agent` records regeneration and code fallback per agent,
not per sentence). Buckets, exclusive, in this order:
  fallback     the agent's required text was emptied by redaction and replaced by code-built text
  regenerated  the first answer carried a numeral outside a placeholder and the answer was asked for again once
  written      neither: the model's text was used as the model wrote it (placeholders filled by code)
Two counts sit beside the buckets, per role and model: sentences removed because they held a numeral outside
a placeholder (`grounding.redactions`) and sentences removed by the claim rules (`claims.redactions` for
synthesis, `claims.specialist_redactions`, `claims.debate_redactions`). Degraded runs are left out.
Model = the router's record for that role in that run (`modelUsage`); a run served by a fallback model lists both.
"""
from __future__ import annotations

import glob
import json
import os
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SPECIALISTS = ("risk_auditor", "fee_optimizer", "alpha_architect", "liquidity_scout")
DEBATE = ("prosecution", "defense")
_MODEL_KEY = {"specialist": "specialists_model", "debate": "debate_model", "synthesis": "synthesis_model"}
_ROLE_ORDER = {"specialist": 0, "debate": 1, "synthesis": 2}


def role_of(agent: str) -> str:
    if agent in SPECIALISTS:
        return "specialist"
    if agent in DEBATE:
        return "debate"
    return "synthesis"


def classify(per_agent_record: dict) -> str:
    if per_agent_record.get("fallback_text"):
        return "fallback"
    if per_agent_record.get("regenerated"):
        return "regenerated"
    return "written"


def _row(arm: str, role: str, model: str) -> dict:
    return {"arm": arm, "role": role, "model": model, "runs": 0, "outputs": 0, "written": 0, "regenerated": 0,
            "fallback": 0, "numeral_redactions": 0, "claim_redactions": 0}


def aggregate(runs: list[dict]) -> list[dict]:
    """Rows keyed (arm, role, model). `runs` are recording dicts: {"arm"?, "council_result": {...}}."""
    rows: dict[tuple, dict] = {}
    seen: dict[tuple, set] = defaultdict(set)
    for i, run in enumerate(runs):
        result = run.get("council_result") or {}
        if result.get("degraded"):
            continue
        arm = run.get("arm") or "council"
        usage = result.get("modelUsage") or {}
        grounding = result.get("grounding") or {}
        claims = result.get("claims") or {}

        def row(role: str) -> dict:
            model = usage.get(_MODEL_KEY[role]) or "unrecorded"
            key = (arm, role, model)
            r = rows.setdefault(key, _row(arm, role, model))
            if i not in seen[key]:
                seen[key].add(i)
                r["runs"] += 1
            return r

        for agent, rec in (grounding.get("per_agent") or {}).items():
            r = row(role_of(agent))
            r["outputs"] += 1
            r[classify(rec)] += 1
        for red in grounding.get("redactions") or []:
            row(role_of(red.get("agent", "synthesis")))["numeral_redactions"] += 1
        if claims.get("redactions"):
            row("synthesis")["claim_redactions"] += len(claims["redactions"])
        if claims.get("specialist_redactions"):
            row("specialist")["claim_redactions"] += len(claims["specialist_redactions"])
        if claims.get("debate_redactions"):
            row("debate")["claim_redactions"] += len(claims["debate_redactions"])
    return sorted(rows.values(), key=lambda r: (r["arm"], _ROLE_ORDER[r["role"]], r["model"]))


def _share(n: int, total: int) -> str:
    return f"{n} ({100 * n / total:.1f}%)" if total else f"{n} (n/a)"


def render_table(rows: list[dict]) -> str:
    head = ("| Arm | Role | Model (as recorded) | Runs | Agent outputs | Written by the model | Regenerated | "
            "Code fallback | Numeral redactions | Claim-rule redactions |\n"
            "|---|---|---|---|---|---|---|---|---|---|")
    lines = [head]
    for r in rows:
        n = r["outputs"]
        lines.append(f"| {r['arm']} | {r['role']} | {r['model']} | {r['runs']} | {n} | {_share(r['written'], n)} | "
                     f"{_share(r['regenerated'], n)} | {_share(r['fallback'], n)} | {r['numeral_redactions']} | "
                     f"{r['claim_redactions']} |")
    return "\n".join(lines) + "\n"


def load_runs(root: str = ROOT) -> list[dict]:
    paths = sorted(glob.glob(os.path.join(root, "evals", "recordings", "*.json"))
                   + glob.glob(os.path.join(root, "demo_runs", "demo-*.json")))
    runs = []
    for p in paths:
        with open(p, encoding="utf-8") as f:
            runs.append(json.load(f))
    return runs


def main() -> int:
    runs = load_runs()
    rows = aggregate(runs)
    sys.stdout.write(f"{len(runs)} stored runs\n\n" + render_table(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Council (9 calls) vs single call: the ablation table, computed only from the recordings on disk.

  python evals/ablation.py            # rewrites evals/ablation_results.md
  python evals/ablation.py --check    # exit 1 if the file differs from what the recordings produce

Inputs: evals/recordings/{council,single}-<user>-<n>.json, evals/golden/*.json, evals/ablation_notes.md
(the hand-written paragraph and limitations, included verbatim). Output is a pure function of those files:
no clock, no randomness, sorted keys, fixed number formats, so it regenerates byte for byte.

Degraded runs (result["degraded"]) are counted in their own column and left out of every other column.
"""
from __future__ import annotations

import glob
import itertools
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from evals.invariants import NAMES, check_all  # noqa: E402
from evals.run_offline import load_golden  # noqa: E402

OUT = os.path.join(HERE, "ablation_results.md")
NOTES = os.path.join(HERE, "ablation_notes.md")
ARMS = ("council", "single")
ARM_LABEL = {"council": "Council (9 calls)", "single": "Single call"}
COMMON = tuple(n for n in NAMES if n != "evidence_cited")   # evidence_cited is checked differently per arm


def load_recordings(directory: str) -> list[dict]:
    runs = []
    for p in sorted(glob.glob(os.path.join(directory, "*.json"))):
        d = json.load(open(p))
        if d.get("arm") in ARMS and d.get("golden_id"):
            runs.append({"arm": d["arm"], "user": d["golden_id"], "run": d["run"], "res": d["council_result"],
                         "file": os.path.basename(p)})
    runs.sort(key=lambda r: (r["arm"], r["user"], r["run"]))
    return runs


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def agreement(ratings: list[str]) -> tuple[int, int]:
    """(agreeing pairs, pairs) over every pair of runs' overall ratings."""
    pairs = list(itertools.combinations(ratings, 2))
    return sum(1 for a, b in pairs if a == b), len(pairs)


def run_metrics(run: dict, golden: dict) -> dict:
    res = run["res"]
    g = res.get("grounding") or {}
    c = res.get("claims") or {}
    v = res.get("verification") or {}
    tok = res.get("tokenUsage") or {}
    outs = check_all(res, golden)
    return {
        "inv_all": sum(1 for n in NAMES if outs[n].ok), "inv_common": sum(1 for n in COMMON if outs[n].ok),
        "viol1": g.get("violations_first_pass") or 0,   # all agents' text (Council: 7 agents; single: 1 call)
        "viol1_syn": ((g.get("per_agent") or {}).get("synthesis") or {}).get("violations_first_pass") or 0,
        "redact": len(g.get("redactions") or []), "fallback": len(g.get("fallbacks") or []),
        "claims_syn": c.get("flagged_first_pass") or 0, "claims_deb": c.get("debate_flagged") or 0,
        "proposed": v.get("proposed") or 0, "passed": v.get("passed") or 0,
        "calls": len(res.get("llm_calls") or []), "tok_in": tok.get("prompt_tokens") or 0,
        "tok_out": tok.get("completion_tokens") or 0, "wall_s": (res.get("totalLatencyMs") or 0) / 1000.0,
        "rating": (res.get("synthesis") or {}).get("overallRating"),
    }


def summarise(runs: list[dict], golden: dict[str, dict]) -> dict:
    """{(arm, user|'ALL'): stats}"""
    rows: dict[tuple[str, str], dict] = {}
    by: dict[tuple[str, str], list[dict]] = {}
    for r in runs:
        by.setdefault((r["arm"], r["user"]), []).append(r)
    for arm in ARMS:
        users = sorted(u for a, u in by if a == arm)
        for u in users + ["ALL"]:
            sel = [r for r in runs if r["arm"] == arm and (u == "ALL" or r["user"] == u)]
            ok = [r for r in sel if not r["res"].get("degraded")]
            ms = [run_metrics(r, golden[r["user"]]) for r in ok]
            if u == "ALL":   # pooled pairs: agreement is only ever between runs of the same user
                agree = [agreement([m["rating"] for r, m in zip(ok, ms) if r["user"] == uu]) for uu in users]
                agree = (sum(a for a, _ in agree), sum(p for _, p in agree))
            else:
                agree = agreement([m["rating"] for m in ms])
            n = len(ms)
            rows[(arm, u)] = {
                "completed": n, "degraded": len(sel) - n,
                "inv_all": (sum(m["inv_all"] for m in ms), n * len(NAMES)),
                "inv_common": (sum(m["inv_common"] for m in ms), n * len(COMMON)),
                **{k: _mean([m[k] for m in ms]) for k in
                   ("viol1", "viol1_syn", "redact", "fallback", "claims_syn", "claims_deb", "calls", "tok_in", "tok_out", "wall_s")},
                "proposed": sum(m["proposed"] for m in ms), "passed": sum(m["passed"] for m in ms),
                "agree": agree,
            }
    return rows


def _ratio(a: int, b: int) -> str:
    return f"{a}/{b} ({100.0 * a / b:.1f}%)" if b else "n/a"


def render_table(rows: dict) -> str:
    head = ("| arm | user | runs ok / degraded | invariants (6) | invariants (5, common) | viol 1st pass /run (all agents) "
            "| viol 1st pass /run (synthesis only) | redactions /run | fallbacks /run | claims syn / debate /run | rating agreement "
            "| findings proposed / passed | LLM calls /run | tokens in / out /run | wall s /run |")
    lines = [head, "|" + "---|" * 15]
    for (arm, u), s in sorted(rows.items(), key=lambda kv: (ARMS.index(kv[0][0]), kv[0][1] == "ALL", kv[0][1])):
        a, p = s["agree"]
        lines.append(
            f"| {ARM_LABEL[arm]} | {u} | {s['completed']} / {s['degraded']} | {_ratio(*s['inv_all'])} "
            f"| {_ratio(*s['inv_common'])} | {s['viol1']:.2f} | {s['viol1_syn']:.2f} | {s['redact']:.2f} | {s['fallback']:.2f} "
            f"| {s['claims_syn']:.2f} / {s['claims_deb']:.2f} | {_ratio(a, p)} | {s['proposed']} / {s['passed']} "
            f"| {s['calls']:.1f} | {s['tok_in']:.0f} / {s['tok_out']:.0f} | {s['wall_s']:.1f} |")
    return "\n".join(lines)


def cost_ratio(rows: dict) -> str:
    c, s = rows.get(("council", "ALL")), rows.get(("single", "ALL"))
    if not c or not s or not c["completed"] or not s["completed"]:
        return "Cost ratio (Council / single): n/a (an arm has no completed runs)."

    def r(k):
        return f"{c[k] / s[k]:.1f}x" if s[k] else "n/a"
    return (f"Cost ratio (Council / single, means over completed runs): LLM calls {r('calls')}, "
            f"tokens in {r('tok_in')}, tokens out {r('tok_out')}, wall time {r('wall_s')}.")


def inventory(runs: list[dict]) -> str:
    lines = ["| file | arm | degraded | overall rating |", "|---|---|---|---|"]
    for r in runs:
        lines.append(f"| {r['file']} | {r['arm']} | {'yes' if r['res'].get('degraded') else 'no'} "
                     f"| {(r['res'].get('synthesis') or {}).get('overallRating')} |")
    return "\n".join(lines)


def render(runs: list[dict], golden: dict[str, dict], notes: str) -> str:
    rows = summarise(runs, golden)
    return "\n".join([
        "# Ablation: 9-call Council vs single call",
        "",
        "Generated by `python evals/ablation.py` from `evals/recordings/*.json` (do not edit by hand; the "
        "analysis section comes from `evals/ablation_notes.md`). Degraded runs are counted in their own column "
        "and excluded from every other column. Invariants are the K1 versions; `invariants (5, common)` leaves "
        "out `evidence_cited`, which asks different things of the two arms (per-agent keys vs the union in the "
        "synthesis text). Rating agreement is the share of run pairs, within a user, with the same overall rating.",
        "",
        render_table(rows),
        "",
        cost_ratio(rows),
        "",
        "## Run inventory",
        "",
        inventory(runs),
        "",
        notes.rstrip("\n"),
        "",
    ])


def generate(directory: str | None = None, notes_path: str | None = None) -> str:
    notes = open(notes_path or NOTES).read() if os.path.exists(notes_path or NOTES) else ""
    return render(load_recordings(directory or os.path.join(HERE, "recordings")), load_golden(), notes)


if __name__ == "__main__":
    text = generate()
    if "--check" in sys.argv:
        sys.exit(0 if os.path.exists(OUT) and open(OUT).read() == text else 1)
    with open(OUT, "w") as f:
        f.write(text)
    print(f"wrote {OUT}")

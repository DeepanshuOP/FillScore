"""Ablation breakdown (orders of 2026-11-19, item 2(c)): evidence_cited and the claim-rules 1.2.0 violation rate per arm
for runs 4-6 apart from runs 1-3, each with and without the Council runs that had a specialist served by gpt-oss-20b.
Hand values: the rows below."""
from evals import ablation_breakdown as bd


def row(arm, run, ev, claims_ok, small=False, user="u"):
    return {"arm": arm, "run": run, "user": user, "evidence_ok": ev, "claims_ok": claims_ok, "specialist_20b": small}


ROWS = [
    # Council runs 1-3: evidence 1 of 3, claim violations 1 of 3
    row("council", 1, True, True), row("council", 2, False, True), row("council", 3, False, False),
    # Council runs 4-6: evidence 2 of 3 (run 4 is the gpt-oss-20b specialist run; it cites and it violates), violations 2 of 3
    row("council", 4, True, False, small=True), row("council", 5, True, True), row("council", 6, False, False),
    # Single runs 4-6: evidence 0 of 3, violations 0 of 3
    row("single", 4, False, True), row("single", 5, False, True), row("single", 6, False, True),
]


def test_groups_count_by_hand():
    t = bd.breakdown(ROWS)
    assert t[("council", "runs 1-3", "all")] == {"runs": 3, "evidence_cited": 1, "claim_violations": 1}
    assert t[("council", "runs 4-6", "all")] == {"runs": 3, "evidence_cited": 2, "claim_violations": 2}
    assert t[("single", "runs 4-6", "all")] == {"runs": 3, "evidence_cited": 0, "claim_violations": 0}


def test_without_the_gpt_oss_20b_specialist_runs():
    t = bd.breakdown(ROWS)
    # runs 4-6 Council minus run 4: 2 runs, evidence 1 (run 5), violations 1 (run 6)
    assert t[("council", "runs 4-6", "without 20b specialist runs")] == {"runs": 2, "evidence_cited": 1, "claim_violations": 1}
    # runs with no 20b specialist are unchanged by the exclusion; the single arm has no specialists
    assert t[("council", "runs 1-3", "without 20b specialist runs")] == t[("council", "runs 1-3", "all")]
    assert t[("single", "runs 4-6", "without 20b specialist runs")] == t[("single", "runs 4-6", "all")]


def test_the_committed_notes_hold_the_current_breakdown_table():
    """ablation_notes_v3.md quotes the table; it must equal what the recordings produce now."""
    import os
    table = bd.render(bd.breakdown(bd.load_rows()))
    notes = open(os.path.join(os.path.dirname(bd.__file__), "ablation_notes_v3.md")).read()
    assert table in notes, "ablation_notes_v3.md is stale: paste the output of python evals/ablation_breakdown.py"


def test_render_has_a_line_per_group_and_states_the_rates():
    text = bd.render(bd.breakdown(ROWS))
    assert "| council | runs 4-6 | all | 3 | 2/3 (66.7%) | 2/3 (66.7%) |" in text
    assert "| council | runs 4-6 | without 20b specialist runs | 2 | 1/2 (50.0%) | 1/2 (50.0%) |" in text
    assert "| single | runs 4-6 | all | 3 | 0/3 (0.0%) | 0/3 (0.0%) |" in text

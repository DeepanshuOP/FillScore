"""Placeholder-compliance table, on two hand-made council runs and one single-call run.

Unit: one agent output (recorded per agent in grounding.per_agent). Buckets, exclusive, in this order:
fallback (fallback_text true), regenerated (regenerated true), written (otherwise).

Hand arithmetic (specialists = risk, fee, alpha, liquidity; debate = prosecution, defense):
Run A: risk written, fee regenerated, alpha regenerated+fallback -> fallback, liquidity written,
       prosecution written, defense regenerated, synthesis fallback.
Run B: all seven written.
Run S (single arm): synthesis written only.

council / specialist / qwen : 8 outputs = A(4) + B(4); written 2+4 = 6, regenerated 1 (fee), fallback 1 (alpha)
                              -> 75.0 %, 12.5 %, 12.5 %. Numeral redactions: A has 1 on liquidity_scout -> 1.
                              Claim-rule redactions: A has 2 specialist_redactions -> 2.
council / debate / oss20    : 4 outputs; written 1 (A pros) + 2 (B) = 3, regenerated 1 (A defense), fallback 0
                              -> 75.0 %, 25.0 %, 0.0 %. Numeral redactions 0. Claim-rule redactions 3 (A debate_redactions).
council / synthesis / qwen  : 2 outputs; written 1 (B), fallback 1 (A) -> 50.0 %, 0.0 %, 50.0 %.
                              Numeral redactions: A has 2 on synthesis -> 2. Claim-rule redactions 1 (A claims.redactions).
single / synthesis / qwen   : 1 output, written -> 100.0 %, 0.0 %, 0.0 %.
"""
from evals.placeholder_compliance import aggregate, classify, render_table, role_of

MODELS = {"specialists_model": "groq/qwen", "debate_model": "groq/oss20", "synthesis_model": "groq/qwen"}


def agent(regen=False, fallback=False, viol=0):
    return {"regenerated": regen, "fallback_text": fallback, "violations_first_pass": viol,
            "faithfulness_after": 1.0, "values_cited": 1}


def run_a():
    return {"arm": "council", "council_result": {
        "modelUsage": MODELS,
        "grounding": {
            "per_agent": {
                "risk_auditor": agent(), "fee_optimizer": agent(True, False, 2),
                "alpha_architect": agent(True, True, 3), "liquidity_scout": agent(),
                "prosecution": agent(), "defense": agent(True, False, 1), "synthesis": agent(False, True, 0)},
            "redactions": [{"agent": "synthesis", "field": "headline"}, {"agent": "synthesis", "field": "narrative"},
                           {"agent": "liquidity_scout", "field": "slippageRoot"}]},
        "claims": {"redactions": [{"field": "narrative"}],
                   "specialist_redactions": [{"field": "alpha.flags.2"}, {"field": "fee.flags.0"}],
                   "debate_redactions": [{"field": "key_dispute"}, {"field": "debate.claims.0"},
                                         {"field": "prosecution_summary"}]}}}


def run_b():
    names = ["risk_auditor", "fee_optimizer", "alpha_architect", "liquidity_scout", "prosecution", "defense", "synthesis"]
    return {"arm": "council", "council_result": {
        "modelUsage": MODELS,
        "grounding": {"per_agent": {n: agent() for n in names}, "redactions": []},
        "claims": {"redactions": [], "specialist_redactions": [], "debate_redactions": []}}}


def run_s():
    return {"arm": "single", "council_result": {
        "modelUsage": {"specialists_model": "none", "debate_model": "none", "synthesis_model": "groq/qwen"},
        "grounding": {"per_agent": {"synthesis": agent()}, "redactions": []},
        "claims": {"redactions": [], "flagged_first_pass": 0, "regenerated": False}}}


def test_role_of_maps_agents_to_router_roles():
    assert role_of("risk_auditor") == "specialist"
    assert role_of("liquidity_scout") == "specialist"
    assert role_of("prosecution") == "debate"
    assert role_of("defense") == "debate"
    assert role_of("synthesis") == "synthesis"


def test_classify_precedence_fallback_then_regenerated_then_written():
    assert classify(agent()) == "written"
    assert classify(agent(True)) == "regenerated"
    assert classify(agent(True, True)) == "fallback"
    assert classify(agent(False, True)) == "fallback"


def test_aggregate_counts_by_arm_role_and_model():
    rows = {(r["arm"], r["role"], r["model"]): r for r in aggregate([run_a(), run_b(), run_s()])}
    spec = rows[("council", "specialist", "groq/qwen")]
    assert (spec["outputs"], spec["written"], spec["regenerated"], spec["fallback"]) == (8, 6, 1, 1)
    assert (spec["numeral_redactions"], spec["claim_redactions"]) == (1, 2)
    deb = rows[("council", "debate", "groq/oss20")]
    assert (deb["outputs"], deb["written"], deb["regenerated"], deb["fallback"]) == (4, 3, 1, 0)
    assert (deb["numeral_redactions"], deb["claim_redactions"]) == (0, 3)
    syn = rows[("council", "synthesis", "groq/qwen")]
    assert (syn["outputs"], syn["written"], syn["regenerated"], syn["fallback"]) == (2, 1, 0, 1)
    assert (syn["numeral_redactions"], syn["claim_redactions"]) == (2, 1)
    one = rows[("single", "synthesis", "groq/qwen")]
    assert (one["outputs"], one["written"], one["regenerated"], one["fallback"]) == (1, 1, 0, 0)
    assert len(rows) == 4
    assert spec["runs"] == 2 and one["runs"] == 1


def test_render_table_prints_counts_and_shares():
    md = render_table(aggregate([run_a(), run_b(), run_s()]))
    assert "| council | specialist | groq/qwen | 2 | 8 | 6 (75.0%) | 1 (12.5%) | 1 (12.5%) | 1 | 2 |" in md
    assert "| council | debate | groq/oss20 | 2 | 4 | 3 (75.0%) | 1 (25.0%) | 0 (0.0%) | 0 | 3 |" in md
    assert "| council | synthesis | groq/qwen | 2 | 2 | 1 (50.0%) | 0 (0.0%) | 1 (50.0%) | 2 | 1 |" in md
    assert "| single | synthesis | groq/qwen | 1 | 1 | 1 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 | 0 |" in md


def test_degraded_runs_are_left_out():
    bad = run_b()
    bad["council_result"]["degraded"] = True
    rows = aggregate([run_a(), bad])
    spec = [r for r in rows if r["role"] == "specialist"][0]
    assert spec["outputs"] == 4 and spec["runs"] == 1

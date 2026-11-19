"""The claim check covers the specialists' own text, not only the synthesis and the debate.

Found 2026-11-17: a re-recorded demo-aggressive run kept "The trader paid $21.10 in fees because 159 of 230 executions
were taker orders" in fee.recommendedAction, because enforce_claims scrubbed synthesis text only. The same run held
"market-structure" with a non-breaking hyphen (U+2011) in the debate key dispute: the strict list names the ASCII
spelling. Both are fixed under claim rules 1.1.0; 1.0.0 behaves as before."""
import asyncio

import pytest

from agents.claims import flag_sentences
from agents.council import run_council_pipeline
from tests.council_fakes import ALPHA, FEE, LIQUIDITY, RISK, make_packets, make_router


def _run(**answers):
    router, _ = make_router(answers)
    fee, risk, liq, alpha = make_packets()
    return asyncio.run(run_council_pipeline("u", "u", "BTCUSDT", fee, risk, liq, alpha, llm=router, persist=False,
                                            trades=[])).model_dump(mode="json")


def test_a_causal_specialist_sentence_is_replaced_by_a_code_built_one_and_recorded():
    out = _run(fee_optimizer=dict(FEE, recommendedAction="Fees were high because most fills were taker orders."))
    assert out["degraded"] is False
    text = out["fee"]["recommendedAction"]
    assert "because" not in text.lower() and text.startswith("Fee verdict: OPTIMAL")
    reds = out["claims"]["specialist_redactions"]
    # rules 1.2.0 also name "Fees were high" (no number in its sentence) as an unbacked judgement
    assert [(r["field"], r["terms"]) for r in reds] == [("fee.recommendedAction", ["because", "unbacked: high"])]
    assert {"agent": "fee_optimizer", "field": "recommendedAction", "fallback_text": True} in out["grounding"]["fallbacks"]


def test_a_clean_run_has_no_specialist_redactions_and_unchanged_text():
    out = _run()
    assert out["claims"]["specialist_redactions"] == []
    assert out["fee"]["recommendedAction"] == FEE["recommendedAction"]
    assert out["liquidity"]["slippageRoot"] == LIQUIDITY["slippageRoot"]
    assert out["alpha"]["bestAlternative"] == ALPHA["bestAlternative"]


def test_a_causal_risk_flag_is_dropped_and_the_others_stay():
    out = _run(risk_auditor=dict(RISK, flags=["Concentration was high due to the top symbol.", "Adverse rate was low."]))
    assert out["risk"]["flags"] == ["Adverse rate was low."]
    assert [r["field"] for r in out["claims"]["specialist_redactions"]] == ["risk.flags.0"]


@pytest.mark.parametrize("agent,base", [("liquidity_scout", LIQUIDITY), ("alpha_architect", ALPHA), ("fee_optimizer", FEE)])
def test_the_flags_of_every_specialist_are_checked_not_only_the_risk_auditor(agent, base):
    """Review finding 1 (2026-11-17): liquidity, alpha and fee flags are model sentences shown on the cards too."""
    key = {"liquidity_scout": "liquidity", "alpha_architect": "alpha", "fee_optimizer": "fee"}[agent]
    out = _run(**{agent: dict(base, flags=["Costs were high due to the top symbol.", "The adverse rate was low."])})
    assert out[key]["flags"] == ["The adverse rate was low."]
    assert [r["field"] for r in out["claims"]["specialist_redactions"]] == [f"{key}.flags.0"]


def test_a_degraded_run_still_gets_the_specialist_check():
    """Review finding 2: a run with a failed call is returned and shown, so the surviving specialists' text is checked too."""
    out = _run(risk_auditor=RuntimeError("model down"),
               fee_optimizer=dict(FEE, recommendedAction="Fees were high because most fills were taker orders."))
    assert out["degraded"] is True
    assert "because" not in out["fee"]["recommendedAction"].lower()
    assert any(r["field"] == "fee.recommendedAction" for r in out["claims"]["specialist_redactions"])


def test_a_non_breaking_hyphen_does_not_hide_a_named_term():
    s = "The costs were within acceptable market‑structure costs."      # U+2011
    assert [f.terms for f in flag_sentences(s, set(), "debate.key_dispute", strict=True)] == [["market-structure"]]
    assert flag_sentences(s, set(), "debate.key_dispute", strict=True, rules="1.0.0") == []   # 1.0.0 is unchanged
    s2 = "The costs were within acceptable market–structure costs."      # en dash
    assert [f.terms for f in flag_sentences(s2, set(), "debate.key_dispute", strict=True)] == [["market-structure"]]


@pytest.mark.parametrize("agent,base", [("liquidity_scout", LIQUIDITY), ("alpha_architect", ALPHA), ("fee_optimizer", FEE)])
def test_a_snake_case_tag_with_a_counterfactual_word_is_dropped_by_rules_1_3_0(agent, base):
    """Item 27 (2026-11-20): the card shows `unfilled_opportunity_cost_assessed` as "Unfilled Opportunity Cost Assessed";
    "opportunity" is a counterfactual word. The tag form never matched the sentence rules (the underscores)."""
    key = {"liquidity_scout": "liquidity", "alpha_architect": "alpha", "fee_optimizer": "fee"}[agent]
    out = _run(**{agent: dict(base, flags=["unfilled_opportunity_cost_assessed", "no_vwap_benchmark_available"])})
    assert out[key]["flags"] == ["no_vwap_benchmark_available"]
    assert [r["field"] for r in out["claims"]["specialist_redactions"]] == [f"{key}.flags.0"]
    assert out["claims"]["specialist_redactions"][0]["terms"] == ["opportunity"]


def test_a_multi_word_term_in_a_tag_is_found_in_the_displayed_form():
    """"needs_to_widen_limits" is shown as "Needs To Widen Limits"; the raw tag has underscores where the term "needs to"
    has a space, so only the displayed form matches (rules 1.3.0)."""
    out = _run(fee_optimizer=dict(FEE, flags=["needs_to_widen_limits", "low_fee_drag"]))
    assert out["fee"]["flags"] == ["low_fee_drag"]
    assert out["claims"]["specialist_redactions"][0]["terms"] == ["needs to"]

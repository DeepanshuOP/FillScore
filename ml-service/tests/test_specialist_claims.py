"""The claim check covers the specialists' own text, not only the synthesis and the debate.

Found 2026-11-17: a re-recorded demo-aggressive run kept "The trader paid $21.10 in fees because 159 of 230 executions
were taker orders" in fee.recommendedAction, because enforce_claims scrubbed synthesis text only. The same run held
"market-structure" with a non-breaking hyphen (U+2011) in the debate key dispute: the strict list names the ASCII
spelling. Both are fixed under claim rules 1.1.0; 1.0.0 behaves as before."""
import asyncio

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
    assert [(r["field"], r["terms"]) for r in reds] == [("fee.recommendedAction", ["because"])]
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


def test_a_non_breaking_hyphen_does_not_hide_a_named_term():
    s = "The costs were within acceptable market‑structure costs."      # U+2011
    assert [f.terms for f in flag_sentences(s, set(), "debate.key_dispute", strict=True)] == [["market-structure"]]
    assert flag_sentences(s, set(), "debate.key_dispute", strict=True, rules="1.0.0") == []   # 1.0.0 is unchanged
    s2 = "The costs were within acceptable market–structure costs."      # en dash
    assert [f.terms for f in flag_sentences(s2, set(), "debate.key_dispute", strict=True)] == [["market-structure"]]

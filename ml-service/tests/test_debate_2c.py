"""Phase 2c A2 (count keys), A3 (debate fallback) and A4 (claim check on debate text).

make_packets(): FeeMetricsPacket trade_count=10, maker_count=taker_count=0 (defaults), total fee 328.0;
RiskMetricsPacket defaults: top_hour_utc=-1 -> hour_trade_counts.get("-1")... see test_risk_keys.
Rendered strings are hand-computed with agents.render: counts render as plain integers ("10", "0").
"""
import re

from agents.claims import ClaimsLedger, enforce_debate, flag_sentences
from agents.grounding import extract_numerals
from agents.render import packet_ctx
from tests.council_fakes import DEFENSE, PROSECUTION, make_packets
from tests.test_council_grounded import JUNK, _run

# The exact demo-disciplined strings from the 2c brief.
PROS_AVOIDABLE = "The data indicates that execution costs were avoidable."
DEF_STRUCT = "The fee drag reflects market-structure costs rather than execution errors."
KEY_DISPUTE = ("The trader faced exogenous whale adversity, as shown by 13 adverse trades, "
               "which is unavoidable under Cont-Kukanov-Stoikov theory.")


# ── A2 ──
def test_debate_ctx_has_every_count_key_with_deterministic_values():
    fee, risk, liq, alpha = make_packets()
    ctx = packet_ctx(fee, risk, liq, alpha)
    fee.maker_count, fee.taker_count = 3, 7
    risk.hour_trade_counts = {"08": 4, "14": 2}
    risk.top_hour_utc = 8
    ctx = packet_ctx(fee, risk, liq, alpha)
    assert ctx["fee"]["taker_count"] == 7 and ctx["fee"]["maker_count"] == 3
    assert ctx["fee"]["trade_count"] == 10
    assert ctx["risk"]["top_hour_trade_count"] == 4 and ctx["risk"]["whale_adverse_count"] == 0
    assert "market_order_count" in ctx["liquidity"] and "adverse_market_count" in ctx["liquidity"]
    assert "market_order_count" in ctx["alpha"]
    from agents.render import catalog
    cat = catalog(ctx, ["fee", "risk"])
    assert "{{fee.taker_count}} = 7" in cat and "{{risk.top_hour_trade_count}} = 4" in cat


def test_debate_prompts_carry_the_count_example_and_the_no_value_next_to_placeholder_rule():
    from agents import debate
    import inspect
    src = inspect.getsource(debate)
    assert src.count("never \"68 market orders\"") == 2
    assert src.count("Never write a value next to its placeholder") == 2


# ── A3 ──
def test_all_defense_sentences_redacted_gives_a_fallback_and_the_run_completes():
    # the 2a aggressive pattern: every defense sentence carries a stray numeral
    defense = {"claims": [{"claim_id": "D1a", "claim_text": JUNK, "evidence_keys": [], "rebuts": None}],
               "defense_summary": JUNK}
    result, *_ = _run({"defense": defense})
    assert result.degraded is False
    assert result.n_calls_ok == result.n_calls_expected == 9
    fb = result.grounding["fallbacks"]
    assert {"agent": "defense", "field": "claims", "fallback_text": True} in fb
    assert {"agent": "defense", "field": "defense_summary", "fallback_text": True} in fb
    d = result.debate_transcript
    assert d["turns_ok"] == 4 and d["failed_turns"] == []
    texts = [c["claim_text"] for c in d["claims"] if c["side"] == "defense"] + [d["defense_summary"]]
    # fee.maker_count 0 of fee.trade_count 10, rendered by code
    assert texts[0] == "Maker orders were 0 of 10 trades."
    assert result.synthesis.overallRating is not None


def test_fallback_text_has_no_raw_numerals_before_rendering():
    from agents.debate import _FALLBACKS
    for side, items in _FALLBACKS.items():
        for tpl, _keys in items:
            assert extract_numerals(re.sub(r"\{\{[^}]*\}\}", "", tpl)) == []


# ── A4 ──
def test_prosecution_avoidable_sentence_is_flagged():
    f = flag_sentences(PROS_AVOIDABLE, set(), "p", strict=True)
    assert f and "avoidable" in f[0].terms


def test_key_dispute_whale_and_theory_sentence_is_flagged_even_with_whale_evidence():
    f = flag_sentences(KEY_DISPUTE, set(), "k", strict=True, whale_ok=True)
    assert f and {"exogenous", "unavoidable", "cont-kukanov-stoikov"} <= set(f[0].terms)
    assert "whale" in f[0].terms         # 2c.2 C0: no whale placeholder in the sentence, so flagged too
    g = flag_sentences("The trader faced whale adversity.", set(), "k", strict=True, whale_ok=False)
    assert g and g[0].terms == ["whale"]


def test_defense_market_structure_sentence_is_flagged():
    # a causal claim with no verified basis
    f = flag_sentences(DEF_STRUCT, set(), "d", strict=True)
    assert f and {"market-structure", "execution errors"} <= set(f[0].terms)


def test_advice_always_flagged_even_with_a_passed_action():
    s = "Fees were high and the trader should use maker orders."
    assert flag_sentences(s, {"maker_instead_of_taker"}, "x", strict=True)


def test_a_passed_action_still_allows_a_counterfactual_word_but_not_a_cause():
    s = "Taker fees were avoidable."
    assert not flag_sentences(s, {"maker_instead_of_taker"}, "x", strict=True)
    assert flag_sentences("Taker fees were exogenous.", {"maker_instead_of_taker"}, "x", strict=True)


def test_enforce_debate_redacts_by_sentence_then_falls_back_and_counts():
    fee, risk, liq, alpha = make_packets()
    ctx = packet_ctx(fee, risk, liq, alpha)   # trade_count 10, maker_count 0, taker_count 0
    debate = {
        "prosecution_summary": PROS_AVOIDABLE,
        "defense_summary": DEF_STRUCT + " Maker orders were few.",
        "key_dispute": KEY_DISPUTE,
        "claims": [{"side": "prosecution", "claim_id": "P1a", "claim_text": PROS_AVOIDABLE,
                    "evidence_keys": [], "rebuts": None},
                   {"side": "defense", "claim_id": "D1a", "claim_text": "Slippage was small.",
                    "evidence_keys": [], "rebuts": None}],
    }
    cl = ClaimsLedger()
    out, _ = enforce_debate(debate, set(), ctx, cl)
    assert out["prosecution_summary"] == "Taker orders were 0 of 10 trades."   # emptied -> fallback
    assert out["defense_summary"] == "Maker orders were few."                  # clean sentence kept
    assert out["key_dispute"].startswith("The two sides disagreed")
    assert [c["claim_text"] for c in out["claims"]] == ["Slippage was small.", "Taker orders were 0 of 10 trades."]
    # flagged sentences: prosecution summary 1, defense summary 1 (the market-structure sentence),
    # prosecution claim 1, key dispute 1 = 4; the clean defense claim and clean summary sentence are kept
    assert cl.debate_flagged == 4


def test_pipeline_reports_debate_flags_in_claims_and_no_flagged_term_survives():
    pros = dict(PROSECUTION, prosecution_summary=PROS_AVOIDABLE)
    defense = dict(DEFENSE, defense_summary=DEF_STRUCT)
    result, *_ = _run({"prosecution": pros, "defense": defense})
    d = result.debate_transcript
    assert result.claims["debate_flagged"] >= 2
    shown = " ".join([d["prosecution_summary"], d["defense_summary"], d["key_dispute"]]
                     + [c["claim_text"] for c in d["claims"]]).lower()
    for bad in ("avoidable", "market-structure", "execution errors", "exogenous"):
        assert bad not in shown
    assert result.degraded is False


# ── A6 backend: the deterministic count behind "values cited" and the scope trade count ──
def test_per_agent_values_cited_and_scope_trade_count():
    result, *_ = _run()
    pa = result.grounding["per_agent"]
    assert set(pa) >= {"liquidity_scout", "fee_optimizer", "prosecution", "defense"}
    assert all(isinstance(v["values_cited"], int) for v in pa.values())
    assert result.tradeContext.trade_count == 10          # make_packets(): FeeMetricsPacket trade_count=10


def test_mechanism_terms_stay_flagged_even_with_whale_evidence():
    for t in ("Whales were front-running the fills.", "The book was spoofed by manipulation."):
        assert flag_sentences(t, set(), "x", strict=True, whale_ok=True)
    # 2c.2 C0: the word "whale" needs a whale placeholder in the same sentence (see tests below)
    assert flag_sentences("Whales were present in 13 trades.", set(), "x", strict=True, whale_ok=True)


# ── 2c.2 C0: "whale" only beside a whale placeholder, and only when the count is above 0 ──
def test_c0_whale_without_placeholder_is_flagged():
    s = "13 adverse trades reflect whale activity."
    f = flag_sentences(s, set(), "x", strict=True, whale_ok=True)
    assert f and f[0].terms == ["whale"]


def test_c0_whale_with_placeholder_and_count_above_zero_is_allowed():
    s = "{{risk.whale_adverse_count}} trades coincided with whale flow."
    assert not flag_sentences(s, set(), "x", strict=True, whale_ok=True)
    assert not flag_sentences("{{whale.adverse_total}} trades met whale flow.", set(), "x", strict=True, whale_ok=True)


def test_c0_whale_with_placeholder_but_count_zero_is_flagged():
    s = "{{risk.whale_adverse_count}} trades coincided with whale flow."
    f = flag_sentences(s, set(), "x", strict=True, whale_ok=False)
    assert f and f[0].terms == ["whale"]


def test_c0_mechanism_word_still_flagged_beside_the_placeholder():
    s = "{{risk.whale_adverse_count}} trades coincided with whale manipulation."
    f = flag_sentences(s, set(), "x", strict=True, whale_ok=True)
    assert f and "manipulation" in f[0].terms and "whale" not in f[0].terms


def test_c0_rendered_count_counts_as_the_whale_citation():
    # enforce_debate sees RENDERED text: "{{risk.whale_adverse_count}}" is already "13"
    ok = "13 trades coincided with whale flow."
    assert not flag_sentences(ok, set(), "x", strict=True, whale_ok=True, whale_token="13")
    assert flag_sentences("113 trades coincided with whale flow.", set(), "x", strict=True, whale_ok=True, whale_token="13")
    assert flag_sentences("13 adverse trades reflect whale activity, 7 other.".replace("13", "9"), set(), "x",
                          strict=True, whale_ok=True, whale_token="13")
    assert flag_sentences(ok, set(), "x", strict=True, whale_ok=False, whale_token=None)


def test_c0_enforce_debate_keeps_rendered_whale_count_sentence_only_when_count_positive():
    fee, risk, liq, alpha = make_packets()
    ctx = packet_ctx(fee, risk, liq, alpha)
    ctx["risk"]["whale_adverse_count"] = 13
    d = {"prosecution_summary": "13 trades coincided with whale flow.", "defense_summary": "Slippage was small.",
         "key_dispute": "", "claims": [{"side": "prosecution", "claim_id": "P1a", "claim_text": "Slippage was small.",
                                         "evidence_keys": [], "rebuts": None},
                                        {"side": "defense", "claim_id": "D1a", "claim_text": "Slippage was small.",
                                         "evidence_keys": [], "rebuts": None}]}
    out, _ = enforce_debate(d, set(), ctx, ClaimsLedger())
    assert out["prosecution_summary"] == "13 trades coincided with whale flow."
    ctx["risk"]["whale_adverse_count"] = 0
    out, _ = enforce_debate(d, set(), ctx, ClaimsLedger())
    assert "whale" not in out["prosecution_summary"]

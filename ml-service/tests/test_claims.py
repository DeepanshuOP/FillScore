"""2a.2 claim check: pure sentence rules (hand-computed) and the council pipeline wiring."""
from __future__ import annotations

from agents.claims import ClaimFlag, ClaimsLedger, check_synthesis, flag_sentences, redact_claims

S0 = "The execution record showed a median VWAP deviation of -12.4 bps and a maker ratio of 66.0%."
S1 = ("While most fills beat the arrival price, the fee drag measured 10.0 bps indicated avoidable "
      "taker costs.")
S = S0 + " " + S1
MAKER = {"maker_instead_of_taker"}


# 2c: the debate-text keys are checked in test_debate_2c.py; these tests are about synthesis text.
def _core(c):
    return {k: v for k, v in c.items() if not k.startswith('debate_')}


def test_unpassed_counterfactual_sentence_is_flagged_and_redacted():
    # sentence 1: term "avoidable"; cues "fee drag"/"fee"/"taker" -> maker_instead_of_taker, not passed
    assert flag_sentences(S, set(), "narrative") == [
        ClaimFlag("narrative", 1, ["avoidable"], ["maker_instead_of_taker"])]
    text, flags = redact_claims(S, set(), "narrative")
    assert text == S0 and len(flags) == 1


def test_passed_action_area_allows_the_counterfactual_word():
    assert flag_sentences(S, MAKER, "narrative") == []
    assert redact_claims(S, MAKER, "narrative") == (S, [])


def test_neutral_past_tense_sentences_pass():
    a = ("All executions were completed as passive maker orders, keeping slippage at 0.0 bps and securing a "
         "maker ratio of 100.0%. Performance dipped during certain periods, with fill scores reaching their "
         "lowest point at 03:00 UTC.")
    b = "Trader achieved strong VWAP performance but incurred notable fee drag from taker activity"
    assert flag_sentences(a, set(), "narrative") == [] and flag_sentences(b, set(), "narrative") == []


def test_advice_is_always_flagged():
    f = flag_sentences("Fees were high; the trader should use limit orders.", MAKER, "narrative")
    assert f == [ClaimFlag("narrative", 0, ["should"], ["maker_instead_of_taker"])]


def test_counterfactual_without_an_action_cue_is_flagged():
    f = flag_sentences("This was a missed opportunity.", set(), "headline")
    assert f == [ClaimFlag("headline", 0, ["missed", "opportunity"], [])]


def test_mixed_refs_need_every_area_passed():
    f = flag_sentences("Taker fills during the 07:00 UTC hour were avoidable.", MAKER, "narrative")
    assert f == [ClaimFlag("narrative", 0, ["avoidable"], ["exclude_hours", "maker_instead_of_taker"])]


def test_word_bounds():
    assert flag_sentences("The trader reconsidered nothing; fees were shouldered evenly.", set(), "narrative") == []


def test_check_synthesis_names_observation_fields():
    f = check_synthesis("", "", ["Fills could have been cheaper."], set())
    assert f == [ClaimFlag("observations.0", 0, ["could have"], [])]


def test_ledger_to_dict_has_no_text():
    cl = ClaimsLedger(1, True, [ClaimFlag("narrative", 1, ["avoidable"], ["maker_instead_of_taker"])])
    assert cl.to_dict() == {"flagged_first_pass": 1, "regenerated": True, "redactions": [
        {"field": "narrative", "sentence_index": 1, "terms": ["avoidable"],
         "action_types": ["maker_instead_of_taker"]}]}


# ── pipeline wiring ──────────────────────────────────────────────────────────
# make_packets() renders: alpha.avg_vwap_deviation_bps 0.0 -> "0.0 bps", fee.maker_ratio 0.0 -> "0.0%",
# fee.fee_drag_bps 0.0 -> "0.0 bps". The fake judge writes S with placeholders instead of numbers, so the
# rendered sentence 0 is "... deviation of 0.0 bps and a maker ratio of 0.0%." and sentence 1 holds "avoidable".
from tests.council_fakes import HTTPError   # noqa: E402
from tests.test_council_grounded import _rec, _run   # noqa: E402

T_S0 = "The execution record showed a median VWAP deviation of {{alpha.avg_vwap_deviation_bps}} and a maker ratio of {{fee.maker_ratio}}."
T_S1 = ("While most fills beat the arrival price, the fee drag measured {{fee.fee_drag_bps}} indicated "
        "avoidable taker costs.")
R_S0 = "The execution record showed a median VWAP deviation of 0.0 bps and a maker ratio of 0.0%."
NEUTRAL = "The record showed a maker ratio of {{fee.maker_ratio}}."
RECS = [_rec("maker_instead_of_taker", {"target_ratio": 0.8}, "Taker fills cost {{cf.effect_usd}} more."),
        _rec("general", {}, "Costs were uneven.")]


def claims_answers(regen, headline="Costs clustered in a few hours"):
    """synthesis call 1 = the judge, 2 = the forced re-reason (maker rejected: no trades), 3+ = regeneration."""
    def answer(kw, n):
        if n == 1:
            return {"headline": headline, "narrative": T_S0 + " " + T_S1, "recommendations": RECS,
                    "conflictLedger": [], "overallRating": "FAIR"}
        if n == 2:
            return {"recommendations": []}
        return regen(kw) if callable(regen) else regen
    return {"synthesis": answer}


def _regen_ok(narrative, headline="Costs clustered in a few hours"):
    return {"headline": headline, "narrative": narrative}


def test_a_rejected_area_with_avoidable_wording_is_regenerated_neutrally():
    result, events, doc, provider = _run(claims_answers(_regen_ok(NEUTRAL)), trades=None)
    assert result.synthesis.narrative == "The record showed a maker ratio of 0.0%."
    assert _core(result.claims) == {"flagged_first_pass": 1, "regenerated": True, "redactions": []}
    assert result.degraded is False and result.n_calls_ok == result.n_calls_expected == 9
    assert provider.count["synthesis"] == 3
    assert [e for n, e in events if n == "gate_done"][0]["claims"] == result.claims
    regen_user = [c["messages"][1]["content"] for c in provider.calls if c["agent"] == "synthesis"][2]
    assert "VERIFICATION RESULT" in regen_user and "not_computable:no_trades" in regen_user


def test_a_regeneration_that_repeats_the_claim_is_redacted_by_sentence():
    result, *_ = _run(claims_answers(_regen_ok(T_S0 + " " + T_S1)), trades=None)
    assert result.synthesis.narrative == R_S0
    assert _core(result.claims) == {"flagged_first_pass": 1, "regenerated": True, "redactions": [
        {"field": "narrative", "sentence_index": 1, "terms": ["avoidable"],
         "action_types": ["maker_instead_of_taker"]}]}
    assert result.degraded is False


def test_a_failed_regeneration_keeps_the_draft_and_redacts_it():
    result, *_ = _run(claims_answers(lambda kw: HTTPError(404)), trades=None)
    assert result.synthesis.narrative == R_S0
    assert result.claims["regenerated"] is True and len(result.claims["redactions"]) == 1
    assert result.degraded is False and result.n_calls_ok == result.n_calls_expected == 9


def test_an_emptied_headline_gets_the_fallback_sentence():
    result, *_ = _run(claims_answers(_regen_ok(NEUTRAL, headline="Avoidable taker costs"),
                                     headline="Avoidable taker costs"), trades=None)
    assert result.synthesis.headline == f"Overall verdict: {result.synthesis.overallRating}."
    assert {"agent": "synthesis", "field": "headline", "fallback_text": True} in result.grounding["fallbacks"]
    assert result.claims["redactions"][0]["field"] == "headline"


def test_a_neutral_synthesis_is_untouched_and_not_regenerated():
    result, _, _, provider = _run(trades=None)
    assert _core(result.claims) == {"flagged_first_pass": 0, "regenerated": False, "redactions": []}
    assert provider.count["synthesis"] == 1


def test_a_degraded_run_has_an_empty_claims_ledger():
    result, *_ = _run({"liquidity_scout": HTTPError(404)})
    assert _core(result.claims) == {"flagged_first_pass": 0, "regenerated": False, "redactions": []}


# ── M1: vocabulary gaps ──────────────────────────────────────────────────────
import json  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402


@pytest.mark.parametrize("text,terms,acts", [
    ("The trader could save money by using limit orders.", ["could save"], []),   # "limit orders" is no cue
    ("Maker fills would cut the fee drag.", ["would cut"], ["maker_instead_of_taker"]),
    ("Trades might have cost less with limit orders.", ["might have"], []),
    ("The trader ought to avoid the 03:00 UTC hour.", ["ought"], ["exclude_hours"]),
    ("Switch to maker orders to lower fees.", ["switch to"], ["maker_instead_of_taker"]),
    ("Fees were unnecessary and wasted.", ["unnecessary", "wasted"], ["maker_instead_of_taker"]),
])
def test_vocabulary_gaps_are_flagged(text, terms, acts):
    assert flag_sentences(text, set(), "narrative") == [ClaimFlag("narrative", 0, terms, acts)]


def test_passed_area_allows_unnecessary_and_wasted_but_not_advice():
    assert flag_sentences("Fees were unnecessary and wasted.", MAKER, "narrative") == []
    assert len(flag_sentences("The trader must place limit orders; fees need to fall.", MAKER, "narrative")) == 1


def test_neutral_words_near_the_new_vocabulary_pass():
    for t in ("Fills needed no adjustment.", "Most fills were limit orders."):
        assert flag_sentences(t, set(), "narrative") == []


@pytest.mark.parametrize("name", ["demo-disciplined", "demo-moderate"])
def test_accepted_demo_runs_have_no_claim_flags(name):
    syn = json.loads((Path(__file__).resolve().parents[1] / "demo_runs" / f"{name}.json").read_text()
                     )["council_result"]["synthesis"]
    passed = {f["action_type"] for f in syn["findings"]}
    flags = check_synthesis(syn["headline"], syn["narrative"], [o["text"] for o in syn["observations"]], passed)
    for i, f in enumerate(syn["findings"]):
        flags += flag_sentences(f["text"], passed, f"findings.{i}")
    for j, e in enumerate(syn["conflictLedger"]):
        for k in ("between", "rule_applied", "winner"):
            flags += flag_sentences(e[k], passed, f"conflictLedger.{j}.{k}")
    assert flags == [], flags


# ── M2: passed findings and the conflict ledger are claim-checked ────────────
from tests.test_counterfactual import OKX  # noqa: E402


def _okx_answers(finding_text, ledger=()):
    # exclude_hours [8] on the OKX fixture passes with effect 3.10 (see test_council_grounded header)
    def answer(kw, n):
        return {"headline": "Costs clustered in a few hours", "narrative": "Fees and slippage were uneven.",
                "recommendations": [_rec("exclude_hours", {"hours": [8]}, finding_text)],
                "conflictLedger": list(ledger), "overallRating": "FAIR"}
    return {"synthesis": answer}


def test_advice_in_a_passed_finding_is_removed_by_sentence():
    # sentence 1 "You should place limit orders." has the advice term "should"; "limit orders", "place" are
    # not action cues, so refs is empty and action_types == [] (advice is flagged regardless of refs).
    text = "Trades in that hour cost {{cf.effect_usd}} more than the rest. You should place limit orders."
    result, *_ = _run(_okx_answers(text), trades=OKX)
    assert [f.text for f in result.synthesis.findings] == ["Trades in that hour cost $3.10 more than the rest."]
    assert _core(result.claims) == {"flagged_first_pass": 1, "regenerated": False, "redactions": [
        {"field": "findings.0", "sentence_index": 1, "terms": ["should"], "action_types": []}]}


def test_a_finding_that_is_only_advice_falls_back_to_its_method():
    result, *_ = _run(_okx_answers("You should exclude that hour."), trades=OKX)
    f = result.synthesis.findings[0]
    assert f.method and f.text == f.method
    assert result.claims["redactions"][0]["terms"] == ["should"]


def test_a_conflict_entry_with_advice_is_dropped():
    bad = {"between": "fee_optimizer vs risk_auditor", "rule_applied": "Fee should win in stable regimes",
           "winner": "fee_optimizer"}
    good = {"between": "fee_optimizer vs liquidity_scout", "rule_applied": "STABLE regime: Fee first",
            "winner": "fee_optimizer"}
    result, *_ = _run(_okx_answers("Trades in that hour cost {{cf.effect_usd}} more.", [bad, good]), trades=OKX)
    assert [e.between for e in result.synthesis.conflictLedger] == ["fee_optimizer vs liquidity_scout"]
    assert result.claims["flagged_first_pass"] == 1
    assert result.claims["redactions"][0]["field"] == "conflictLedger.0.rule_applied"

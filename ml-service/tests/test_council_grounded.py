"""Phase 1c integration: placeholders (1c.2), blocking grounding (1c.3) and the counterfactual verifier
with one forced re-reason (1c.4) inside the one Council pipeline.

The real router runs over fake providers (tests/council_fakes.py); persistence runs on mongomock-motor.
Rendered strings are hand-computed from make_packets() with agents.render's rules:
  fee.total_fee_paid_usd = 328.0 -> "$328.00" (USD, 2 dp)   fee.trade_count = 10 -> "10" (count)
  fee.maker_ratio = 0.0 -> "0.0%" (percent, 1 dp)            liquidity.avg_slippage_bps = 0.0 -> "0.0 bps"
Counterfactual effects come from the OKX fixture in tests/test_counterfactual.py:
  exclude_hours [8]     -> 5.50 - 3000 x 8 / 1e4 (2.40) = 3.10  (2 trades)
  exclude_hours [8, 14] -> 9.30 - 7500 x 6 / 1e4 (4.50) = 4.80  (4 trades)
  maker 0.8             -> 3500 x 0.0002 = 0.70; maker 0.5 -> 1500 x 0.0002 = 0.30
  fees paid 1.00 + 2.00 + 0.50 + 3.20 + 3.00 = 9.70 -> materiality max($1, 0.5% x 9.70) = $1.00
"""
from __future__ import annotations

import asyncio
import json
from unittest.mock import MagicMock, patch

from mongomock_motor import AsyncMongoMockClient

from tests.council_fakes import ALPHA, DEFENSE, FEE, HTTPError, LIQUIDITY, PROSECUTION, RISK, make_packets, make_router
from tests.test_counterfactual import OKX

# One sentence carrying every kind of stray number plus an unknown placeholder:
# 8,421 / $93.41 / thirteen / 61.5% / 4.2x / seventeen = 6 numerals, {{fee.made_up}} = 1 unknown -> 7 violations.
JUNK = ("It cost 8,421 dollars and $93.41 in fees across thirteen fills, about 61.5% or 4.2x more "
        "than seventeen peers {{fee.made_up}}.")
TOKENS = ["8,421", "93.41", "61.5%", "4.2x", "thirteen", "seventeen", "made_up", "99999", "{{"]   # "}}" is ordinary JSON (nested objects)


def dirty(clean: str) -> str:
    return clean + " " + JUNK


def _run(answers=None, trades=None, persist=True):
    from agents.council import run_council_pipeline

    router, provider = make_router(answers)
    db = AsyncMongoMockClient()["fillscore"]
    events: list = []

    async def sink(name, data):
        events.append((name, json.loads(json.dumps(data))))

    with patch("agents.persistence._get_db", return_value=(MagicMock(), db)), \
            patch("agents.persistence.uuid.uuid4", return_value="run-grounded"), \
            patch("agents.council._clock", lambda: 0.0), patch("agents.llm_router._clock", lambda: 0.0), \
            patch("agents.debate._clock", lambda: 0.0):
        result = asyncio.run(run_council_pipeline("acct-g", "acct-g", "BTCUSDT", *make_packets(), llm=router,
                                                  on_event=sink, persist=persist, trades=trades))
        doc = asyncio.run(db["council_runs"].find_one({}))
    return result, events, doc, provider


def _event(events, name):
    return next(d for n, d in events if n == name)


# ── the final guarantee: no stray LLM numeral reaches any output ─────────────

DIRTY_ANSWERS = {
    "liquidity_scout": dict(LIQUIDITY, slippageRoot=dirty("Spreads were normal."), flags=[JUNK]),
    "alpha_architect": dict(ALPHA, bestAlternative=dirty("Fills tracked VWAP."), flags=[JUNK]),
    "risk_auditor": dict(RISK, flags=[JUNK]),
    "fee_optimizer": dict(FEE, recommendedAction=dirty("Most fills were maker orders."), flags=[JUNK]),
    "prosecution": {"claims": [{"claim_id": "P1a", "claim_text": dirty("Takers dominated."),
                                "evidence_keys": ["maker_ratio"], "rebuts": None}],
                    "prosecution_summary": dirty("Fees were avoidable.")},
    "defense": {"claims": [{"claim_id": "D1a", "claim_text": dirty("Slippage was small."),
                            "evidence_keys": ["avg_slippage_bps"], "rebuts": "P1a"}],
                "defense_summary": dirty("Costs reflected the market.")},
    "synthesis": {"headline": dirty("Execution was mixed."), "narrative": dirty("Fees drove the cost."),
                  "recommendations": [{"action_type": "general", "params": {},
                                       "rationale_text": dirty("The maker share was low.")}],
                  "conflictLedger": [{"between": dirty("fee_optimizer vs risk_auditor."),
                                      "rule_applied": dirty("STABLE: Fee first."), "winner": dirty("fee_optimizer.")}],
                  "overallRating": "POOR", "estimatedMonthlyCostUSD": 99999},
}


def test_stray_numerals_never_reach_the_stream_the_body_or_the_database():
    # every answer (first and regeneration) is dirty in every text field
    result, events, doc, provider = _run(DIRTY_ANSWERS)

    complete = events[-1][1]
    body = result.model_dump(mode="json")
    assert complete == body
    for text in (json.dumps(complete), json.dumps(body), json.dumps(doc, default=str),
                 json.dumps([d for _, d in events])):
        for tok in TOKENS:
            assert tok not in text, tok

    # 9 base calls + exactly one regeneration per output (4 specialists, 4 debate turns, 1 synthesis) = 18
    assert len(provider.calls) == 18
    assert provider.count == {"liquidity_scout": 2, "alpha_architect": 2, "risk_auditor": 2, "fee_optimizer": 2,
                              "prosecution": 4, "defense": 4, "synthesis": 2}
    assert (result.degraded, result.n_calls_ok, result.n_calls_expected) == (False, 9, 9)

    g = result.grounding
    assert g["regenerations"] == 9
    # one redacted sentence per field: specialists 2+2+1+2 = 7, debate 4 turns x (claim + summary) = 8,
    # synthesis headline + narrative + rationale + 3 ledger fields = 6 -> 21
    assert len(g["redactions"]) == 21
    assert {r["agent"] for r in g["redactions"]} == {"liquidity_scout", "alpha_architect", "risk_auditor",
                                                     "fee_optimizer", "prosecution", "defense", "synthesis"}
    assert all(r["n_tokens"] == 7 for r in g["redactions"])
    assert g["violations_first_pass"] == 147            # 21 fields x 7
    assert doc["grounding"] == g

    # the clean sentences survive, rendered
    assert result.liquidity.slippageRoot == "Spreads were normal."
    assert result.risk.flags == [] and result.liquidity.flags == []
    assert result.synthesis.headline == "Execution was mixed."
    assert [o.model_dump() for o in result.synthesis.observations] == [
        {"action_type": "general", "text": "The maker share was low."}]
    assert result.synthesis.findings == []
    assert result.synthesis.conflictLedger[0].between == "fee_optimizer vs risk_auditor."
    assert result.synthesis.estimatedMonthlyCostUSD == 328.0
    claims = result.debate_transcript["claims"]
    assert [c["claim_text"] for c in claims] == ["Takers dominated.", "Slippage was small."] * 2


def test_placeholders_render_packet_values_without_regeneration():
    answers = {
        "liquidity_scout": dict(LIQUIDITY, slippageRoot="Average slippage was {{liquidity.avg_slippage_bps}}."),
        "fee_optimizer": dict(FEE, recommendedAction="Fees totalled {{fee.total_fee_paid_usd}} over "
                                                     "{{fee.trade_count}} trades."),
        "prosecution": {"claims": [{"claim_id": "P1a", "claim_text": "Maker share was {{fee.maker_ratio}}.",
                                    "evidence_keys": ["maker_ratio"], "rebuts": None}],
                        "prosecution_summary": "Fees were {{fee.total_fee_paid_usd}} USD."},
        "synthesis": {"headline": "Fees came to {{fee.total_fee_paid_usd}}", "narrative": "Fills were mostly takers.",
                      "recommendations": [{"action_type": "general", "params": {},
                                           "rationale_text": "The maker share was {{fee.maker_ratio}} of fills."}],
                      "conflictLedger": [], "overallRating": "POOR"},
    }
    result, events, doc, provider = _run(answers)

    assert len(provider.calls) == 9
    assert result.liquidity.slippageRoot == "Average slippage was 0.0 bps."
    assert result.fee.recommendedAction == "Fees totalled $328.00 over 10 trades."
    d = result.debate_transcript
    assert d["claims"][0]["claim_text"] == "Maker share was 0.0%."
    assert d["prosecution_summary"] == "Fees were $328.00."          # " USD" absorbed by the renderer
    # key_dispute quotes the rendered first claims whole (no truncation)
    assert "Maker share was 0.0%." in d["key_dispute"] and "slippage was small" in d["key_dispute"]
    assert result.synthesis.headline == "Fees came to $328.00"
    assert result.synthesis.observations[0].text == "The maker share was 0.0% of fills."
    # the defense saw the rendered prosecution claim
    defense_user = next(c["messages"][1]["content"] for c in provider.calls if c["agent"] == "defense")
    assert "Maker share was 0.0%." in defense_user

    g = result.grounding
    # rendered placeholders: liquidity 1 + fee 2 + prosecution 2 turns x 2 + synthesis 2 = 9, no violations
    assert g["regenerations"] == 0 and g["redactions"] == [] and g["violations_first_pass"] == 0
    assert g["numbers_checked"] == 9
    assert g["faithfulness_first_pass"] == 1.0 and g["faithfulness_after"] == 1.0

    synth = _event(events, "synthesis_done")
    assert set(synth) == {"headline", "overallRating", "findings", "observations", "estimatedMonthlyCostUSD",
                          "degraded", "degraded_reasons"}
    assert synth["headline"] == "Fees came to $328.00" and synth["overallRating"] == "POOR"
    gate = _event(events, "gate_done")
    assert set(gate) == {"verification", "grounding", "claims"} and gate["grounding"] == g
    assert "grounding_report" not in result.model_dump() and "gate_report" not in result.model_dump()


# ── 1c.4 the verifier and the forced re-reason ───────────────────────────────

def _rec(action, params, text):
    return {"action_type": action, "params": params, "rationale_text": text}


def _synthesis(first_recs, second):
    def answer(kw, n):
        if n == 1:
            return {"headline": "Costs clustered in a few hours", "narrative": "Fees and slippage were uneven.",
                    "recommendations": first_recs, "conflictLedger": [], "overallRating": "FAIR"}
        return second
    return {"synthesis": answer}


FIRST = [
    _rec("exclude_hours", {"hours": [8]}, "Trades in that hour cost {{cf.effect_usd}} more than the rest."),
    _rec("maker_instead_of_taker", {"target_ratio": 0.8}, "Taker fills cost {{cf.effect_usd}} more."),
]


def test_rejected_recommendation_is_re_reasoned_and_the_replacement_verified():
    # 1c.10 F6 (orchestrator-approved fixture change): exclude_hours [8,14] as the replacement would now
    # overlap the round-1 exclude_hours [8] finding, so round 1 is [maker 0.8 (immaterial: 0.70 <= 1.00),
    # a general observation] and the re-reason proposes exclude_hours [8] (3.10 > 1.00 -> passes).
    first = [_rec("maker_instead_of_taker", {"target_ratio": 0.8}, "Taker fills cost {{cf.effect_usd}} more."),
             _rec("general", {}, "Costs were uneven.")]
    second = {"recommendations": [_rec("exclude_hours", {"hours": [8]},
                                       "Trades in that hour cost {{cf.effect_usd}} more than the rest.")]}
    result, events, doc, provider = _run(_synthesis(first, second), trades=OKX)

    assert provider.count["synthesis"] == 2          # synthesis + one forced re-reason
    assert (result.degraded, result.n_calls_ok, result.n_calls_expected) == (False, 9, 9)
    re_user = [c["messages"][1]["content"] for c in provider.calls if c["agent"] == "synthesis"][1]
    assert "immaterial" in re_user and "maker_instead_of_taker" in re_user
    assert "Propose replacements or return an empty list; the effect is recomputed by code." in re_user

    f = [x.model_dump() for x in result.synthesis.findings]
    assert [round(x["effect_usd"], 6) for x in f] == [3.10]
    assert "$3.10" in f[0]["text"] and f[0]["n_trades_affected"] == 2
    assert f[0]["verified"] is True and f[0]["method"]
    assert f[0]["params"] == {"hours": [8]} and f[0]["action_type"] == "exclude_hours"
    assert [o.text for o in result.synthesis.observations] == ["Costs were uneven."]
    assert result.verification == {
        "proposed": 2, "passed": 1, "observations": 1,
        "rejected": [{"action": "maker_instead_of_taker", "params": {"target_ratio": 0.8}, "reason": "immaterial"}],
        "re_reasoned": 1, "dropped": [],
    }
    assert doc["verification"] == result.verification
    assert _event(events, "gate_done")["verification"] == result.verification


def test_an_overlapping_second_finding_is_rejected_as_a_duplicate():
    # exclude_hours [8] (2 trades, 3.10) then [8,14] (4 trades incl. those 2): the later one is a duplicate
    first = [FIRST[0], _rec("exclude_hours", {"hours": [8, 14]}, "Those fills cost {{cf.effect_usd}} more.")]
    result, events, doc, provider = _run(_synthesis(first, {"recommendations": []}), trades=OKX)

    assert [round(x.effect_usd, 6) for x in result.synthesis.findings] == [3.10]
    assert result.verification == {
        "proposed": 2, "passed": 1, "observations": 0,
        "rejected": [{"action": "exclude_hours", "params": {"hours": [8, 14]}, "reason": "duplicate"}],
        "re_reasoned": 0, "dropped": [],
    }
    assert result.degraded is False


def test_a_second_rejection_is_dropped_and_logged():
    second = {"recommendations": [_rec("maker_instead_of_taker", {"target_ratio": 0.5}, "Takers cost more.")]}
    result, *_ = _run(_synthesis(FIRST, second), trades=OKX)

    assert [round(x.effect_usd, 6) for x in result.synthesis.findings] == [3.10]
    v = result.verification
    assert v["passed"] == 1 and v["re_reasoned"] == 1
    assert v["dropped"] == [{"action": "maker_instead_of_taker", "params": {"target_ratio": 0.5},
                             "reason": "immaterial"}]
    assert result.degraded is False


def test_a_failed_re_reason_drops_the_rejected_items_without_degrading():
    result, *_ = _run(_synthesis(FIRST, HTTPError(404)), trades=OKX)

    assert result.degraded is False and result.n_calls_ok == 9
    assert [round(x.effect_usd, 6) for x in result.synthesis.findings] == [3.10]
    assert result.verification == {
        "proposed": 2, "passed": 1, "observations": 0,
        "rejected": [{"action": "maker_instead_of_taker", "params": {"target_ratio": 0.8}, "reason": "immaterial"}],
        "re_reasoned": 0, "dropped": [], "re_reason_failed": True,
    }


def test_without_trades_every_effect_is_rejected_as_not_computable():
    first = [FIRST[0], _rec("general", {}, "Costs were uneven.")]
    result, *_ = _run(_synthesis(first, {"recommendations": []}), trades=None)

    assert result.synthesis.findings == []
    assert [o.text for o in result.synthesis.observations] == ["Costs were uneven."]
    assert result.verification["rejected"] == [
        {"action": "exclude_hours", "params": {"hours": [8]}, "reason": "not_computable:no_trades"}]


def test_a_cf_placeholder_outside_a_rationale_is_redacted():
    answers = _synthesis([_rec("general", {}, "Costs were uneven. The effect was {{cf.effect_usd}}.")], None)
    result, *_ = _run(answers)
    # in an observation there is no effect: the cf sentence is removed at the final render
    assert [o.text for o in result.synthesis.observations] == ["Costs were uneven."]
    assert any(r["agent"] == "synthesis" for r in result.grounding["redactions"])


# ── 1c.3 failure modes: emptied required fields degrade the run ──────────────

def test_a_degraded_run_has_no_faithfulness_and_no_findings():
    result, events, doc, _ = _run({"liquidity_scout": HTTPError(404)})
    assert result.degraded is True
    assert result.grounding["faithfulness_after"] is None
    assert doc["grounding"]["faithfulness_after"] is None
    assert result.synthesis.findings == [] and result.synthesis.observations == []
    assert result.verification == {"proposed": 0, "passed": 0, "observations": 0, "rejected": [],
                                   "re_reasoned": 0, "dropped": []}


def test_a_specialist_explanation_removed_by_the_number_check_gets_the_fallback_sentence():
    # 1d.4: was "fails that agent / degrades the run"; now the run continues with code-built text
    result, _, _, provider = _run({"liquidity_scout": dict(LIQUIDITY, slippageRoot=JUNK)})
    assert result.degraded is False and result.synthesis.overallRating is not None
    assert result.liquidity.slippageRoot == "Liquidity verdict: GOOD; average slippage 0.0 bps."
    assert "agent_failed" not in result.liquidity.flags
    assert provider.count["liquidity_scout"] == 2                     # base + one regeneration
    assert result.n_calls_ok == result.n_calls_expected
    assert result.grounding["fallbacks"] == [
        {"agent": "liquidity_scout", "field": "slippageRoot", "fallback_text": True}]
    assert result.grounding["per_agent"]["liquidity_scout"]["fallback_text"] is True


def test_a_debate_turn_emptied_by_the_number_check_stops_the_debate():
    pros = dict(PROSECUTION, prosecution_summary=JUNK)
    result, _, _, provider = _run({"prosecution": pros})
    d = result.debate_transcript
    assert d["turns_ok"] == 0 and d["failed_turns"] == ["prosecution round 1"]
    assert result.degraded is True and result.n_calls_ok == 4
    assert provider.count["prosecution"] == 2 and "synthesis" not in provider.count


def test_claims_emptied_by_the_number_check_are_dropped():
    pros = {"claims": [{"claim_id": "P1a", "claim_text": "Takers dominated.", "evidence_keys": [], "rebuts": None},
                       {"claim_id": "P1b", "claim_text": JUNK, "evidence_keys": [], "rebuts": None}],
            "prosecution_summary": "Fees were avoidable."}
    result, *_ = _run({"prosecution": pros})
    ids = [c["claim_id"] for c in result.debate_transcript["claims"] if c["side"] == "prosecution"]
    assert ids == ["P1a", "P2a"] and result.degraded is False   # 1c.10: ids are code-assigned per round (was the model's own "P1a" twice)


def test_a_synthesis_headline_removed_by_the_number_check_gets_the_fallback_sentence():
    # 1d.4: was "fails synthesis / degrades the run"
    answers = _synthesis([_rec("general", {}, "Costs were uneven.")], None)
    first = answers["synthesis"]

    def junk_headline(kw, n):
        return dict(first(kw, 1), headline=JUNK)

    result, *_ = _run({"synthesis": junk_headline})
    assert result.degraded is False and result.n_calls_ok == result.n_calls_expected
    assert result.synthesis.headline == f"Overall verdict: {result.synthesis.overallRating}."
    assert {"agent": "synthesis", "field": "headline", "fallback_text": True} in result.grounding["fallbacks"]


def test_cached_replay_emits_the_same_payloads():
    from agents.council import result_events

    result, events, *_ = _run(_synthesis(FIRST, {"recommendations": []}), trades=OKX)
    replay = dict((n, json.loads(json.dumps(d))) for n, d in result_events(result))
    assert replay["synthesis_done"] == _event(events, "synthesis_done")
    assert replay["gate_done"] == _event(events, "gate_done")
    assert replay["complete"] == events[-1][1]


# ── 1c.10 F1: LLM-originated non-text fields are forced or filtered by code ──

def test_llm_written_ids_and_evidence_keys_are_forced_or_filtered_by_code():
    liq = {**LIQUIDITY, "agent": "liquidity 99.9", "cited_evidence": ["avg_slippage_bps=4.2 bps", "avg_slippage_bps"]}
    pros = {"claims": [{"claim_id": "777", "claim_text": "maker_ratio was low",
                        "evidence_keys": ["cost 1234.5", "maker_ratio"], "rebuts": "x 55"}],
            "prosecution_summary": "Fees were avoidable."}
    result, *_ = _run({"liquidity_scout": liq, "prosecution": pros})

    # agent is the module constant; only keys of the liquidity packet survive (order kept, de-duplicated)
    assert result.liquidity.agent == "liquidity_scout"
    assert result.liquidity.cited_evidence == ["avg_slippage_bps"]
    first = result.debate_transcript["claims"][0]
    assert (first["side"], first["claim_id"], first["evidence_keys"], first["rebuts"]) == (
        "prosecution", "P1a", ["maker_ratio"], None)
    # the defense answered DEFENSE (claim_id "D1a", rebuts "P1a"): P1a now exists, so it is kept
    second = result.debate_transcript["claims"][1]
    assert (second["claim_id"], second["rebuts"]) == ("D1a", "P1a")
    text = json.dumps(result.model_dump(mode="json"))
    for tok in ("99.9", "4.2", "1234.5", "x 55", "777"):
        assert tok not in text, tok


def test_debate_ids_follow_position_and_unknown_rebuts_are_dropped():
    pros = {"claims": [{"claim_id": "Z", "claim_text": "maker_ratio was low", "evidence_keys": ["maker_ratio"]},
                       {"claim_id": "", "claim_text": "   ", "evidence_keys": []},
                       {"claim_id": "Q", "claim_text": "slippage was high", "evidence_keys": ["maker_ratio", "maker_ratio"]}],
            "prosecution_summary": "Fees were avoidable."}
    defense = {"claims": [{"claim_id": "9", "claim_text": "slippage was small", "evidence_keys": ["avg_slippage_bps"],
                           "rebuts": "P1b"},
                          {"claim_id": "9", "claim_text": "costs were fair", "evidence_keys": [], "rebuts": "P9z"}],
               "defense_summary": "Costs reflected the market."}
    result, *_ = _run({"prosecution": pros, "defense": defense})
    claims = result.debate_transcript["claims"]
    # empty claim dropped BEFORE ids are assigned: the third claim becomes P1b
    assert [(c["claim_id"], c["rebuts"]) for c in claims[:4]] == [
        ("P1a", None), ("P1b", None), ("D1a", "P1b"), ("D1b", None)]
    assert claims[1]["evidence_keys"] == ["maker_ratio"]

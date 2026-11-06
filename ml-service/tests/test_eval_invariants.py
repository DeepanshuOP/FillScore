"""Invariants tested on hand-made outputs: one good, then one bad variant per invariant."""
import copy

from evals.invariants import check_all, NAMES

# Hand-made packet: fees 40.0 USD -> materiality gate max(1.0, 0.005*40=0.2) = 1.0
GOLDEN = {"id": "t", "n_trades": 20, "allowed_overall": ["GOOD", "FAIR"],
          # required evidence: the agent's rendered text must show these packet values (render's formatter)
          "required_evidence": {"fee_optimizer": ["fee.maker_ratio"], "risk_auditor": ["risk.adverse_rate"],
                                "liquidity_scout": ["liquidity.avg_slippage_bps"], "alpha_architect": [],
                                # 3c: synthesis-level key, the same rule for both arms. risk.adverse_rate renders "11.0%"
                                "synthesis": ["risk.adverse_rate"]},
          "packet": {"fee": {"total_fee_paid_usd": 40.0, "maker_ratio": 0.5, "content_hash": "f1"},
                     "risk": {"whale_adverse_count": 0, "adverse_rate": 0.11, "content_hash": "r1"},
                     "liquidity": {"avg_slippage_bps": 2.4, "content_hash": "l1"},
                     "alpha": {"content_hash": "a1"}}}


def good():
    cited = {"values_cited": 2}
    return {
        "tradeContext": {"trade_count": 20, "fee_packet_hash": "f1", "risk_packet_hash": "r1",
                         "liquidity_packet_hash": "l1", "alpha_packet_hash": "a1"},
        "liquidity": {"liquidityRating": "GOOD", "slippageRoot": "Average slippage was 2.4 bps."},
        "alpha": {"alphaRating": "NEUTRAL", "bestAlternative": "Fills tracked the benchmark."},
        "risk": {"riskLevel": "LOW", "flags": ["Adverse selection touched 11.0% of fills."]},
        "fee": {"feeRating": "OPTIMAL", "recommendedAction": "Half of fills were maker orders (50.0%)."},
        "synthesis": {"headline": "Execution was solid; adverse selection touched 11.0% of fills.", "narrative": "Adverse selection touched 11.0% of fills.",
                      "overallRating": "GOOD", "estimatedMonthlyCostUSD": 40.0,
                      "findings": [{"action_type": "maker_instead_of_taker", "text": "Maker fills would have cost $5.00 less.",
                                    "effect_usd": 5.0, "effect_bps": 1.0, "n_trades_affected": 4,
                                    "method": "replay", "verified": True, "params": {}}],
                      "observations": []},
        "grounding": {"per_agent": {a: cited for a in ("fee_optimizer", "risk_auditor", "alpha_architect",
                                                       "liquidity_scout", "synthesis")}},
        "debate_transcript": {}, "degraded": False,
    }


def failing(result, golden=GOLDEN):
    return {k for k, o in check_all(result, golden).items() if not o.ok}


def test_good_output_passes_everything():
    assert failing(good()) == set()
    assert set(check_all(good(), GOLDEN)) == set(NAMES)


def test_rating_outside_allowed_set():
    r = good(); r["synthesis"]["overallRating"] = "CRITICAL"
    assert failing(r) == {"rating_allowed"}


def test_specialist_rating_not_in_schema_enum():
    r = good(); r["fee"]["feeRating"] = "AMAZING"
    assert failing(r) == {"rating_allowed"}


def test_missing_evidence_citation():
    from evals.invariants import agent_evidence
    r = good(); r["grounding"]["per_agent"]["synthesis"] = {"values_cited": 0}
    assert failing(r) == {"evidence_cited"}
    r = good(); r["grounding"]["per_agent"]["risk_auditor"] = {"values_cited": 0}
    assert failing(r) == set()                      # a specialist miss is the Council-only column now
    assert not agent_evidence(r, GOLDEN).ok


def test_advice_term_flagged():
    r = good(); r["synthesis"]["narrative"] = "The trader should use limit orders."
    assert failing(r) == {"no_flagged_terms"}


def test_causal_term_flagged_in_debate():
    r = good(); r["debate_transcript"] = {"key_dispute": "The costs were unavoidable."}
    assert failing(r) == {"no_flagged_terms"}


def test_whale_term_needs_whale_evidence():
    r = good(); r["debate_transcript"] = {"key_dispute": "Whales moved the book."}
    assert failing(r) == {"no_flagged_terms"}   # whale_adverse_count == 0 in the packet


def test_invented_number_flagged():
    r = good(); r["synthesis"]["narrative"] = "Slippage averaged 7.7 bps."   # 7.7 is in no packet field
    assert failing(r) == {"numerals_grounded"}


def test_number_word_flagged():
    r = good(); r["synthesis"]["narrative"] = "Three trades were large."
    assert failing(r) == {"numerals_grounded"}


def test_finding_below_gate():
    r = good(); r["synthesis"]["findings"][0]["effect_usd"] = 0.5   # gate 1.0
    r["synthesis"]["findings"][0]["text"] = "Maker fills cost $0.50 less."   # $0.50 = the finding's own effect
    assert failing(r) == {"findings_gated"}


def test_finding_on_observation_action():
    r = good(); r["synthesis"]["findings"][0]["action_type"] = "general"
    assert "findings_gated" in failing(r)


def test_packet_hash_drift():
    r = good(); r["tradeContext"]["fee_packet_hash"] = "zzz"
    assert failing(r) == {"packet_provenance"}


def test_trade_count_drift():
    r = good(); r["tradeContext"]["trade_count"] = 21
    assert failing(r) == {"packet_provenance"}


def test_missing_provenance_fails():
    r = good(); r["tradeContext"] = {}
    assert failing(r) == {"packet_provenance"}   # a run that cannot show which data it saw proves nothing


def test_degraded_run_may_be_ungraded():
    r = good(); r["synthesis"]["overallRating"] = None; r["degraded"] = True
    assert "rating_allowed" not in failing(r)
    r["degraded"] = False
    assert "rating_allowed" in failing(r)

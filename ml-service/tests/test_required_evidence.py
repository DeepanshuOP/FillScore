"""agents.required_evidence: the one rule for which packet values the synthesis must state (M3, LOG §M).

Rule: one headline key per specialist area that has data, in the fixed order fee, liquidity, alpha, risk:
  fee.total_fee_paid_usd            when fee.trade_count > 0
  liquidity.median_slippage_bps     when liquidity.market_order_count > 0
  alpha.pct_beating_vwap            when alpha.vwap_trades_count > 0
  risk.top_symbol_notional_fraction when risk.total_trades > 0
"""
from agents.required_evidence import HEADLINE, required_keys, prompt_line


def packets(fee=10, market=4, vwap=3, total=10):
    return {"fee": {"trade_count": fee, "total_fee_paid_usd": 21.3}, "liquidity": {"market_order_count": market, "median_slippage_bps": 1.2},
            "alpha": {"vwap_trades_count": vwap, "pct_beating_vwap": 0.6}, "risk": {"total_trades": total, "top_symbol_notional_fraction": 0.41}}


def test_all_areas_with_data():
    assert required_keys(packets()) == ["fee.total_fee_paid_usd", "liquidity.median_slippage_bps", "alpha.pct_beating_vwap",
                                        "risk.top_symbol_notional_fraction"]


def test_an_area_without_data_is_not_required():
    # A disciplined profile with no market orders has no slippage sample: nothing to cite there.
    assert required_keys(packets(market=0)) == ["fee.total_fee_paid_usd", "alpha.pct_beating_vwap", "risk.top_symbol_notional_fraction"]
    assert required_keys(packets(fee=0, market=0, vwap=0, total=0)) == []
    assert required_keys({}) == []


def test_the_prompt_line_names_every_required_placeholder():
    line = prompt_line(packets(vwap=0))
    for k in ("fee.total_fee_paid_usd", "liquidity.median_slippage_bps", "risk.top_symbol_notional_fraction"):
        assert "{{" + k + "}}" in line
    assert "alpha.pct_beating_vwap" not in line
    assert prompt_line(packets(0, 0, 0, 0)) == ""


def test_evidence_cited_checks_exactly_the_keys_the_rule_names():
    """M3 step 4: a golden case built the way the dumper will build it (required_evidence.synthesis = required_keys of
    its packet) passes a synthesis that states every required value as `render` shows it, and fails one that omits a
    value, naming that key. evidence_cited itself is unchanged: it already reads required_evidence.synthesis."""
    from evals.invariants import _ctx, _key_value, evidence_cited
    pk = packets()
    golden = {"packet": pk, "required_evidence": {"synthesis": required_keys(pk)}}
    shown = {k: _key_value(_ctx(golden), k) for k in required_keys(pk)}
    assert all(shown.values())                                        # every required key renders from the packet

    def result(keys):
        return {"grounding": {"per_agent": {"synthesis": {"values_cited": len(keys)}}},
                "synthesis": {"headline": "Execution summary.", "narrative": " ".join(f"Value {shown[k]}." for k in keys),
                              "observations": [], "findings": []}}

    assert evidence_cited(result(list(shown)), golden).ok
    for omitted in shown:
        out = evidence_cited(result([k for k in shown if k != omitted]), golden)
        assert not out.ok and omitted in out.detail, omitted


def test_headline_table_covers_the_four_areas():
    assert list(dict.fromkeys(a for a, _, _ in HEADLINE)) == ["fee", "liquidity", "alpha", "risk"]


# Metrics 1.3.0, packets of a rebuilt demo (no v1 slippage or VWAP): the liquidity area's headline is the measured
# spread paid, the alpha area's the median cost of the unfilled orders. The v1 key comes first and wins when present.
def rebuilt(measured=4, unfilled=2):
    return {"fee": {"trade_count": 10, "total_fee_paid_usd": 21.3},
            "liquidity": {"market_order_count": 4, "measured_order_count": measured, "median_spread_paid_bps": 2.0},
            "alpha": {"vwap_trades_count": 0, "unfilled_order_count": unfilled, "median_opportunity_bps_unfilled": 30.0},
            "risk": {"total_trades": 10, "top_symbol_notional_fraction": 0.41}}


def test_rebuilt_data_uses_the_measured_headlines():
    assert required_keys(rebuilt()) == ["fee.total_fee_paid_usd", "liquidity.median_spread_paid_bps",
                                        "alpha.median_opportunity_bps_unfilled", "risk.top_symbol_notional_fraction"]


def test_rebuilt_data_without_unfilled_orders_asks_nothing_of_alpha():
    assert "alpha.median_opportunity_bps_unfilled" not in required_keys(rebuilt(unfilled=0))
    assert not any(k.startswith("liquidity.") for k in required_keys(rebuilt(measured=0)))


def test_golden_required_evidence_names_one_key_per_specialist_and_the_synthesis_list():
    from agents.required_evidence import golden_required_evidence
    assert golden_required_evidence(rebuilt()) == {
        "fee_optimizer": ["fee.total_fee_paid_usd"], "liquidity_scout": ["liquidity.median_spread_paid_bps"],
        "alpha_architect": ["alpha.median_opportunity_bps_unfilled"], "risk_auditor": ["risk.top_symbol_notional_fraction"],
        "synthesis": ["fee.total_fee_paid_usd", "liquidity.median_spread_paid_bps", "alpha.median_opportunity_bps_unfilled",
                      "risk.top_symbol_notional_fraction"]}
    none = golden_required_evidence(rebuilt(unfilled=0))
    assert none["alpha_architect"] == [] and "alpha.median_opportunity_bps_unfilled" not in none["synthesis"]


def test_specialist_line_asks_for_the_areas_headline_value_only():
    from agents.required_evidence import specialist_line
    assert specialist_line(rebuilt(), "liquidity") == \
        "Your explanation must state this value, written only as this placeholder: {{liquidity.median_spread_paid_bps}}."
    assert specialist_line(packets(), "alpha") == \
        "Your explanation must state this value, written only as this placeholder: {{alpha.pct_beating_vwap}}."
    assert specialist_line(rebuilt(unfilled=0), "alpha") == ""          # no data in the area: nothing is asked
    assert specialist_line({}, "fee") == ""


def test_the_v1_key_wins_when_both_exist_and_each_area_is_named_once():
    p = packets()
    p["liquidity"].update({"measured_order_count": 4, "median_spread_paid_bps": 2.0})
    p["alpha"].update({"unfilled_order_count": 2, "median_opportunity_bps_unfilled": 30.0})
    assert required_keys(p) == ["fee.total_fee_paid_usd", "liquidity.median_slippage_bps", "alpha.pct_beating_vwap",
                                "risk.top_symbol_notional_fraction"]

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


def test_headline_table_covers_the_four_areas():
    assert [a for a, _, _ in HEADLINE] == ["fee", "liquidity", "alpha", "risk"]

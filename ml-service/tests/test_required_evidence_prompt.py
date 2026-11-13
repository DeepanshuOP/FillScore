"""M3 plan §1 step 1: the synthesis prompt and the single-call prompt both carry the required-evidence line
(agents.required_evidence.prompt_line), built from the same packets the evaluation reads, so what is asked for is
exactly what `evidence_cited` checks. Hand values: with data in all four areas the line names, in this order,
fee.total_fee_paid_usd, liquidity.median_slippage_bps, alpha.pct_beating_vwap, risk.top_symbol_notional_fraction."""
from agents import single_call, synthesis
from agents.required_evidence import prompt_line, required_keys
from agents.schemas import TradeContext
from tests.council_fakes import make_packets

ALL = ["fee.total_fee_paid_usd", "liquidity.median_slippage_bps", "alpha.pct_beating_vwap", "risk.top_symbol_notional_fraction"]


def _packets(with_data=True):
    fee, risk, liq, alpha = make_packets()
    if with_data:
        liq.market_order_count, liq.median_slippage_bps = 5, 1.2
        alpha.vwap_trades_count, alpha.pct_beating_vwap = 4, 50.0
        risk.total_trades, risk.top_symbol_notional_fraction = 10, 0.6
    else:
        alpha.vwap_trades_count = 0          # make_packets() carries one VWAP sample; here no area but fee has data
    return fee, risk, liq, alpha


def _ctx(packets):
    return synthesis.packet_ctx_of(*packets)


def _context(fee):
    return TradeContext(userId="u", symbol="BTCUSDT", trade_count=fee.trade_count, fee_packet_hash="a", risk_packet_hash="b",
                        liquidity_packet_hash="c", alpha_packet_hash="d")


def test_the_rule_reads_the_prompt_context_of_these_packets():
    assert required_keys(_ctx(_packets())) == ALL


def test_synthesis_prompt_names_every_required_placeholder():
    p = _packets()
    text = synthesis.build_user_prompt(_context(p[0]), {}, *p, debate_dict=None, trades=None)
    assert prompt_line(_ctx(p)) in text
    for k in ALL:
        assert "{{" + k + "}}" in text


def test_single_call_prompt_names_every_required_placeholder():
    p = _packets()
    text = single_call.build_single_user_prompt(_context(p[0]), *p, trades=None)
    assert prompt_line(_ctx(p)) in text
    for k in ALL:
        assert "{{" + k + "}}" in text


def test_each_specialist_prompt_names_its_areas_headline_placeholder():
    from agents import alpha_architect, fee_optimizer, liquidity_scout, risk_auditor
    p = _packets()
    ctx = _ctx(p)
    for mod, packet, key in ((fee_optimizer, p[0], "fee.total_fee_paid_usd"), (risk_auditor, p[1], "risk.top_symbol_notional_fraction"),
                             (liquidity_scout, p[2], "liquidity.median_slippage_bps"), (alpha_architect, p[3], "alpha.pct_beating_vwap")):
        text = mod.build_user_prompt(_context(p[0]), packet, ctx)
        assert "{{" + key + "}}" in text.split("Your explanation must state this value")[1].split("\n")[0], mod.__name__


def test_an_area_without_data_is_not_asked_for_in_either_prompt():
    p = _packets(with_data=False)                  # only the fee area has data
    for text in (synthesis.build_user_prompt(_context(p[0]), {}, *p, debate_dict=None, trades=None),
                 single_call.build_single_user_prompt(_context(p[0]), *p, trades=None)):
        assert "The narrative must state each of these values" in text
        line =text.split("The narrative must state each of these values")[1].split("\n")[0]
        assert "alpha.pct_beating_vwap" not in line and "liquidity.median_slippage_bps" not in line and "risk." not in line


def test_no_data_in_any_area_adds_no_line():
    p = _packets(with_data=False)
    p[0].trade_count = 0
    text = synthesis.build_user_prompt(_context(p[0]), {}, *p, debate_dict=None, trades=None)
    assert "must state each of these values" not in text

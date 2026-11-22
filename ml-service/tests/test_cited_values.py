"""Design v3 fixes A7 (2026-11-21): the values a specialist's recorded text cites, traced to the audit field.

A specialist writes numbers only as {{ns.key}} placeholders and the renderer fills them from the packet (agents.render);
the recorded run keeps the rendered text and a code-counted `values_cited`, not which keys were used. The trace renders
every packet value as the renderer would and finds those strings in the text. It is shown only when every numeral in
the shown text lies inside a traced value; otherwise the card says the values could not be traced (the recorded count
is information only). Nothing here comes from a language model: each value is the packet's, formatted by
agents.render.format_value.
"""
from agents.cited_values import safe_trace
import asyncio
import json
from unittest.mock import MagicMock, patch

from mongomock_motor import AsyncMongoMockClient

from agents.cited_values import trace_agent, trace_result
from tests.council_fakes import make_packets, make_router
from tests.test_council_cache_demo import _env, _stored_run  # noqa: F401  (_env is an autouse fixture)

# Hand fixture. Renderer rules (agents/render.py): maker_ratio is a percent key (0.779 -> "77.9%"); *_usd -> "$23.96";
# *_bps -> "10.0 bps"; trade_count is a count (344 -> "344"); *_hhi -> two decimals (1.0 -> "1.00").
FEE = {"maker_ratio": 0.779, "total_fee_usd": 23.96, "fee_drag_bps": 10.0, "trade_count": 344}
RISK = {"adverse_rate": 0.0, "top_symbol_notional_fraction": 1.0, "symbol_hhi": 1.0, "trade_count": 344}


def test_each_cited_value_is_traced_to_its_field_in_reading_order():
    text = "The trader executed 77.9% of orders as maker, keeping total fee cost at $23.96 with a drag of 10.0 bps."
    out = trace_agent([text], {"fee": FEE}, "fee", recorded=3)
    assert out["complete"] is True
    assert out["recorded"] == 3
    assert out["lines"] == [
        {"value": "77.9%", "unit": "%", "fields": ["fee.maker_ratio"]},
        {"value": "$23.96", "unit": "USD", "fields": ["fee.total_fee_usd"]},
        {"value": "10.0 bps", "unit": "bps", "fields": ["fee.fee_drag_bps"]},
    ]


def test_flag_sentences_count_too_and_a_shared_rendering_lists_every_field():
    # top_symbol_notional_fraction is a percent key: 1.0 -> "100.0%"; adverse_rate 0.0 -> "0.0%"; hhi "1.00".
    flags = ["Notional was concentrated, with the top symbol at 100.0% of the total.",
             "Symbol HHI was 1.00, indicating single-asset exposure.",
             "Adverse selection rate was 0.0% across 344 trades."]
    out = trace_agent(flags, {"risk": RISK}, "risk", recorded=4)
    assert out["complete"] is True
    assert [ln["value"] for ln in out["lines"]] == ["100.0%", "1.00", "0.0%", "344"]
    assert out["lines"][1]["fields"] == ["risk.symbol_hhi"]
    both = trace_agent(["The rate was 0.0%."], {"risk": {**RISK, "pct_negative_slippage": 0.0}}, "risk", recorded=1)
    assert both["lines"][0]["fields"] == ["risk.adverse_rate", "risk.pct_negative_slippage"]


def test_a_number_inside_a_longer_number_is_not_a_citation():
    out = trace_agent(["Prices near 41.000 and 3445 orders."], {"risk": RISK}, "risk", recorded=0)
    assert out["lines"] == []
    assert out["complete"] is False   # 41.000 and 3445 are numerals no packet value renders as


def test_complete_means_every_numeral_in_the_shown_text_was_traced():
    # The recorded count can be stale: the claim check may replace an explanation with a code-built fallback sentence
    # after grounding counted (demo-disciplined's liquidity note: recorded 3, text "Liquidity verdict: GOOD.").
    # So the gate is the grounding guarantee itself: no numeral outside a traced value.
    assert trace_agent(["Fees were $23.96."], {"fee": FEE}, "fee", recorded=3)["complete"] is True
    assert trace_agent(["Liquidity verdict: GOOD."], {"fee": FEE}, "fee", recorded=3) == {"recorded": 3, "lines": [], "complete": True}
    untraced = trace_agent(["Fees were $99.00 over 12 orders."], {"fee": FEE}, "fee", recorded=2)
    assert untraced["complete"] is False
    assert untraced["lines"] == []


def test_trace_result_reads_each_specialists_text_fields_and_recorded_counts():
    result = {
        "fee": {"recommendedAction": "Kept total fee cost at $23.96.", "flags": ["low_fee_drag"]},
        "risk": {"flags": ["Adverse selection rate was 0.0% across 344 trades."]},
        "liquidity": {"slippageRoot": "", "flags": []},
        "alpha": {"bestAlternative": "", "flags": []},
        "grounding": {"per_agent": {"fee_optimizer": {"values_cited": 1}, "risk_auditor": {"values_cited": 2}}},
    }
    out = trace_result(result, {"fee": FEE, "risk": RISK, "liquidity": {}, "alpha": {}})
    assert out["fee_optimizer"]["lines"] == [{"value": "$23.96", "unit": "USD", "fields": ["fee.total_fee_usd"]}]
    assert out["fee_optimizer"]["complete"] is True
    assert [ln["value"] for ln in out["risk_auditor"]["lines"]] == ["0.0%", "344"]
    assert out["liquidity_scout"] == {"recorded": None, "lines": [], "complete": True}   # no text, nothing cited


def test_a_served_demo_run_carries_cited_values_beside_the_unchanged_recorded_result(tmp_path):
    # make_packets(): fee.total_fee_paid_usd = 328.0, rendered "$328.00". The recorded fee text cites it.
    router, provider = make_router()
    recorded = _stored_run(router, account="demo-moderate")["council_result"]
    recorded["fee"] = {**recorded["fee"], "recommendedAction": "Total fees were $328.00.", "flags": []}
    (tmp_path / "demo-moderate.json").write_text(json.dumps({"account_id": "demo-moderate", "symbol": "BTCUSDT", "council_result": recorded}))
    events: list[tuple[str, dict]] = []

    async def sink(name, data):
        events.append((name, data))

    async def load(*_a, **_k):
        return make_packets(), []

    from agents.council_service import council_flow
    with patch("agents.council_service.DEMO_RUNS_DIR", tmp_path), patch("agents.council_service._router", return_value=router), \
         patch("agents.metrics.loader.load_run_inputs", load), \
         patch("agents.persistence._get_db", return_value=(MagicMock(), AsyncMongoMockClient()["fillscore"])):
        result = asyncio.run(council_flow("demo-moderate", "BTCUSDT", on_event=sink))
    names = [n for n, _ in events]
    assert names.index("cited_values") == names.index("complete") - 1   # its own event, just before complete
    assert "citedValues" not in dict(events)["complete"]                # complete stays equal to the HTTP body
    fee = dict(events)["cited_values"]["citedValues"]["fee_optimizer"]
    assert fee["complete"] is True
    assert [ln["value"] for ln in fee["lines"]] == ["$328.00"]
    assert "fee.total_fee_paid_usd" in fee["lines"][0]["fields"]
    assert "citedValues" not in result.model_dump()            # the recorded result itself is not changed
    # the benchmark line is computed from the packet (make_packets: one fill with VWAP, median deviation 0.0 -> "equal to")
    bench = dict(events)["cited_values"]["benchmark"]
    assert bench["direction"] == "equal to"
    assert bench["statement"] == "Market-order fills: median equal to the 5-minute VWAP (1 fill)"
    assert "benchmark" not in dict(events)["complete"] and "benchmark" not in result.model_dump()
    assert provider.calls == []


def test_the_trace_can_never_break_a_run():
    # a result whose shape makes the trace raise (grounding is not a dict) gives {} instead of an exception
    assert safe_trace({"grounding": "not a dict", "fee": {"recommendedAction": "x"}}, {"fee": FEE}) == {}

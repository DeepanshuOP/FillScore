"""evals.dump_golden_packets derives `required_evidence` from the packets with the one rule (agents.required_evidence)
for every case of a new golden set, instead of carrying hand-picked keys over (the cause of the evidence_cited failures,
LOG §M). The demo packets come from a read-only database read; here that read is replaced by fixed packet contexts.

Hand values: a rebuilt-demo context (no v1 slippage or VWAP, measured orders) gives, per the rule,
  fee.total_fee_paid_usd, liquidity.median_spread_paid_bps, alpha.median_opportunity_bps_unfilled, risk.top_symbol_notional_fraction.
"""
import asyncio

from agents.required_evidence import required_keys
from evals import dump_golden_packets as d
from evals import golden_sets

CTX = {"fee": {"trade_count": 10, "total_fee_paid_usd": 21.3, "content_hash": "f"},
       "liquidity": {"market_order_count": 4, "measured_order_count": 4, "median_spread_paid_bps": 2.0, "content_hash": "l"},
       "alpha": {"vwap_trades_count": 0, "unfilled_order_count": 2, "median_opportunity_bps_unfilled": 30.0, "content_hash": "a"},
       "risk": {"total_trades": 10, "top_symbol_notional_fraction": 0.41, "content_hash": "r"}}


def test_dump_derives_required_evidence_for_every_case(tmp_path, monkeypatch):
    async def fake_contexts():
        return {u: (10, CTX) for u in d.USERS}
    monkeypatch.setattr(d, "_demo_contexts", fake_contexts)
    root = str(tmp_path / "golden")
    d.dump("v9", root=root)
    g = golden_sets.load_golden("v9", root)
    assert set(g) >= set(d.USERS)
    for u in d.USERS:
        assert g[u]["required_evidence"]["synthesis"] == [
            "fee.total_fee_paid_usd", "liquidity.median_spread_paid_bps", "alpha.median_opportunity_bps_unfilled",
            "risk.top_symbol_notional_fraction"]
        assert g[u]["required_evidence"]["liquidity_scout"] == ["liquidity.median_spread_paid_bps"]
    for name, doc in g.items():            # edge cases too: the list is exactly what the prompt would ask for
        assert doc["required_evidence"]["synthesis"] == required_keys(doc["packet"]), name
    assert golden_sets.read_manifest("v9", root)["recorded"] is False

"""4R-0 Task 1: trades never backfilled (no spreadEstimates) degrade to 'no estimate', never KeyError / fake $0."""
from agents.counterfactual import maker_instead_of_taker
from agents.render import enrichment_ctx

T = {"symbol": "BTCUSDT", "side": "BUY", "isMaker": False, "notional": 1000.0, "executionPrice": 100.0,
     "quantity": 10.0, "executedAt": "2024-01-15T10:00:00Z", "feeUsd": 1.0, "feeAsset": "USDT", "exchange": "binance"}


def test_render_without_spreadEstimates():
    assert "spread" not in enrichment_ctx([T])                       # namespace absent -> placeholders resolve to None
    assert "spread" not in enrichment_ctx([{**T, "spreadBps": 1.2}])  # a plain numeric spreadBps is NOT an estimate


def test_render_reads_spreadEstimates():
    t = {**T, "halfSpreadBps": 1.5, "spreadEstimates": {"cs": 4.0, "ar": 3.0, "n_pairs": 9, "version": 1}}
    s = enrichment_ctx([t])["spread"]
    # conservative = min(4.0, 3.0) = 3.0 ; half = 1.5
    assert s["cs_bps"] == 4.0 and s["ar_bps"] == 3.0 and s["conservative_bps"] == 3.0 and s["half_spread_bps"] == 1.5


def test_counterfactual_without_estimates_is_unavailable():
    res = maker_instead_of_taker([T], 0.5)
    d = res.details if hasattr(res, "details") else res[-1]
    assert d["spread_component"] == 0 and d["spread_source"] == "unavailable"

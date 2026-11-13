"""Metrics 1.3.0: packets for rebuilt demo data (M3 plan §1 step 3).

A rebuilt demo's trades carry no per-trade v1 fields (arrivalSlippageBps, vwap5min, fillScore). Before 1.3.0 the
liquidity packet then said "median slippage 0.0 bps over 159 market orders" and the alpha packet carried zero VWAP and
score values: numbers nobody measured. From 1.3.0 a value that cannot be measured is absent from the prompt view, and
the measured order shortfall (collection order_measurements, written by ml-service/measure) takes its place.

Hand values for the measurements below (bps of intended notional per order):
  A: execution 2, spread 1, impact 1, opportunity 0, fill ratio 1
  B: execution 6, spread 3, impact 3, opportunity 0, fill ratio 1
  C: never filled: execution 0, spread/impact None, opportunity 40, fill ratio 0
  D: unfilled too: execution 0, opportunity 20, fill ratio 0
  E: not measured (shortfall None), ignored
  measured orders 4 (A-D); median spread of [1, 3] = 2; median impact [1, 3] = 2; median execution of [2, 6, 0, 0] sorted
  0, 0, 2, 6 -> (0 + 2) / 2 = 1; unfilled orders 2 (C, D); median opportunity of the unfilled [40, 20] = 30;
  unfilled opportunity share: sum 60 bps over 2 orders (not shown).
"""
import pytest

from agents.metrics.alpha_packet import build_alpha_packet
from agents.metrics.liquidity_packet import build_liquidity_packet
from agents.metrics.measured import summarise_measurements


def sm(oid, e, s, i, opp, ratio):
    return {"orderId": oid, "unmeasuredReason": None,
            "shortfall": {"executionBps": e, "spreadBps": s, "impactTimingBps": i, "opportunityBps": opp, "fillRatio": ratio}}


MEAS = [sm("A", 2, 1, 1, 0, 1.0), sm("B", 6, 3, 3, 0, 1.0), sm("C", 0, None, None, 40, 0.0), sm("D", 0, None, None, 20, 0.0),
        {"orderId": "E", "unmeasuredReason": "no_quote_at_arrival", "shortfall": None}]


def fill(i, order_type="MARKET", maker=False, **extra):
    return {"id": f"t{i}", "orderType": order_type, "isMaker": maker, "side": "BUY", "executionPrice": 100.0, "notionalValue": 100.0,
            "executedAt": "2024-01-15T14:00:00+00:00", "symbol": "BTCUSDT", **extra}


REBUILT = [fill(1), fill(2), fill(3, "LIMIT", True)]            # no arrivalSlippageBps, no vwap5m, no fillScore
V1 = [fill(1, arrivalSlippageBps=2.0, vwap5m=99.9, fillScore=80), fill(2, arrivalSlippageBps=4.0, vwap5m=100.2, fillScore=70)]


def test_summarise_measurements_hand_values():
    s = summarise_measurements(MEAS)
    assert s == {"measured_order_count": 4, "median_spread_paid_bps": 2.0, "median_impact_timing_bps": 2.0,
                 "median_execution_bps": 1.0, "unfilled_order_count": 2, "median_opportunity_bps_unfilled": 30.0}


def test_no_measurements_gives_no_block():
    assert summarise_measurements(None) is None
    assert summarise_measurements([]) is None
    assert summarise_measurements([MEAS[-1]]) is None            # only an unmeasured order: nothing measured


def test_liquidity_rebuilt_data_has_no_invented_slippage():
    d = build_liquidity_packet(REBUILT, "u", "BTCUSDT", measurements=MEAS).to_prompt_dict()
    for k in ("avg_slippage_bps", "median_slippage_bps", "p90_slippage_bps", "pct_negative_slippage", "worst5_slippage_bps",
              "adverse_slippage_avg_bps", "clean_slippage_avg_bps", "adverse_vs_clean_diff_bps"):
        assert k not in d, k
    assert d["market_order_count"] == 2 and d["limit_order_count"] == 1
    assert d["median_spread_paid_bps"] == 2.0 and d["median_impact_timing_bps"] == 2.0 and d["median_execution_bps"] == 1.0
    assert d["measured_order_count"] == 4


def test_liquidity_with_v1_slippage_keeps_its_keys_and_has_no_measured_block_without_measurements():
    d = build_liquidity_packet(V1, "u", "BTCUSDT").to_prompt_dict()
    assert d["median_slippage_bps"] == 3.0 and d["avg_slippage_bps"] == 3.0       # median and mean of [2, 4]
    assert "median_spread_paid_bps" not in d and "measured_order_count" not in d


def test_alpha_rebuilt_data_has_no_invented_vwap_or_scores_but_has_unfilled_orders():
    d = build_alpha_packet(REBUILT, "u", "BTCUSDT", measurements=MEAS).to_prompt_dict()
    for k in ("avg_vwap_deviation_bps", "median_vwap_deviation_bps", "pct_beating_vwap", "worst5_vwap_deviation_bps",
              "symbol_avg_fill_score", "best_symbol", "worst_symbol"):
        assert k not in d, k
    assert d["vwap_trades_count"] == 0
    assert d["unfilled_order_count"] == 2 and d["median_opportunity_bps_unfilled"] == 30.0


def test_alpha_with_v1_fields_keeps_its_keys():
    d = build_alpha_packet(V1, "u", "BTCUSDT").to_prompt_dict()
    assert d["vwap_trades_count"] == 2 and "pct_beating_vwap" in d and "symbol_avg_fill_score" in d
    assert "unfilled_order_count" not in d


@pytest.mark.parametrize("builder", [build_liquidity_packet, build_alpha_packet])
def test_the_hash_changes_when_the_measurements_change(builder):
    a = builder(REBUILT, "u", "BTCUSDT", measurements=MEAS)
    b = builder(REBUILT, "u", "BTCUSDT", measurements=MEAS[:3])
    assert a.content_hash != b.content_hash
    assert builder(REBUILT, "u", "BTCUSDT", measurements=MEAS).content_hash == a.content_hash

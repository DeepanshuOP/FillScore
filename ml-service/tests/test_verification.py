"""Tests for verification.py — paper contribution (3)."""
import pytest
from agents.verification import (
    verify_recommendations, _classify_action, _get_counterfactual_value,
    _check_contradiction, gate_report_to_dict,
)

FEE_PKT = {
    "maker_ratio": 0.22, "total_fee_paid_usd": 328.5,
    "savings_at_050_usd": 0.0, "savings_at_080_usd": 0.0,
    "fee_drag_bps": 10.0, "longest_taker_streak": 5,
}
RISK_PKT = {
    "symbol_hhi": 0.89, "adverse_rate": 0.19,
    "avg_trade_usd": 208.0, "p90_trade_usd": 450.0, "large_trade_count": 3,
}
LIQUIDITY_PKT = {
    "avg_slippage_bps": -0.4, "worst_hour_utc": 4, "best_hour_utc": 14,
    "adverse_vs_clean_diff_bps": 2.1, "market_order_count": 88,
}
ALPHA_PKT = {
    "avg_vwap_deviation_bps": 5.2, "best_symbol": "BTCUSDT",
    "worst_symbol": "SOLUSDT", "best_hour_utc": 14,
}


class TestActionClassification:
    def test_limit_order_maps_to_maker(self):
        assert _classify_action("Switch to limit orders to reduce fees") == "increase_maker_ratio"

    def test_hour_maps_to_bad_hours(self):
        assert _classify_action("Avoid trading at 04:00 UTC, your worst hour") == "avoid_bad_hours"

    def test_whale_maps_correctly(self):
        assert _classify_action("Avoid trading during whale sweep windows") == "avoid_whale_windows"

    def test_vwap_maps_correctly(self):
        assert _classify_action("Use VWAP execution to reduce market impact") == "use_vwap"

    def test_concentration_maps_correctly(self):
        assert _classify_action("Diversify across symbols to reduce HHI concentration") == "reduce_concentration"

    def test_generic_maps_to_general(self):
        assert _classify_action("Improve your overall execution quality") == "general_improvement"


class TestCounterfactualValue:
    def test_maker_ratio_reads_fee_packet(self):
        val, key = _get_counterfactual_value("increase_maker_ratio", FEE_PKT, RISK_PKT, LIQUIDITY_PKT, ALPHA_PKT)
        assert key == "savings_at_080_usd"
        assert val == 0.0

    def test_bad_hours_reads_liquidity_packet(self):
        val, key = _get_counterfactual_value("avoid_bad_hours", FEE_PKT, RISK_PKT, LIQUIDITY_PKT, ALPHA_PKT)
        assert key == "worst_hour_utc"
        assert val == 4.0

    def test_concentration_reads_risk_packet(self):
        val, key = _get_counterfactual_value("reduce_concentration", FEE_PKT, RISK_PKT, LIQUIDITY_PKT, ALPHA_PKT)
        assert key == "symbol_hhi"
        assert abs(val - 0.89) < 1e-6

    def test_general_returns_zero(self):
        val, key = _get_counterfactual_value("general_improvement", FEE_PKT, RISK_PKT, LIQUIDITY_PKT, ALPHA_PKT)
        assert key == "none"
        assert val == 0.0


class TestVerifyRecommendations:
    def test_valid_recommendations_pass(self):
        recs = [
            "Switch to limit orders to improve maker ratio and reduce taker fees",
            "Avoid trading at 04:00 UTC, which is your worst performing hour",
            "Diversify across symbols to reduce concentration risk",
        ]
        report = verify_recommendations(recs, FEE_PKT, RISK_PKT, LIQUIDITY_PKT, ALPHA_PKT)
        assert report.gate_passed is True
        assert report.passed_count == 3

    def test_empty_recommendation_fails(self):
        recs = ["", "Valid recommendation about limit orders and maker ratio"]
        report = verify_recommendations(recs, FEE_PKT, RISK_PKT, LIQUIDITY_PKT, ALPHA_PKT)
        assert report.verdicts[0].passed is False

    def test_short_recommendation_fails(self):
        report = verify_recommendations(["Do better"], FEE_PKT, RISK_PKT, LIQUIDITY_PKT, ALPHA_PKT)
        assert report.verdicts[0].passed is False

    def test_gate_passes_if_any_valid(self):
        recs = ["", "Switch to limit orders and passive fills to reduce taker fee drag"]
        report = verify_recommendations(recs, FEE_PKT, RISK_PKT, LIQUIDITY_PKT, ALPHA_PKT)
        assert report.gate_passed is True

    def test_empty_list(self):
        report = verify_recommendations([], FEE_PKT, RISK_PKT, LIQUIDITY_PKT, ALPHA_PKT)
        assert report.total_recommendations == 0
        assert report.gate_passed is False

    def test_counterfactual_values_populated(self):
        recs = ["Avoid trading at 04:00 UTC, your worst hour window"]
        report = verify_recommendations(recs, FEE_PKT, RISK_PKT, LIQUIDITY_PKT, ALPHA_PKT)
        assert report.verdicts[0].counterfactual_key == "worst_hour_utc"
        assert report.verdicts[0].counterfactual_value == 4.0


class TestContradictions:
    def test_no_contradiction(self):
        assert _check_contradiction(["increase_maker_ratio", "avoid_bad_hours"]) == []

    def test_contradiction_detected(self):
        flags = _check_contradiction(["increase_maker_ratio", "use_vwap"])
        assert len(flags) == 1


class TestSerialization:
    def test_serializes_to_dict(self):
        recs = ["Switch to limit orders to improve maker ratio"]
        report = verify_recommendations(recs, FEE_PKT, RISK_PKT, LIQUIDITY_PKT, ALPHA_PKT)
        d = gate_report_to_dict(report)
        assert "total_recommendations" in d
        assert "verdicts" in d
        assert "gate_passed" in d

"""
Tests for grounding.py — the paper's E1 metric implementation.
Tests use planted violations so we can assert the checker catches them.
These tests are the reproducibility artifact for the faithfulness claim.
"""
import pytest
from agents.grounding import (
    check_grounding,
    check_all_verdicts,
    summarise_grounding,
    _extract_numeric_tokens,
    _packet_numeric_values,
    GroundingReport,
)

# ── Minimal packet dict (simulates to_prompt_dict() output) ──────────────────
SAMPLE_PACKET = {
    "avg_slippage_bps": 8.5,
    "median_slippage_bps": 7.2,
    "p90_slippage_bps": 17.6,
    "pct_negative_slippage": 0.25,
    "market_order_count": 40,
    "adverse_vs_clean_diff_bps": 15.0,
    "worst_hour_utc": 14,
    "content_hash": "abc123",
    "metrics_version": "1.0.0",
}


class TestNumericExtraction:
    def test_extracts_decimals(self):
        tokens = _extract_numeric_tokens("slippage is 8.5 bps")
        assert "8.5" in tokens

    def test_filters_single_digits(self):
        tokens = _extract_numeric_tokens("only 3 trades at hour 4")
        assert "3" not in tokens
        assert "4" not in tokens

    def test_extracts_integer(self):
        tokens = _extract_numeric_tokens("market_order_count is 40")
        assert "40" in tokens

    def test_empty_string(self):
        assert _extract_numeric_tokens("") == []

    def test_no_numbers(self):
        assert _extract_numeric_tokens("good execution quality") == []

    def test_filters_years(self):
        tokens = _extract_numeric_tokens("traded in 2024 at 15.3 bps")
        assert "2024" not in tokens
        assert "15.3" in tokens


class TestPacketValues:
    def test_includes_float(self):
        vals = _packet_numeric_values({"x": 8.5})
        assert "8.5" in vals

    def test_includes_int(self):
        vals = _packet_numeric_values({"x": 40})
        assert "40" in vals

    def test_nested_dict(self):
        vals = _packet_numeric_values({"outer": {"inner": 15.0}})
        assert "15.0" in vals

    def test_list_values(self):
        vals = _packet_numeric_values({"scores": [7.2, 17.6]})
        assert "7.2" in vals
        assert "17.6" in vals


class TestEvidenceKeyValidation:
    def test_all_valid_keys(self):
        report = check_grounding(
            "test_agent",
            cited_evidence=["avg_slippage_bps", "market_order_count"],
            reasoning_text="execution was fine",
            packet_dict=SAMPLE_PACKET,
        )
        assert report.key_validity_score == 1.0
        assert report.invalid_keys == []
        assert report.has_violations is False

    def test_invalid_key_detected(self):
        """Planted violation: 'invented_metric' does not exist in packet."""
        report = check_grounding(
            "test_agent",
            cited_evidence=["avg_slippage_bps", "invented_metric"],
            reasoning_text="execution was fine",
            packet_dict=SAMPLE_PACKET,
        )
        assert "invented_metric" in report.invalid_keys
        assert report.key_validity_score == 0.5
        assert report.has_violations is True

    def test_empty_cited_evidence(self):
        """Empty cited_evidence should score 1.0 (no claims = no violations)."""
        report = check_grounding(
            "test_agent",
            cited_evidence=[],
            reasoning_text="",
            packet_dict=SAMPLE_PACKET,
        )
        assert report.key_validity_score == 1.0

    def test_all_invalid_keys(self):
        report = check_grounding(
            "test_agent",
            cited_evidence=["fake_a", "fake_b"],
            reasoning_text="",
            packet_dict=SAMPLE_PACKET,
        )
        assert report.key_validity_score == 0.0
        assert len(report.invalid_keys) == 2


class TestFaithfulnessCheck:
    def test_grounded_number(self):
        """Number from packet text → grounded."""
        report = check_grounding(
            "test_agent",
            cited_evidence=[],
            reasoning_text="avg slippage of 8.5 bps observed",
            packet_dict=SAMPLE_PACKET,
        )
        assert "8.5" in report.grounded_tokens
        assert report.faithfulness_score == 1.0
        assert report.has_violations is False

    def test_ungrounded_number_detected(self):
        """Planted violation: 99.9 does not appear in packet."""
        report = check_grounding(
            "test_agent",
            cited_evidence=[],
            reasoning_text="slippage of 99.9 bps is very high",
            packet_dict=SAMPLE_PACKET,
        )
        assert "99.9" in report.ungrounded_tokens
        assert report.faithfulness_score == 0.0
        assert report.has_violations is True

    def test_mixed_grounded_and_ungrounded(self):
        """8.5 is grounded, 99.9 is not → faithfulness = 0.5."""
        report = check_grounding(
            "test_agent",
            cited_evidence=[],
            reasoning_text="slippage of 8.5 bps but also 99.9 bps",
            packet_dict=SAMPLE_PACKET,
        )
        assert abs(report.faithfulness_score - 0.5) < 1e-4

    def test_no_numbers_in_text(self):
        """No numerals → faithfulness = 1.0 (nothing to violate)."""
        report = check_grounding(
            "test_agent",
            cited_evidence=[],
            reasoning_text="execution quality was poor overall",
            packet_dict=SAMPLE_PACKET,
        )
        assert report.faithfulness_score == 1.0
        assert report.numeric_tokens_found == []


class TestCombinedScore:
    def test_perfect_grounding(self):
        report = check_grounding(
            "test_agent",
            cited_evidence=["avg_slippage_bps"],
            reasoning_text="avg slippage is 8.5",
            packet_dict=SAMPLE_PACKET,
        )
        assert report.overall_grounding_score == 1.0
        assert report.has_violations is False

    def test_worst_case(self):
        """Invalid key + ungrounded number → both scores bad."""
        report = check_grounding(
            "test_agent",
            cited_evidence=["nonexistent_key"],
            reasoning_text="slippage of 999.9 is catastrophic",
            packet_dict=SAMPLE_PACKET,
        )
        assert report.key_validity_score == 0.0
        assert report.faithfulness_score == 0.0
        assert report.overall_grounding_score == 0.0
        assert report.has_violations is True


class TestCheckAllVerdicts:
    def test_returns_four_reports(self):
        reports = check_all_verdicts(
            liquidity_cited=["avg_slippage_bps"], liquidity_reasoning="8.5 bps",
            liquidity_packet=SAMPLE_PACKET,
            alpha_cited=["avg_slippage_bps"], alpha_reasoning="execution fine",
            alpha_packet=SAMPLE_PACKET,
            risk_cited=[], risk_reasoning="low risk",
            risk_packet=SAMPLE_PACKET,
            fee_cited=["market_order_count"], fee_reasoning="40 trades",
            fee_packet=SAMPLE_PACKET,
        )
        assert len(reports) == 4
        assert "liquidity_scout" in reports
        assert "fee_optimizer" in reports

    def test_violation_in_one_agent(self):
        """One agent with planted violation — others clean."""
        reports = check_all_verdicts(
            liquidity_cited=["FABRICATED_KEY"], liquidity_reasoning="fine",
            liquidity_packet=SAMPLE_PACKET,
            alpha_cited=["avg_slippage_bps"], alpha_reasoning="fine",
            alpha_packet=SAMPLE_PACKET,
            risk_cited=[], risk_reasoning="fine",
            risk_packet=SAMPLE_PACKET,
            fee_cited=[], fee_reasoning="fine",
            fee_packet=SAMPLE_PACKET,
        )
        assert reports["liquidity_scout"].has_violations is True
        assert reports["alpha_architect"].has_violations is False


class TestSummariseGrounding:
    def test_summary_keys(self):
        reports = check_all_verdicts(
            liquidity_cited=["avg_slippage_bps"], liquidity_reasoning="8.5",
            liquidity_packet=SAMPLE_PACKET,
            alpha_cited=[], alpha_reasoning="fine",
            alpha_packet=SAMPLE_PACKET,
            risk_cited=[], risk_reasoning="fine",
            risk_packet=SAMPLE_PACKET,
            fee_cited=[], fee_reasoning="fine",
            fee_packet=SAMPLE_PACKET,
        )
        summary = summarise_grounding(reports)
        assert "avg_faithfulness_score" in summary
        assert "total_violations" in summary
        assert "per_agent" in summary
        assert len(summary["per_agent"]) == 4

    def test_no_violations_summary(self):
        reports = check_all_verdicts(
            liquidity_cited=[], liquidity_reasoning="fine",
            liquidity_packet=SAMPLE_PACKET,
            alpha_cited=[], alpha_reasoning="fine",
            alpha_packet=SAMPLE_PACKET,
            risk_cited=[], risk_reasoning="fine",
            risk_packet=SAMPLE_PACKET,
            fee_cited=[], fee_reasoning="fine",
            fee_packet=SAMPLE_PACKET,
        )
        summary = summarise_grounding(reports)
        assert summary["total_violations"] == 0
        assert summary["any_violations"] is False
        assert summary["avg_faithfulness_score"] == 1.0

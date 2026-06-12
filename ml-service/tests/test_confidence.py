"""Tests for confidence.py — deterministic evidence-coverage scoring."""
import pytest
from agents.confidence import compute_evidence_coverage, inject_coverage_confidence, ConfidenceResult

SAMPLE_PACKET = {
    "avg_slippage_bps": 8.5,
    "median_slippage_bps": 7.2,
    "p90_slippage_bps": 17.6,
    "market_order_count": 40,
    "adverse_vs_clean_diff_bps": 15.0,
    "worst_hour_utc": 14,
    "best_hour_utc": 8,
    "has_reversion_data": True,
    "reversion_30s_avg_bps": 3.2,
    "content_hash": "abc123",         # metadata — excluded
    "metrics_version": "1.0.0",       # metadata — excluded
    "evidence_counts": {"all": 40},   # metadata — excluded
}
# Available substantive keys = 9 (excluding 3 metadata keys)
AVAILABLE_COUNT = 9


class TestComputeCoverage:
    def test_zero_cited(self):
        result = compute_evidence_coverage([], SAMPLE_PACKET)
        assert result.evidence_coverage == 0.0
        assert result.cited_count == 0
        assert result.available_count == AVAILABLE_COUNT

    def test_all_cited(self):
        substantive = [k for k in SAMPLE_PACKET if k not in
                       {"content_hash", "metrics_version", "evidence_counts"}]
        result = compute_evidence_coverage(substantive, SAMPLE_PACKET)
        assert result.evidence_coverage == 1.0
        assert result.cited_count == AVAILABLE_COUNT

    def test_partial_coverage(self):
        # cite 3 of 9 → 3/9 ≈ 0.3333
        cited = ["avg_slippage_bps", "market_order_count", "worst_hour_utc"]
        result = compute_evidence_coverage(cited, SAMPLE_PACKET)
        assert abs(result.evidence_coverage - 3/AVAILABLE_COUNT) < 1e-4
        assert result.cited_count == 3

    def test_invalid_cited_key_not_counted(self):
        """Cited keys not in packet should not increase coverage."""
        cited = ["avg_slippage_bps", "FABRICATED_KEY_XYZ"]
        result = compute_evidence_coverage(cited, SAMPLE_PACKET)
        assert result.cited_count == 1
        assert abs(result.evidence_coverage - 1/AVAILABLE_COUNT) < 1e-4

    def test_metadata_keys_excluded_from_available(self):
        """content_hash, metrics_version, evidence_counts should not count."""
        result = compute_evidence_coverage([], SAMPLE_PACKET)
        assert result.available_count == AVAILABLE_COUNT
        assert "content_hash" not in result.uncited_keys

    def test_metadata_citation_not_counted(self):
        """Citing a metadata key should not boost coverage."""
        cited = ["content_hash", "metrics_version"]
        result = compute_evidence_coverage(cited, SAMPLE_PACKET)
        assert result.cited_count == 0
        assert result.evidence_coverage == 0.0

    def test_empty_packet(self):
        result = compute_evidence_coverage(["any_key"], {})
        assert result.evidence_coverage == 0.0
        assert result.available_count == 0

    def test_uncited_keys_populated(self):
        cited = ["avg_slippage_bps"]
        result = compute_evidence_coverage(cited, SAMPLE_PACKET)
        assert "avg_slippage_bps" not in result.uncited_keys
        assert "market_order_count" in result.uncited_keys

    def test_deterministic(self):
        """Same input → same score every time."""
        cited = ["avg_slippage_bps", "worst_hour_utc"]
        r1 = compute_evidence_coverage(cited, SAMPLE_PACKET)
        r2 = compute_evidence_coverage(cited, SAMPLE_PACKET)
        assert r1.evidence_coverage == r2.evidence_coverage


class TestInjectCoverage:
    def test_confidence_replaced(self):
        verdict = {"agent": "test", "confidence": 0.9, "cited_evidence": ["avg_slippage_bps"]}
        updated = inject_coverage_confidence(
            verdict, ["avg_slippage_bps"], SAMPLE_PACKET, llm_self_confidence=0.9
        )
        # confidence should now be the deterministic coverage score, not 0.9
        expected_coverage = 1 / AVAILABLE_COUNT
        assert abs(updated["confidence"] - expected_coverage) < 1e-4

    def test_llm_self_confidence_stored(self):
        verdict = {"agent": "test", "confidence": 0.8}
        updated = inject_coverage_confidence(verdict, [], SAMPLE_PACKET, llm_self_confidence=0.8)
        assert updated["llm_self_confidence"] == 0.8

    def test_evidence_detail_added(self):
        verdict = {"agent": "test", "confidence": 0.7}
        updated = inject_coverage_confidence(
            verdict, ["avg_slippage_bps", "worst_hour_utc"], SAMPLE_PACKET, llm_self_confidence=0.7
        )
        assert "evidence_coverage_detail" in updated
        assert updated["evidence_coverage_detail"]["cited_count"] == 2

    def test_original_not_mutated(self):
        verdict = {"agent": "test", "confidence": 0.9}
        original_conf = verdict["confidence"]
        inject_coverage_confidence(verdict, [], SAMPLE_PACKET, llm_self_confidence=0.9)
        assert verdict["confidence"] == original_conf  # original unchanged

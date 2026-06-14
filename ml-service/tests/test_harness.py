"""
Tests for eval harness — leakage assertion is the critical CI check.
"""
import pytest
import asyncio
from eval.harness import assert_no_future_leakage, CUTOFF_DATE


class TestLeakageAssertion:
    def test_clean_trades_pass(self):
        trades = [
            {"id": "t1", "executedAt": "2024-01-10T08:00:00+00:00"},
            {"id": "t2", "executedAt": "2024-01-14T23:59:59+00:00"},
        ]
        result = asyncio.run(assert_no_future_leakage(trades, CUTOFF_DATE))
        assert result is True

    def test_future_trade_raises(self):
        trades = [
            {"id": "t1", "executedAt": "2024-01-10T08:00:00+00:00"},
            {"id": "t2", "executedAt": "2024-01-16T00:00:00+00:00"},  # AFTER cutoff
        ]
        with pytest.raises(AssertionError, match="LEAKAGE DETECTED"):
            asyncio.run(assert_no_future_leakage(trades, CUTOFF_DATE))

    def test_exactly_at_cutoff_raises(self):
        trades = [{"id": "t1", "executedAt": CUTOFF_DATE}]
        with pytest.raises(AssertionError, match="LEAKAGE DETECTED"):
            asyncio.run(assert_no_future_leakage(trades, CUTOFF_DATE))

    def test_empty_list_passes(self):
        result = asyncio.run(assert_no_future_leakage([], CUTOFF_DATE))
        assert result is True

    def test_unparseable_timestamp_skipped(self):
        trades = [{"id": "t1", "executedAt": "not-a-date"}]
        result = asyncio.run(assert_no_future_leakage(trades, CUTOFF_DATE))
        assert result is True

    def test_cutoff_is_jan_15(self):
        assert "2024-01-15" in CUTOFF_DATE

"""
Tests for fee_packet.py — fixture values are hand-computed, not generated.
These tests are the ground truth for the paper's reproducibility claim.
"""
import pytest
from agents.metrics.fee_packet import build_fee_packet, FEE_RATES

# ── Minimal fixture: 5 trades, 2 maker, 3 taker, Binance ──────────────────
# Notionals: 100, 200, 150, 300, 250  → total 1000 USD
# Fees (Binance 0.10% flat): 0.10, 0.20, 0.15, 0.30, 0.25 → total 1.00 USD
# Makers: trades 0 and 3 (isMaker=True), takers: 1, 2, 4
# maker_ratio = 2/5 = 0.4
# fee_drag_bps = (1.00 / 1000) * 10000 = 10.0 bps
# taker_streak: trades 1,2 are consecutive takers → streak = 2, then trade 3 is maker, trade 4 taker → streak 1
# longest_taker_streak = 2 (trades index 1 and 2)
# Counterfactual at 0.50: Binance maker=taker=0.001 → rate_delta=0 → savings=0
# Counterfactual at 0.80: same → savings=0 (Binance flat fee means NO saving from switching to maker)

FIXTURE_BINANCE = [
    {"id": "t1", "isMaker": True,  "feePaid": 0.10, "notionalValue": 100.0, "exchange": "binance"},
    {"id": "t2", "isMaker": False, "feePaid": 0.20, "notionalValue": 200.0, "exchange": "binance"},
    {"id": "t3", "isMaker": False, "feePaid": 0.15, "notionalValue": 150.0, "exchange": "binance"},
    {"id": "t4", "isMaker": True,  "feePaid": 0.30, "notionalValue": 300.0, "exchange": "binance"},
    {"id": "t5", "isMaker": False, "feePaid": 0.25, "notionalValue": 250.0, "exchange": "binance"},
]

# ── OKX fixture: same trades but OKX (maker=0.08%, taker=0.10%) ──────────
# rate_delta = 0.0010 - 0.0008 = 0.0002
# At maker_ratio 0.40, target 0.50: extra_maker_fraction=0.10
#   saved_notional = 1000 * 0.10 = 100
#   saved_usd = 100 * 0.0002 = 0.02
#   saved_bps = 0.02 / 1000 * 10000 = 0.20 bps
# At maker_ratio 0.40, target 0.80: extra_maker_fraction=0.40
#   saved_usd = 1000 * 0.40 * 0.0002 = 0.08
#   saved_bps = 0.08 / 1000 * 10000 = 0.80 bps

FIXTURE_OKX = [
    {"id": "t1", "isMaker": True,  "feePaid": 0.08, "notionalValue": 100.0, "exchange": "okx"},
    {"id": "t2", "isMaker": False, "feePaid": 0.20, "notionalValue": 200.0, "exchange": "okx"},
    {"id": "t3", "isMaker": False, "feePaid": 0.15, "notionalValue": 150.0, "exchange": "okx"},
    {"id": "t4", "isMaker": True,  "feePaid": 0.24, "notionalValue": 300.0, "exchange": "okx"},
    {"id": "t5", "isMaker": False, "feePaid": 0.25, "notionalValue": 250.0, "exchange": "okx"},
]


class TestFeePacketCounts:
    def test_trade_count(self):
        pkt = build_fee_packet(FIXTURE_BINANCE, "u1", "BTCUSDT")
        assert pkt.trade_count == 5

    def test_maker_taker_split(self):
        pkt = build_fee_packet(FIXTURE_BINANCE, "u1", "BTCUSDT")
        assert pkt.maker_count == 2
        assert pkt.taker_count == 3

    def test_maker_ratio(self):
        pkt = build_fee_packet(FIXTURE_BINANCE, "u1", "BTCUSDT")
        assert abs(pkt.maker_ratio - 0.4) < 1e-9

    def test_total_fee(self):
        pkt = build_fee_packet(FIXTURE_BINANCE, "u1", "BTCUSDT")
        assert abs(pkt.total_fee_paid_usd - 1.00) < 1e-6

    def test_fee_drag_bps(self):
        pkt = build_fee_packet(FIXTURE_BINANCE, "u1", "BTCUSDT")
        assert abs(pkt.fee_drag_bps - 10.0) < 1e-6


class TestTakerStreak:
    def test_streak_length(self):
        pkt = build_fee_packet(FIXTURE_BINANCE, "u1", "BTCUSDT")
        assert pkt.longest_taker_streak == 2

    def test_streak_trade_ids(self):
        pkt = build_fee_packet(FIXTURE_BINANCE, "u1", "BTCUSDT")
        assert pkt.taker_streak_trade_ids == ["t2", "t3"]


class TestCounterfactuals:
    def test_binance_zero_savings(self):
        """Binance flat fee: no saving from maker/taker switch."""
        pkt = build_fee_packet(FIXTURE_BINANCE, "u1", "BTCUSDT")
        assert pkt.savings_at_050_usd == 0.0
        assert pkt.savings_at_080_usd == 0.0

    def test_okx_savings_at_050(self):
        pkt = build_fee_packet(FIXTURE_OKX, "u1", "BTCUSDT")
        assert abs(pkt.savings_at_050_usd - 0.02) < 1e-6
        assert abs(pkt.savings_at_050_bps - 0.20) < 1e-6

    def test_okx_savings_at_080(self):
        pkt = build_fee_packet(FIXTURE_OKX, "u1", "BTCUSDT")
        assert abs(pkt.savings_at_080_usd - 0.08) < 1e-6
        assert abs(pkt.savings_at_080_bps - 0.80) < 1e-6

    def test_no_savings_if_already_above_target(self):
        """If current maker_ratio > target, savings should be 0."""
        all_maker = [
            {"id": f"t{i}", "isMaker": True, "feePaid": 0.08, "notionalValue": 100.0, "exchange": "okx"}
            for i in range(5)
        ]
        pkt = build_fee_packet(all_maker, "u1", "BTCUSDT")
        assert pkt.savings_at_050_usd == 0.0
        assert pkt.savings_at_080_usd == 0.0


class TestEvidenceAndIntegrity:
    def test_evidence_index_keys(self):
        pkt = build_fee_packet(FIXTURE_BINANCE, "u1", "BTCUSDT")
        assert "maker_trades" in pkt.evidence_index
        assert "taker_trades" in pkt.evidence_index
        assert "taker_streak" in pkt.evidence_index

    def test_evidence_maker_ids(self):
        pkt = build_fee_packet(FIXTURE_BINANCE, "u1", "BTCUSDT")
        assert set(pkt.evidence_index["maker_trades"]) == {"t1", "t4"}

    def test_content_hash_is_set(self):
        pkt = build_fee_packet(FIXTURE_BINANCE, "u1", "BTCUSDT")
        assert len(pkt.content_hash) == 16

    def test_content_hash_deterministic(self):
        """Same input → same hash (reproducibility guarantee)."""
        pkt1 = build_fee_packet(FIXTURE_BINANCE, "u1", "BTCUSDT")
        pkt2 = build_fee_packet(FIXTURE_BINANCE, "u1", "BTCUSDT")
        assert pkt1.content_hash == pkt2.content_hash

    def test_empty_trades(self):
        pkt = build_fee_packet([], "u1", "BTCUSDT")
        assert pkt.trade_count == 0
        assert pkt.content_hash != ""

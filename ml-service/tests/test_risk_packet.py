"""
Tests for risk_packet.py — fixture values are hand-computed, not generated.
"""
import pytest
from agents.metrics.risk_packet import build_risk_packet, _hhi, _percentile

# ── Fixture: 6 trades across 2 symbols, 2 hours, 2 adverse ──────────────
# Symbols: BTC×4 (notionals 100,200,150,300), ETH×2 (notionals 50,200)
# Total notional = 1000
# BTC fraction = 750/1000 = 0.75, ETH = 250/1000 = 0.25
# symbol_hhi = 0.75^2 + 0.25^2 = 0.5625 + 0.0625 = 0.625
#
# Hours: t1=08, t2=08, t3=14, t4=14, t5=08, t6=14 → hour08=3, hour14=3
# hour_hhi = (0.5)^2 + (0.5)^2 = 0.5
# top_hour: 08 or 14 (tie — either is valid)
#
# Notionals sorted: [50, 100, 150, 200, 200, 300]
# avg = 1000/6 = 166.667
# median (p50): idx=2.5, lo=2(150), hi=3(200), frac=0.5 → 175.0
# p90: idx=4.5, lo=4(200), hi=5(300), frac=0.5 → 250.0
# max = 300
# large (> 2*175=350): none → large_trade_count=0
#
# whale_adverse: t3=True, t6=True → adverse_count=2, adverse_rate=2/6=0.333...
# BTC adverse: t3 only → 1/4=0.25; ETH adverse: t6 only → 1/2=0.5

FIXTURE_TRADES = [
    {"id":"t1","symbol":"BTCUSDT","notionalValue":100.0,"executedAt":"2024-01-15T08:30:00Z","whale_adverse":False},
    {"id":"t2","symbol":"BTCUSDT","notionalValue":200.0,"executedAt":"2024-01-15T08:45:00Z","whale_adverse":False},
    {"id":"t3","symbol":"BTCUSDT","notionalValue":150.0,"executedAt":"2024-01-15T14:10:00Z","whale_adverse":True},
    {"id":"t4","symbol":"BTCUSDT","notionalValue":300.0,"executedAt":"2024-01-15T14:30:00Z","whale_adverse":False},
    {"id":"t5","symbol":"ETHUSDT","notionalValue":50.0, "executedAt":"2024-01-15T08:55:00Z","whale_adverse":False},
    {"id":"t6","symbol":"ETHUSDT","notionalValue":200.0,"executedAt":"2024-01-15T14:50:00Z","whale_adverse":True},
]


class TestHelpers:
    def test_hhi_single(self):
        assert _hhi([1.0]) == 1.0

    def test_hhi_equal_two(self):
        assert abs(_hhi([0.5, 0.5]) - 0.5) < 1e-9

    def test_percentile_median_even(self):
        assert abs(_percentile([1.0, 2.0, 3.0, 4.0], 50) - 2.5) < 1e-9

    def test_percentile_p90(self):
        vals = [float(i) for i in range(1, 11)]  # 1..10
        # p90: idx=8.1, lo=8(9.0), hi=9(10.0), frac=0.1 → 9.1
        assert abs(_percentile(vals, 90) - 9.1) < 1e-9


class TestConcentration:
    def test_symbol_hhi(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.symbol_hhi - 0.625) < 1e-4

    def test_top_symbol(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.top_symbol_by_notional == "BTCUSDT"

    def test_top_symbol_fraction(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.top_symbol_notional_fraction - 0.75) < 1e-4

    def test_hour_hhi(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.hour_hhi - 0.5) < 1e-4

    def test_symbol_shares_sum_to_one(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        total = sum(pkt.symbol_notional_shares.values())
        assert abs(total - 1.0) < 1e-4


class TestSizeDistribution:
    def test_avg(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.avg_trade_usd - 1000.0/6) < 0.01

    def test_median(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.median_trade_usd - 175.0) < 0.01

    def test_p90(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.p90_trade_usd - 250.0) < 0.01

    def test_max(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.max_trade_usd == 300.0

    def test_large_trade_count(self):
        # 2*median=350, no trade exceeds 350
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.large_trade_count == 0


class TestAdverseSelection:
    def test_adverse_count(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.whale_adverse_count == 2

    def test_adverse_rate(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.adverse_rate - 2/6) < 1e-4

    def test_adverse_ids(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert set(pkt.adverse_trade_ids) == {"t3", "t6"}

    def test_adverse_rate_by_symbol_btc(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.adverse_rate_by_symbol.get("BTCUSDT", -1) - 0.25) < 1e-4

    def test_adverse_rate_by_symbol_eth(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.adverse_rate_by_symbol.get("ETHUSDT", -1) - 0.5) < 1e-4


class TestIntegrity:
    def test_hash_deterministic(self):
        pkt1 = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        pkt2 = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt1.content_hash == pkt2.content_hash

    def test_empty_trades(self):
        pkt = build_risk_packet([], "u1", "BTCUSDT")
        assert pkt.total_trades == 0
        assert pkt.symbol_hhi == 0.0
        assert pkt.content_hash != ""

    def test_evidence_index_has_adverse(self):
        pkt = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert "adverse_trades" in pkt.evidence_index
        assert set(pkt.evidence_index["adverse_trades"]) == {"t3", "t6"}

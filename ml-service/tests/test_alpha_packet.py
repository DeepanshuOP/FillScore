"""
Tests for alpha_packet.py — fixture values are hand-computed.
"""
import pytest
from agents.metrics.alpha_packet import build_alpha_packet, _avg, _percentile

# ── Fixture: 6 trades — 3 MARKET with VWAP data, 1 MARKET no VWAP, 2 LIMIT
#
# MARKET trades with VWAP:
#   t1: BUY,  exec=100.5, vwap=100.0 → dev=(100.5-100)/100*10000*1 = +50.0 bps, score=70, sym=BTC, hour=08
#   t2: BUY,  exec=99.0,  vwap=100.0 → dev=(99-100)/100*10000*1   = -100.0 bps, score=85, sym=BTC, hour=14
#   t3: SELL, exec=98.0,  vwap=100.0 → dev=(98-100)/100*10000*(-1) = +200.0 bps, score=50, sym=ETH, hour=08
# MARKET trade WITHOUT VWAP data:
#   t4: BUY, no vwap5m, score=60, sym=ETH, hour=14
# LIMIT trades (excluded from VWAP calc, included in symbol/hour score):
#   t5: score=90, sym=BTC, hour=08
#   t6: score=55, sym=ETH, hour=14
#
# VWAP deviations: [50.0, -100.0, 200.0]
# sorted: [-100.0, 50.0, 200.0]
# avg = (50 - 100 + 200) / 3 = 150/3 = 50.0
# median (p50 of 3): idx=1.0 → exactly sorted[1] = 50.0
# pct_beating_vwap = 1/3 ≈ 0.3333 (only t2 is negative)
# worst5 by deviation desc: [200.0(t3), 50.0(t1), -100.0(t2)]
#
# Symbol fill scores (ALL trades):
#   BTC: t1=70, t2=85, t5=90 → avg = 245/3 ≈ 81.6667
#   ETH: t3=50, t4=60, t6=55 → avg = 165/3 = 55.0
#   best_symbol = BTC, worst_symbol = ETH
#
# Hour fill scores (ALL trades):
#   08: t1=70, t3=50, t5=90 → avg = 210/3 = 70.0
#   14: t2=85, t4=60, t6=55 → avg = 200/3 ≈ 66.6667
#   best_hour = 08, worst_hour = 14

FIXTURE_TRADES = [
    {"id":"t1","orderType":"MARKET","isMaker":False,"fillScore":70.0,
     "symbol":"BTCUSDT","executedAt":"2024-01-15T08:30:00Z","side":"BUY",
     "executionPrice":100.5,"vwap5m":100.0},
    {"id":"t2","orderType":"MARKET","isMaker":False,"fillScore":85.0,
     "symbol":"BTCUSDT","executedAt":"2024-01-15T14:10:00Z","side":"BUY",
     "executionPrice":99.0,"vwap5m":100.0},
    {"id":"t3","orderType":"MARKET","isMaker":False,"fillScore":50.0,
     "symbol":"ETHUSDT","executedAt":"2024-01-15T08:45:00Z","side":"SELL",
     "executionPrice":98.0,"vwap5m":100.0},
    {"id":"t4","orderType":"MARKET","isMaker":False,"fillScore":60.0,
     "symbol":"ETHUSDT","executedAt":"2024-01-15T14:30:00Z","side":"BUY"},
    {"id":"t5","orderType":"LIMIT","isMaker":True,"fillScore":90.0,
     "symbol":"BTCUSDT","executedAt":"2024-01-15T08:55:00Z","side":"BUY"},
    {"id":"t6","orderType":"LIMIT","isMaker":False,"fillScore":55.0,
     "symbol":"ETHUSDT","executedAt":"2024-01-15T14:50:00Z","side":"SELL"},
]


class TestHelpers:
    def test_avg_empty(self):
        assert _avg([]) == 0.0

    def test_avg_mixed(self):
        assert abs(_avg([50.0, -100.0, 200.0]) - 50.0) < 1e-9


class TestOrderSplit:
    def test_market_count(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.market_order_count == 4

    def test_vwap_count(self):
        # only t1, t2, t3 have vwap5m data
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.vwap_trades_count == 3


class TestVwapDeviation:
    def test_avg_deviation(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.avg_vwap_deviation_bps - 50.0) < 1e-4

    def test_median_deviation(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.median_vwap_deviation_bps - 50.0) < 1e-4

    def test_pct_beating_vwap(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.pct_beating_vwap - 1/3) < 1e-4

    def test_worst5_first_is_t3(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.worst5_vwap_trade_ids[0] == "t3"
        assert abs(pkt.worst5_vwap_deviation_bps[0] - 200.0) < 1e-4

    def test_no_vwap_data(self):
        trades = [{"id":"x1","orderType":"MARKET","isMaker":False,
                   "fillScore":70.0,"symbol":"BTCUSDT",
                   "executedAt":"2024-01-15T08:00:00Z"}]
        pkt = build_alpha_packet(trades, "u1", "BTCUSDT")
        assert pkt.vwap_trades_count == 0
        assert pkt.avg_vwap_deviation_bps == 0.0


class TestSymbolRanking:
    def test_best_symbol(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.best_symbol == "BTCUSDT"

    def test_worst_symbol(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.worst_symbol == "ETHUSDT"

    def test_btc_avg_score(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.symbol_avg_fill_score.get("BTCUSDT", -1) - 245/3) < 0.01

    def test_eth_avg_score(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.symbol_avg_fill_score.get("ETHUSDT", -1) - 55.0) < 0.01


class TestHourRanking:
    def test_best_hour(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.best_hour_utc == 8

    def test_worst_hour(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.worst_hour_utc == 14

    def test_hour_08_avg(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.hour_avg_fill_score.get("08", -1) - 70.0) < 0.01

    def test_hour_14_avg(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.hour_avg_fill_score.get("14", -1) - 200/3) < 0.01


class TestIntegrity:
    def test_hash_deterministic(self):
        pkt1 = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        pkt2 = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt1.content_hash == pkt2.content_hash

    def test_empty_trades(self):
        pkt = build_alpha_packet([], "u1", "BTCUSDT")
        assert pkt.market_order_count == 0
        assert pkt.content_hash != ""

    def test_evidence_index_keys(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert "vwap_trades" in pkt.evidence_index
        assert "worst5_vwap_trades" in pkt.evidence_index

    def test_worst5_in_evidence_matches_field(self):
        pkt = build_alpha_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.evidence_index["worst5_vwap_trades"] == pkt.worst5_vwap_trade_ids

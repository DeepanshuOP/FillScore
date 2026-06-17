"""
Tests for liquidity_packet.py — fixture values are hand-computed.
"""
import pytest
from agents.metrics.liquidity_packet import build_liquidity_packet, _avg, _percentile

# ── Fixture: 7 trades — 4 MARKET, 3 LIMIT ────────────────────────────────
# MARKET trades (used in slippage stats):
#   t1: slip=5.0,  hour=08, whale_adverse=False, rev30=2.0,  rev60=3.0
#   t2: slip=12.0, hour=14, whale_adverse=True,  rev30=8.0,  rev60=10.0
#   t3: slip=-3.0, hour=08, whale_adverse=False, rev30=-1.0, rev60=-2.0
#   t4: slip=20.0, hour=14, whale_adverse=True,  rev30=15.0, rev60=18.0
# LIMIT trades (excluded from slippage):
#   t5: isMaker=True
#   t6: orderType=LIMIT
#   t7: isMaker=True
#
# market_count=4, limit_count=3
# slippages: [5.0, 12.0, -3.0, 20.0]
# sorted: [-3.0, 5.0, 12.0, 20.0]
# avg = (5+12-3+20)/4 = 34/4 = 8.5
# median (p50): idx=1.5 → lo=1(5.0), hi=2(12.0), frac=0.5 → 8.5
# p90: idx=2.7 → lo=2(12.0), hi=3(20.0), frac=0.7 → 12+0.7*8=17.6
# pct_negative = 1/4 = 0.25 (only t3)
# worst5 by slippage: [20.0(t4), 12.0(t2), 5.0(t1), -3.0(t3)]
#
# hour slippage: 08→[5.0,-3.0] avg=1.0; 14→[12.0,20.0] avg=16.0
# worst_hour=14, best_hour=08
#
# adverse slips: t2=12.0, t4=20.0 → avg=16.0
# clean slips: t1=5.0, t3=-3.0 → avg=1.0
# diff = 16.0 - 1.0 = 15.0
#
# reversion: all 4 market trades have data
# rev30 avg = (2+8-1+15)/4 = 24/4 = 6.0
# rev60 avg = (3+10-2+18)/4 = 29/4 = 7.25

FIXTURE_TRADES = [
    {"id":"t1","orderType":"MARKET","isMaker":False,"arrivalSlippageBps":5.0,
     "executedAt":"2024-01-15T08:30:00Z","whaleAdverse":False,
     "reversion_30s_bps":2.0,"reversion_60s_bps":3.0},
    {"id":"t2","orderType":"MARKET","isMaker":False,"arrivalSlippageBps":12.0,
     "executedAt":"2024-01-15T14:10:00Z","whaleAdverse":True,
     "reversion_30s_bps":8.0,"reversion_60s_bps":10.0},
    {"id":"t3","orderType":"MARKET","isMaker":False,"arrivalSlippageBps":-3.0,
     "executedAt":"2024-01-15T08:45:00Z","whaleAdverse":False,
     "reversion_30s_bps":-1.0,"reversion_60s_bps":-2.0},
    {"id":"t4","orderType":"MARKET","isMaker":False,"arrivalSlippageBps":20.0,
     "executedAt":"2024-01-15T14:30:00Z","whaleAdverse":True,
     "reversion_30s_bps":15.0,"reversion_60s_bps":18.0},
    {"id":"t5","orderType":"MARKET","isMaker":True, "arrivalSlippageBps":1.0,
     "executedAt":"2024-01-15T10:00:00Z","whaleAdverse":False},
    {"id":"t6","orderType":"LIMIT", "isMaker":False,"arrivalSlippageBps":0.5,
     "executedAt":"2024-01-15T11:00:00Z","whaleAdverse":False},
    {"id":"t7","orderType":"MARKET","isMaker":True, "arrivalSlippageBps":2.0,
     "executedAt":"2024-01-15T12:00:00Z","whaleAdverse":False},
]


class TestHelpers:
    def test_avg_empty(self):
        assert _avg([]) == 0.0

    def test_avg_basic(self):
        assert abs(_avg([1.0, 2.0, 3.0]) - 2.0) < 1e-9

    def test_percentile_single(self):
        assert _percentile([5.0], 50) == 5.0


class TestOrderSplit:
    def test_market_count(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.market_order_count == 4

    def test_limit_count(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.limit_order_count == 3

    def test_limit_excluded_from_slippage(self):
        # If only limit orders, slippage stats should be zero
        limit_only = [
            {"id":"x1","orderType":"LIMIT","isMaker":False,
             "arrivalSlippageBps":99.0,"executedAt":"2024-01-15T08:00:00Z"}
        ]
        pkt = build_liquidity_packet(limit_only, "u1", "BTCUSDT")
        assert pkt.market_order_count == 0
        assert pkt.avg_slippage_bps == 0.0


class TestSlippageStats:
    def test_avg_slippage(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.avg_slippage_bps - 8.5) < 1e-4

    def test_median_slippage(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.median_slippage_bps - 8.5) < 1e-4

    def test_p90_slippage(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.p90_slippage_bps - 17.6) < 1e-4

    def test_pct_negative(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.pct_negative_slippage - 0.25) < 1e-4

    def test_worst5_first_is_t4(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.worst5_trade_ids[0] == "t4"
        assert abs(pkt.worst5_slippage_bps[0] - 20.0) < 1e-4


class TestHourlySlippage:
    def test_worst_hour(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.worst_hour_utc == 14

    def test_best_hour(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.best_hour_utc == 8

    def test_hour_08_avg(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.avg_slippage_by_hour.get("08", -99) - 1.0) < 1e-4

    def test_hour_14_avg(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.avg_slippage_by_hour.get("14", -99) - 16.0) < 1e-4


class TestAdverseVsClean:
    def test_adverse_avg(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.adverse_slippage_avg_bps - 16.0) < 1e-4

    def test_clean_avg(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.clean_slippage_avg_bps - 1.0) < 1e-4

    def test_diff(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.adverse_vs_clean_diff_bps - 15.0) < 1e-4

    def test_adverse_count(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.adverse_market_count == 2

    def test_clean_count(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.clean_market_count == 2


class TestReversion:
    def test_has_reversion_data(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.has_reversion_data is True

    def test_reversion_count(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt.reversion_trade_count == 4

    def test_reversion_30s_avg(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.reversion_30s_avg_bps - 6.0) < 1e-4

    def test_reversion_60s_avg(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert abs(pkt.reversion_60s_avg_bps - 7.25) < 1e-4

    def test_no_reversion_data_flag(self):
        no_rev = [{"id":"x1","orderType":"MARKET","isMaker":False,
                   "arrivalSlippageBps":5.0,"executedAt":"2024-01-15T08:00:00Z"}]
        pkt = build_liquidity_packet(no_rev, "u1", "BTCUSDT")
        assert pkt.has_reversion_data is False
        assert pkt.reversion_30s_avg_bps == 0.0


class TestIntegrity:
    def test_hash_deterministic(self):
        pkt1 = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        pkt2 = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert pkt1.content_hash == pkt2.content_hash

    def test_empty_trades(self):
        pkt = build_liquidity_packet([], "u1", "BTCUSDT")
        assert pkt.market_order_count == 0
        assert pkt.content_hash != ""

    def test_evidence_worst5_in_index(self):
        pkt = build_liquidity_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
        assert "worst5_trades" in pkt.evidence_index
        assert pkt.evidence_index["worst5_trades"][0] == "t4"

"""
T2.12 — whale_score.py tests.

RED → GREEN cycle. All fixtures are hand-built DataFrames — zero network calls.

Direction convention (mirrors implementation):
  is_buyer_maker == False  →  taker BUY  →  +notional
  is_buyer_maker == True   →  taker SELL →  -notional
"""

import math
import pandas as pd
import pytest
from whale.whale_score import score_whale_window

# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

def make_df(rows: list) -> pd.DataFrame:
    """Build an aggTrades DataFrame from a list of tuples."""
    return pd.DataFrame(
        rows,
        columns=["agg_trade_id", "price", "quantity", "transact_time_ms", "is_buyer_maker"],
    )


# Shared constants
WHALE_THRESH = 250_000.0
BURST_GAP    = 1_000          # ms
TAU          = 10.0           # seconds
TRADE_TS     = 1_704_150_000_000  # arbitrary Jan 2024 anchor (ms)


# ---------------------------------------------------------------------------
# net_pressure tests
# ---------------------------------------------------------------------------

class TestNetPressure:

    def test_empty_df_returns_all_zeros_no_crash(self):
        """Empty window must return zeroed dict, no exception."""
        result = score_whale_window(make_df([]), TRADE_TS, "BUY")
        assert result["net_pressure"] == 0.0
        assert result["whale_pressure"] == 0.0
        assert result["whale_event_count"] == 0
        assert result["adverse"] is False
        assert result["nearest_whale_s"] is None
        assert result["largest_whale_notional"] == 0.0
        assert result["whale_events"] == []

    def test_all_aggressive_buys_net_pressure_is_plus_one(self):
        """All taker BUYs (is_buyer_maker=False) → net_pressure == +1."""
        df = make_df([
            (1, 43_000.0, 0.5, TRADE_TS - 5_000, False),
            (2, 43_000.0, 1.0, TRADE_TS - 3_000, False),
            (3, 43_000.0, 0.3, TRADE_TS + 2_000, False),
        ])
        result = score_whale_window(df, TRADE_TS, "BUY")
        assert abs(result["net_pressure"] - 1.0) < 1e-9

    def test_all_aggressive_sells_net_pressure_is_minus_one(self):
        """All taker SELLs (is_buyer_maker=True) → net_pressure == -1."""
        df = make_df([
            (1, 43_000.0, 0.5, TRADE_TS - 5_000, True),
            (2, 43_000.0, 1.0, TRADE_TS - 3_000, True),
        ])
        result = score_whale_window(df, TRADE_TS, "SELL")
        assert abs(result["net_pressure"] - (-1.0)) < 1e-9

    def test_symmetric_window_net_pressure_near_zero(self):
        """Equal buy and sell notional → net_pressure == 0."""
        df = make_df([
            (1, 43_000.0, 1.0, TRADE_TS - 5_000, False),   # +43 000 USD
            (2, 43_000.0, 1.0, TRADE_TS - 4_000, True),    # -43 000 USD
        ])
        result = score_whale_window(df, TRADE_TS, "BUY")
        assert abs(result["net_pressure"]) < 1e-9


# ---------------------------------------------------------------------------
# Whale burst detection tests
# ---------------------------------------------------------------------------

class TestWhaleBursts:

    def test_burst_just_over_threshold_is_one_whale_event(self):
        """
        3 consecutive BUY rows within burst_gap_ms, total notional = $250 001
        → exactly 1 whale event on the BUY side.
        """
        q1 = 100_000 / 43_000   # notional = $100 000
        q2 = 100_000 / 43_000
        q3 =  50_001 / 43_000   # notional = $50 001
        df = make_df([
            (1, 43_000.0, q1, TRADE_TS - 1_000, False),   # t-1000ms
            (2, 43_000.0, q2, TRADE_TS -   600, False),   # gap 400ms ≤ 1000ms
            (3, 43_000.0, q3, TRADE_TS -   100, False),   # gap 500ms ≤ 1000ms
        ])
        result = score_whale_window(
            df, TRADE_TS, "BUY",
            whale_notional_usd=WHALE_THRESH,
            burst_gap_ms=BURST_GAP,
        )
        assert result["whale_event_count"] == 1
        evt = result["whale_events"][0]
        assert evt["side"] == "BUY"
        assert abs(evt["notional"] - 250_001) < 1.0   # float tolerance

    def test_burst_just_under_threshold_is_zero_events(self):
        """Same structure, total notional = $249 999 → no whale events."""
        q1 = 100_000 / 43_000
        q2 = 100_000 / 43_000
        q3 =  49_999 / 43_000   # $49 999
        df = make_df([
            (1, 43_000.0, q1, TRADE_TS - 1_000, False),
            (2, 43_000.0, q2, TRADE_TS -   600, False),
            (3, 43_000.0, q3, TRADE_TS -   100, False),
        ])
        result = score_whale_window(
            df, TRADE_TS, "BUY",
            whale_notional_usd=WHALE_THRESH,
            burst_gap_ms=BURST_GAP,
        )
        assert result["whale_event_count"] == 0

    def test_two_same_direction_bursts_separated_by_large_gap_are_two_events(self):
        """
        Two BUY rows each meeting the threshold, separated by 2000ms > burst_gap_ms=1000ms
        → treated as 2 separate bursts → 2 whale events.
        """
        q = WHALE_THRESH / 43_000   # exactly at threshold in one trade
        df = make_df([
            (1, 43_000.0, q, TRADE_TS - 10_000, False),   # burst 1
            (2, 43_000.0, q, TRADE_TS -  8_000, False),   # gap 2000ms > 1000ms → burst 2
        ])
        result = score_whale_window(
            df, TRADE_TS, "BUY",
            whale_notional_usd=WHALE_THRESH,
            burst_gap_ms=BURST_GAP,
        )
        assert result["whale_event_count"] == 2


# ---------------------------------------------------------------------------
# Proximity and adversity tests
# ---------------------------------------------------------------------------

class TestProximityAndAdversity:

    def _single_whale_df(self, ts_ms: int, is_buyer_maker: bool, notional: float = 300_000) -> pd.DataFrame:
        """Single-row burst that qualifies as a whale."""
        qty = notional / 43_000.0
        return make_df([(1, 43_000.0, qty, ts_ms, is_buyer_maker)])

    def test_closer_whale_yields_larger_abs_whale_pressure(self):
        """
        A BUY whale at seconds_from_trade=0 must score higher than one at 25s.
        exp(-0/10) = 1.0 > exp(-25/10) ≈ 0.082.
        """
        df_close = self._single_whale_df(TRADE_TS,          False)   # 0s away
        df_far   = self._single_whale_df(TRADE_TS + 25_000, False)   # 25s away

        r_close = score_whale_window(df_close, TRADE_TS, "BUY", tau_s=TAU)
        r_far   = score_whale_window(df_far,   TRADE_TS, "BUY", tau_s=TAU)

        assert abs(r_close["whale_pressure"]) > abs(r_far["whale_pressure"])

    def test_buy_whale_near_user_buy_is_adverse(self):
        """
        BUY whale pushes price up → adverse for a user trying to BUY.
        adverse_score = whale_pressure > 0 when trade_side='BUY'.
        """
        df = self._single_whale_df(TRADE_TS, False)   # BUY whale
        result = score_whale_window(df, TRADE_TS, "BUY")
        assert result["adverse"] is True
        assert result["adverse_score"] > 0

    def test_buy_whale_near_user_sell_is_not_adverse(self):
        """
        BUY whale is NOT adverse for a user SELLING.
        adverse_score = -whale_pressure ≤ 0 when trade_side='SELL'.
        """
        df = self._single_whale_df(TRADE_TS, False)   # BUY whale
        result = score_whale_window(df, TRADE_TS, "SELL")
        assert result["adverse"] is False
        assert result["adverse_score"] <= 0

    def test_nearest_whale_s_is_absolute_seconds_to_event(self):
        """A whale 15 000ms after trade_ts_ms → nearest_whale_s ≈ 15.0."""
        ts_whale = TRADE_TS + 15_000
        df = self._single_whale_df(ts_whale, False)
        result = score_whale_window(df, TRADE_TS, "BUY")
        assert result["nearest_whale_s"] is not None
        assert abs(result["nearest_whale_s"] - 15.0) < 0.001

    def test_largest_whale_notional_is_max_event_notional(self):
        """largest_whale_notional must equal the largest event's notional."""
        df = self._single_whale_df(TRADE_TS, False, notional=300_000)
        result = score_whale_window(df, TRADE_TS, "BUY")
        assert abs(result["largest_whale_notional"] - 300_000) < 1.0

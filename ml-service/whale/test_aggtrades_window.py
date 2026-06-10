"""
T2.12 feasibility spike — aggTrades window fetch.

RED → GREEN → REFACTOR cycle.
Real timestamps from demo-aggressive, BTCUSDT, seeded from Jan 2024 Binance data.
"""

import pytest
import pandas as pd
from whale.aggtrades_window import fetch_aggtrades_window

# ---------------------------------------------------------------------------
# Real timestamps from Atlas (demo-aggressive, BTCUSDT, sorted ascending)
# Obtained via: db.trades.find({userId:'demo-aggressive',symbol:'BTCUSDT'}).sort({executedAt:1}).limit(3)
# ---------------------------------------------------------------------------
SAMPLE_TIMESTAMPS_MS = [
    1704150022751,  # 2024-01-01T23:00:22.751Z
    1704156552762,  # 2024-01-02T00:49:12.762Z
    1704319238295,  # 2024-01-03T22:00:38.295Z
]
SYMBOL = "BTCUSDT"
HALF_WINDOW_S = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _assert_valid_window(df: pd.DataFrame, center_ms: int) -> None:
    """Shared structural assertions for every window DataFrame."""
    assert isinstance(df, pd.DataFrame), "return type must be pd.DataFrame"
    assert not df.empty, f"DataFrame must not be empty for center_ms={center_ms}"

    required_cols = {"agg_trade_id", "price", "quantity", "transact_time_ms", "is_buyer_maker"}
    assert required_cols.issubset(df.columns), (
        f"Missing columns: {required_cols - set(df.columns)}"
    )

    lo = center_ms - HALF_WINDOW_S * 1000
    hi = center_ms + HALF_WINDOW_S * 1000

    # transact_time_ms must be integer milliseconds (not microseconds)
    assert df["transact_time_ms"].dtype in (
        "int64", "int32", "int16", "int8"
    ), "transact_time_ms must be an integer dtype"

    out_of_window = df[
        (df["transact_time_ms"] < lo) | (df["transact_time_ms"] > hi)
    ]
    assert out_of_window.empty, (
        f"Found {len(out_of_window)} rows outside [{lo}, {hi}]: "
        f"{out_of_window['transact_time_ms'].tolist()[:5]}"
    )

    assert (df["price"] > 0).all(), "All prices must be positive"
    assert (df["quantity"] > 0).all(), "All quantities must be positive"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestFetchAggtrades:

    def test_returns_dataframe_for_first_timestamp(self):
        """fetch_aggtrades_window returns a non-empty DataFrame for a real Jan 2024 trade."""
        center_ms = SAMPLE_TIMESTAMPS_MS[0]
        df = fetch_aggtrades_window(SYMBOL, center_ms, HALF_WINDOW_S)
        _assert_valid_window(df, center_ms)

    def test_returns_dataframe_for_second_timestamp(self):
        """Consistent results for a different Jan 2024 trade."""
        center_ms = SAMPLE_TIMESTAMPS_MS[1]
        df = fetch_aggtrades_window(SYMBOL, center_ms, HALF_WINDOW_S)
        _assert_valid_window(df, center_ms)

    def test_returns_dataframe_for_third_timestamp(self):
        """Consistent results for a Jan 3 2024 trade."""
        center_ms = SAMPLE_TIMESTAMPS_MS[2]
        df = fetch_aggtrades_window(SYMBOL, center_ms, HALF_WINDOW_S)
        _assert_valid_window(df, center_ms)

    def test_sample_output_and_whale_notional(self, capsys):
        """
        Not a real assertion test — prints human-readable summary for the first timestamp.
        Eyeballs that real whale-sized orders exist in the window.
        """
        center_ms = SAMPLE_TIMESTAMPS_MS[0]
        df = fetch_aggtrades_window(SYMBOL, center_ms, HALF_WINDOW_S)

        df["notional"] = df["price"] * df["quantity"]
        max_notional = df["notional"].max()
        count = len(df)

        print(
            f"\n[SAMPLE OUTPUT] center_ms={center_ms} "
            f"({pd.Timestamp(center_ms, unit='ms', tz='UTC')})\n"
            f"  aggTrades in ±{HALF_WINDOW_S}s window : {count}\n"
            f"  Largest single notional (USD)        : ${max_notional:,.2f}\n"
        )

        # Weak assertion — just confirms something plausible came back
        assert count > 0
        assert max_notional > 0


# ---------------------------------------------------------------------------
# Pagination tests (RED → GREEN)
# ---------------------------------------------------------------------------

# Known busy window: 2024-01-01 23:00:22 UTC — the previous run returned
# exactly 1000 rows (REST cap), proving the window was truncated.
BUSY_CENTER_MS = 1704150022751  # 2024-01-01T23:00:22.751Z


class TestPagination:

    def test_busy_window_returns_more_than_1000_rows(self):
        """
        Pagination is engaged when REST returns exactly 1000 rows.
        The complete ±30s window around this busy timestamp MUST have
        more than 1000 aggTrades — confirming the cap was previously
        hiding data.
        This test FAILS against the un-paginated implementation (count == 1000).
        """
        df = fetch_aggtrades_window(SYMBOL, BUSY_CENTER_MS, HALF_WINDOW_S)
        assert len(df) > 1000, (
            f"Expected >1000 rows for busy window (pagination should have engaged), "
            f"got {len(df)} — pagination is not working"
        )

    def test_busy_window_all_agg_trade_ids_unique(self):
        """No duplicate agg_trade_ids across page boundaries."""
        df = fetch_aggtrades_window(SYMBOL, BUSY_CENTER_MS, HALF_WINDOW_S)
        dupes = df["agg_trade_id"].duplicated().sum()
        assert dupes == 0, f"Found {dupes} duplicate agg_trade_ids"

    def test_busy_window_all_timestamps_in_range(self):
        """Every row's transact_time_ms must be within [center-30000, center+30000]."""
        lo = BUSY_CENTER_MS - HALF_WINDOW_S * 1000
        hi = BUSY_CENTER_MS + HALF_WINDOW_S * 1000
        df = fetch_aggtrades_window(SYMBOL, BUSY_CENTER_MS, HALF_WINDOW_S)
        out = df[(df["transact_time_ms"] < lo) | (df["transact_time_ms"] > hi)]
        assert out.empty, (
            f"{len(out)} rows outside [{lo}, {hi}]: "
            f"{out['transact_time_ms'].tolist()[:5]}"
        )

    def test_busy_window_sorted_ascending_by_transact_time(self):
        """Rows must be sorted ascending by transact_time_ms."""
        df = fetch_aggtrades_window(SYMBOL, BUSY_CENTER_MS, HALF_WINDOW_S)
        times = df["transact_time_ms"].tolist()
        assert times == sorted(times), "Rows are not sorted ascending by transact_time_ms"

    def test_busy_window_print_whale_summary(self, capsys):
        """Print final row count and largest notional for human eyeballing."""
        df = fetch_aggtrades_window(SYMBOL, BUSY_CENTER_MS, HALF_WINDOW_S)
        df["notional"] = df["price"] * df["quantity"]
        max_notional = df["notional"].max()
        count = len(df)
        whale_rows = df[df["notional"] >= 100_000]

        print(
            f"\n[PAGINATION SUMMARY] center_ms={BUSY_CENTER_MS} "
            f"(2024-01-01 23:00:22 UTC)\n"
            f"  Total aggTrades in complete ±30s window : {count}\n"
            f"  Largest single-aggTrade notional (USD)  : ${max_notional:,.2f}\n"
            f"  Whale trades (>=$100k notional)          : {len(whale_rows)}\n"
        )
        assert count > 0
        assert max_notional > 0

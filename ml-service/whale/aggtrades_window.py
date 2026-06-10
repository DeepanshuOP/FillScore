"""
fetch_aggtrades_window — T2.12 feasibility spike.

Primary path  : Binance REST /api/v3/aggTrades (startTime/endTime).
Fallback path : Daily archive zip from data.binance.vision, cached locally.

Jan 2024 BTCUSDT SPOT aggTrades use MILLISECOND timestamps (microsecond
switch happened 2025-01-01). The 'T' field from the REST API is already ms.
"""

from __future__ import annotations

import hashlib
import io
import os
import time
import zipfile
from pathlib import Path
from datetime import datetime, timezone

import pandas as pd
import requests

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_REST_URL = "https://api.binance.com/api/v3/aggTrades"
_ARCHIVE_BASE = "https://data.binance.vision/data/spot/daily/aggTrades"
_CACHE_DIR = Path(__file__).parent / ".cache"

_REST_COLUMNS = {
    "a": "agg_trade_id",
    "p": "price",
    "q": "quantity",
    "T": "transact_time_ms",
    "m": "is_buyer_maker",
}

_ARCHIVE_COLUMNS = [
    "agg_trade_id",
    "price",
    "quantity",
    "first_trade_id",
    "last_trade_id",
    "transact_time_ms",
    "is_buyer_maker",
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fetch_aggtrades_window(
    symbol: str,
    center_ts_ms: int,
    half_window_s: int = 30,
) -> pd.DataFrame:
    """
    Return aggTrades for *symbol* in [center_ts_ms - half_window_s*1000,
    center_ts_ms + half_window_s*1000].

    Columns: agg_trade_id, price, quantity, transact_time_ms, is_buyer_maker
    transact_time_ms is int64 Unix milliseconds.

    WHY two paths: Binance REST /aggTrades with startTime/endTime only works
    for data < 1 hour old in practice (or very recent history). For archived
    Jan 2024 data it silently returns [] — hence the archive fallback.
    """
    start_ms = center_ts_ms - half_window_s * 1000
    end_ms = center_ts_ms + half_window_s * 1000

    # ── Primary: REST ───────────────────────────────────────────────────────
    df = _try_rest(symbol, start_ms, end_ms)
    if not df.empty:
        print(f"[aggtrades_window] DATA PATH: REST  center={center_ts_ms}")
        return df

    # ── Fallback: daily archive ──────────────────────────────────────────────
    # center_ts_ms is in ms; convert to UTC date for the archive filename
    center_dt = datetime.fromtimestamp(center_ts_ms / 1000, tz=timezone.utc)
    date_str = center_dt.strftime("%Y-%m-%d")
    print(
        f"[aggtrades_window] REST empty → falling back to archive "
        f"for {symbol} {date_str}"
    )
    df = _load_archive(symbol, date_str)
    mask = (df["transact_time_ms"] >= start_ms) & (df["transact_time_ms"] <= end_ms)
    result = df.loc[mask].reset_index(drop=True)
    print(
        f"[aggtrades_window] DATA PATH: ARCHIVE  center={center_ts_ms}  "
        f"rows_in_window={len(result)}"
    )
    return result


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _try_rest(symbol: str, start_ms: int, end_ms: int) -> pd.DataFrame:
    """
    Call the Binance REST aggTrades endpoint with automatic pagination.

    WHY pagination is required: Binance caps each response at 1000 rows.
    High-volume windows (e.g. BTCUSDT at 23:00 UTC Jan 2024) can contain
    several thousand aggTrades in a ±30s span, so we must page forward
    via fromId until no rows inside the window remain.

    Pagination protocol:
      1. First call: time-range [start_ms, end_ms], limit=1000.
      2. If <1000 rows returned → window is complete.
      3. If exactly 1000 rows → page forward: call with
         fromId = last_agg_trade_id + 1, limit=1000, no time params.
         Append rows whose transact_time_ms <= end_ms, stop when
         the first row of a page exceeds end_ms or page is <1000 rows.
      4. Deduplicate by agg_trade_id, trim to [start_ms, end_ms],
         sort ascending by transact_time_ms.
      5. Sleep 150ms between paged calls (rate-limit politeness).

    Returns empty DataFrame on any request failure.
    """
    # ── First call: time-range anchor ────────────────────────────────────────
    try:
        resp = requests.get(
            _REST_URL,
            params={
                "symbol": symbol,
                "startTime": start_ms,
                "endTime": end_ms,
                "limit": 1000,
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return pd.DataFrame()

    if not data:
        return pd.DataFrame()

    pages: list[pd.DataFrame] = [_parse_rest_page(data)]

    # ── Paginate forward while the last page was full ─────────────────────────
    # WHY check len == 1000: only a full page can be truncated; a partial page
    # means Binance has no more data in this range.
    while len(data) == 1000:
        last_id = pages[-1]["agg_trade_id"].iloc[-1]
        time.sleep(0.15)  # 150ms politeness delay between paged calls
        try:
            resp = requests.get(
                _REST_URL,
                params={
                    "symbol": symbol,
                    "fromId": int(last_id) + 1,
                    "limit": 1000,
                },
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            break

        if not data:
            break

        page_df = _parse_rest_page(data)

        # Stop if the very first row of this page is already past the window.
        # WHY check first row only: rows are ordered by agg_trade_id which is
        # monotonically increasing with time, so the first row has the earliest ts.
        if page_df["transact_time_ms"].iloc[0] > end_ms:
            break

        pages.append(page_df)

    # ── Merge, deduplicate, trim, sort ───────────────────────────────────────
    combined = pd.concat(pages, ignore_index=True)
    combined = combined.drop_duplicates(subset="agg_trade_id")
    combined = combined[
        (combined["transact_time_ms"] >= start_ms)
        & (combined["transact_time_ms"] <= end_ms)
    ]
    combined = combined.sort_values("transact_time_ms").reset_index(drop=True)
    return combined


def _parse_rest_page(data: list) -> pd.DataFrame:
    """Convert a raw REST aggTrades JSON list to a typed DataFrame."""
    df = pd.DataFrame(data).rename(columns=_REST_COLUMNS)[list(_REST_COLUMNS.values())]
    df["price"] = df["price"].astype(float)
    df["quantity"] = df["quantity"].astype(float)
    df["transact_time_ms"] = df["transact_time_ms"].astype("int64")
    return df


def _load_archive(symbol: str, date_str: str) -> pd.DataFrame:
    """
    Download (once) and cache the daily aggTrades zip for *symbol* on *date_str*.
    Verifies SHA256 checksum. Returns full-day DataFrame.
    WHY duckdb not used: pandas read_csv on the in-memory CSV is fast enough
    for a single day's file; avoids an extra dependency.
    """
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = _CACHE_DIR / f"{symbol}-aggTrades-{date_str}.parquet"

    if cache_path.exists():
        return pd.read_parquet(cache_path)

    base_name = f"{symbol}-aggTrades-{date_str}"
    zip_url = f"{_ARCHIVE_BASE}/{symbol}/{base_name}.zip"
    checksum_url = f"{zip_url}.CHECKSUM"

    # Download zip
    zip_bytes = _download(zip_url)

    # Verify checksum (best-effort — skip if CHECKSUM fetch fails)
    try:
        checksum_text = _download(checksum_url).decode()
        expected_sha = checksum_text.strip().split()[0]
        actual_sha = hashlib.sha256(zip_bytes).hexdigest()
        if actual_sha != expected_sha:
            raise ValueError(
                f"Checksum mismatch for {base_name}: "
                f"expected {expected_sha}, got {actual_sha}"
            )
    except (requests.RequestException, IndexError):
        pass  # checksum file unavailable — proceed anyway

    # Read CSV inside zip
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        csv_name = f"{base_name}.csv"
        with zf.open(csv_name) as f:
            df = pd.read_csv(
                f,
                header=None,
                names=_ARCHIVE_COLUMNS,
                dtype={
                    "agg_trade_id": "int64",
                    "price": "float64",
                    "quantity": "float64",
                    "first_trade_id": "int64",
                    "last_trade_id": "int64",
                    "transact_time_ms": "int64",
                    "is_buyer_maker": "bool",
                },
            )

    # Keep only columns that match the contract
    df = df[["agg_trade_id", "price", "quantity", "transact_time_ms", "is_buyer_maker"]]

    # Cache as parquet for fast re-reads
    df.to_parquet(cache_path, index=False)
    return df


def _download(url: str) -> bytes:
    """WHY stream=True: archive zips can be 200+ MB; avoids OOM on large files."""
    resp = requests.get(url, stream=True, timeout=120)
    resp.raise_for_status()
    buf = io.BytesIO()
    for chunk in resp.iter_content(chunk_size=1 << 20):  # 1 MB chunks
        buf.write(chunk)
    return buf.getvalue()

"""REST aggTrades window (pagination, gaps, weight) and the Parquet cache (path safety, size cap).

REST facts (Binance spot API docs, rest-api.md, "Compressed/Aggregate trades list", read 2026-11-11):
GET /api/v3/aggTrades, weight 4, limit max 1000, fromId INCLUSIVE, startTime/endTime in ms INCLUSIVE,
response fields a, p, q, f, l, T, m, M.
"""
import pytest

from measure.data import rest
from measure.data.aggtrades import AggTradeWindow, MarketDataRef
from measure.data.cache import MarketCache


def _row(i: int, t: int) -> dict:
    return {"a": i, "p": "100.00", "q": "1.0", "f": i, "l": i, "T": t, "m": i % 2 == 0, "M": True}


class FakeApi:
    """Serves ids 5000..(5000+n-1), one print per ms from t0, with the documented fromId/startTime semantics."""

    def __init__(self, n: int, t0: int = 1_700_000_000_000, drop: int | None = None):
        self.rows = [_row(5000 + k, t0 + k) for k in range(n) if 5000 + k != drop]
        self.calls: list[dict] = []

    def __call__(self, params: dict) -> list[dict]:
        self.calls.append(dict(params))
        limit = params.get("limit", 500)
        if "fromId" in params:
            assert "startTime" not in params and "endTime" not in params        # never mix id and time paging
            sel = [r for r in self.rows if r["a"] >= params["fromId"]]
        else:
            sel = [r for r in self.rows if params["startTime"] <= r["T"] <= params["endTime"]]
        return sel[:limit]


def test_rest_window_paginates_without_gaps():
    t0 = 1_700_000_000_000
    api = FakeApi(3000, t0)
    w = rest.fetch_window("BTCUSDT", t0, t0 + 2349, api)                         # 2,350 prints inside the window
    assert len(w) == 2350
    assert int(w.agg_id[0]) == 5000 and int(w.agg_id[-1]) == 7349
    assert len(set(w.agg_id.tolist())) == 2350
    # page 1 by time (1000 rows), page 2 by fromId 6000 (1000 rows), page 3 by fromId 7000 (1000 rows, 350 kept)
    assert [c.get("fromId") for c in api.calls] == [None, 6000, 7000]
    assert all(c["limit"] == 1000 for c in api.calls)
    assert w.request_weight == 3 * 4
    assert int(w.ts_ms.max()) <= t0 + 2349


def test_rest_single_short_page():
    t0 = 1_700_000_000_000
    api = FakeApi(10, t0)
    w = rest.fetch_window("BTCUSDT", t0, t0 + 100, api)
    assert len(w) == 10 and len(api.calls) == 1 and w.request_weight == 4


def test_rest_exactly_one_full_page_checks_for_more():
    t0 = 1_700_000_000_000
    api = FakeApi(1000, t0)
    w = rest.fetch_window("BTCUSDT", t0, t0 + 5000, api)
    assert len(w) == 1000 and len(api.calls) == 2                                # second call returns nothing


def test_rest_empty_window():
    api = FakeApi(0)
    w = rest.fetch_window("BTCUSDT", 1, 2, api)
    assert len(w) == 0 and w.refs[0].window == (1, 2)


def test_rest_gap_in_ids_raises():
    t0 = 1_700_000_000_000
    api = FakeApi(50, t0, drop=5020)
    with pytest.raises(rest.DataGapError, match="5020"):
        rest.fetch_window("BTCUSDT", t0, t0 + 100, api)


def test_rest_ref_hash_is_stable_and_content_bound():
    t0 = 1_700_000_000_000
    a = rest.fetch_window("BTCUSDT", t0, t0 + 100, FakeApi(10, t0))
    b = rest.fetch_window("BTCUSDT", t0, t0 + 100, FakeApi(10, t0))
    c = rest.fetch_window("BTCUSDT", t0, t0 + 100, FakeApi(11, t0))
    assert a.refs[0].sha256 == b.refs[0].sha256 != c.refs[0].sha256
    assert a.refs[0].source == "api.binance.com" and a.refs[0].dataset == "api/v3/aggTrades" and a.refs[0].date is None


def test_rest_page_cap_raises():
    t0 = 1_700_000_000_000
    with pytest.raises(rest.WindowTooLargeError):
        rest.fetch_window("BTCUSDT", t0, t0 + 10_000, FakeApi(5000, t0), max_pages=2)


# ---- cache -----------------------------------------------------------------------------------------------------
def _win(symbol="BTCUSDT", n=3):
    ref = MarketDataRef(source="data.binance.vision", dataset="spot/daily/aggTrades", symbol=symbol, date="2024-01-15", window=None, sha256="ab" * 32)
    return AggTradeWindow.from_rows(symbol, [(k + 1, 100.0 + k, 1.0, 1000 + k, k % 2 == 0) for k in range(n)], [ref])


def test_cache_round_trip(tmp_path):
    c = MarketCache(tmp_path)
    assert c.get("BTCUSDT", "2024-01-15") is None
    c.put("BTCUSDT", "2024-01-15", _win())
    w = c.get("BTCUSDT", "2024-01-15")
    assert list(w.agg_id) == [1, 2, 3] and list(w.is_buyer_maker) == [True, False, True]
    assert w.refs[0].sha256 == "ab" * 32 and w.refs[0].date == "2024-01-15"
    assert (tmp_path / "exchange=binance" / "dataset=aggTrades" / "symbol=BTCUSDT" / "date=2024-01-15").is_dir()


@pytest.mark.parametrize("symbol,day", [("../../etc", "2024-01-15"), ("BTC/USDT", "2024-01-15"), ("BTCUSDT", "../x"), ("BTCUSDT", "2024-13-45x")])
def test_cache_refuses_path_escape(tmp_path, symbol, day):
    c = MarketCache(tmp_path / "root")
    with pytest.raises(ValueError):
        c.put(symbol, day, _win())
    with pytest.raises(ValueError):
        c.get(symbol, day)
    assert not (tmp_path / "etc").exists()


def test_cache_evicts_least_recently_used_over_cap(tmp_path):
    c = MarketCache(tmp_path, max_bytes=10**9)
    for i, day in enumerate(["2024-01-01", "2024-01-02", "2024-01-03"]):
        c.put("BTCUSDT", day, _win(n=50), now=100.0 + i)
    one = c.size_bytes() // 3
    c.get("BTCUSDT", "2024-01-01", now=200.0)                                    # touch the oldest: now most recent
    c.max_bytes = 2 * one + one // 2                                              # room for two entries
    removed = c.evict()
    assert removed == [("BTCUSDT", "2024-01-02")]                                 # least recently used goes first
    assert c.get("BTCUSDT", "2024-01-02") is None
    assert c.get("BTCUSDT", "2024-01-01") is not None and c.get("BTCUSDT", "2024-01-03") is not None

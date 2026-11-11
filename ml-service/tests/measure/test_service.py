"""Runtime measurement job on mongomock, with a market source that serves a fixed synthetic tape (or a real slice).

Synthetic tape S for symbol XUSDT, times are B + offset ms (B = 1,700,000,000,000). T = seller-initiated (bid side),
F = buyer-initiated (ask side). Built so the order reproduces the 4R-1a hand case:
   8000  99.99 T   9000 100.01 F   -> mid at 10000 (order created)        = 100.00 (arrival)
  18000 100.00 T  19000 100.02 F   -> mid at 20000 (fill 1, buy 1.0 @100.02) = 100.01
  28000 100.02 T  29000 100.04 F   -> mid at 30000 (fill 2, buy 0.5 @100.04) = 100.03
  38000 100.09 T  39000 100.11 F   -> mid at 40000 (order cancelled)        = 100.10 (end)
Order: buy 2.0, created B+10000, CANCELED at B+40000, executedQty 1.5. feeUsd 0.10 + 0.05 = 0.15.
Expected shortfall (bps of 200.00): execution 2.0, spread 0.75, impact/timing 1.25, opportunity 2.5, fees 7.5, total 12.0.
Fill 1 effective = (100.02 - 100.01)/100.01 x 1e4 = 0.99990001 bps.
"""
from datetime import datetime, timezone

import mongomock
import pytest

from config.versions import MEASURE_VERSION
from marketdata.field_registry import assert_writable
from measure.data.aggtrades import AggTradeWindow, MarketDataRef
from measure.service import Need, measure_account, plan_windows, to_ms

B = 1_700_000_000_000
NOW = B + 3600_000
ACC = "acct-1"
REF = MarketDataRef("test", "synthetic", "XUSDT", None, None, "0" * 64)
TAPE = [(8000, 99.99, True), (9000, 100.01, False), (18000, 100.00, True), (19000, 100.02, False),
        (28000, 100.02, True), (29000, 100.04, False), (38000, 100.09, True), (39000, 100.11, False)]
S = AggTradeWindow.from_rows("XUSDT", [(i + 1, p, 1.0, B + off, m) for i, (off, p, m) in enumerate(TAPE)], [REF])


def dt(off):
    return datetime.fromtimestamp((B + off) / 1000, tz=timezone.utc).replace(tzinfo=None)


class Source:
    def __init__(self, window=S, fail=False):
        self.window, self.fail, self.calls = window, fail, []

    def __call__(self, symbol, start, end):
        self.calls.append((symbol, start, end))
        if self.fail:
            raise ConnectionError("down")
        assert symbol == self.window.symbol
        return self.window.between(start, end + 1)


def trade(_id, off, price, qty, order_id, fee_usd, **kw):
    d = {"_id": _id, "accountId": ACC, "userId": ACC, "dataSource": "real-user", "exchange": "binance", "symbol": "XUSDT",
         "tradeId": str(_id), "orderId": order_id, "side": "BUY", "executionPrice": price, "quantity": qty,
         "executedAt": dt(off), "feeUsd": fee_usd, "isMaker": True}
    d.update(kw)
    return d


def order(order_id, created, updated, orig, executed, status="CANCELED"):
    return {"accountId": ACC, "exchange": "binance", "symbol": "XUSDT", "orderId": order_id, "side": "BUY", "type": "LIMIT",
            "origQty": orig, "executedQty": executed, "status": status, "createdAt": dt(created), "updatedAt": dt(updated),
            "dataSource": "real-user"}


@pytest.fixture
def db():
    d = mongomock.MongoClient().db
    d.trades.insert_many([trade(1, 20000, 100.02, 1.0, "7", 0.10), trade(2, 30000, 100.04, 0.5, "7", 0.05)])
    d.orders.insert_one(order("7", 10000, 40000, 2.0, 1.5))
    return d


def test_plan_windows_merges_touching_spans_and_caps_length():
    needs = [Need("X", 0, 100, "a"), Need("X", 101, 200, "b"), Need("X", 500, 600, "c"), Need("Y", 0, 10, "d")]
    b = plan_windows(needs)
    assert [(x.symbol, x.start_ms, x.end_ms, x.keys) for x in b] == [("X", 0, 200, ["a", "b"]), ("X", 500, 600, ["c"]), ("Y", 0, 10, ["d"])]
    capped = plan_windows([Need("X", 0, 100, "a"), Need("X", 50, 150, "b")], max_window_ms=120)
    assert len(capped) == 2


def test_to_ms_reads_naive_utc():
    assert to_ms(dt(20000)) == B + 20000


def test_measures_fills_and_the_order_hand_case(db):
    src = Source()
    r = measure_account(db, ACC, src, NOW)
    assert r["measured"] == 2 and r["orders"] == 1 and r["pending"] == 0
    m1 = db.trades.find_one({"_id": 1})["measurement"]
    assert m1["version"] == MEASURE_VERSION
    assert m1["mid"] == pytest.approx(100.01, abs=1e-12)
    assert m1["effHalfBps"] == pytest.approx(0.99990001, abs=1e-8)
    assert m1["marketDataRefs"][0]["sha256"] == "0" * 64
    om = db.order_measurements.find_one({"orderId": "7"})
    assert om["arrivalMid"] == pytest.approx(100.00, abs=1e-12)
    assert om["endMid"] == pytest.approx(100.10, abs=1e-12)
    assert om["endBasis"] == "order canceled"
    s = om["shortfall"]
    assert s["basis"] == "order"
    for k, v in (("executionBps", 2.0), ("spreadBps", 0.75), ("impactTimingBps", 1.25), ("opportunityBps", 2.5),
                 ("feesBps", 7.5), ("totalBps", 12.0)):
        assert s[k] == pytest.approx(v, abs=1e-9), k
    assert om["tradeIds"] == ["1", "2"]


def test_second_run_is_a_no_op(db):
    measure_account(db, ACC, Source(), NOW)
    before = db.order_measurements.find_one({"orderId": "7"})["shortfall"]
    src = Source()
    r = measure_account(db, ACC, src, NOW)
    assert r["measured"] == 0 and r["orders"] == 0 and src.calls == []
    assert db.order_measurements.count_documents({}) == 1
    assert db.order_measurements.find_one({"orderId": "7"})["shortfall"] == before


def test_market_data_failure_stores_nothing_and_stays_pending(db):
    r = measure_account(db, ACC, Source(fail=True), NOW)
    assert r["measured"] == 0 and r["skipped"]["market_data"] == 2 and r["pending"] == 2
    assert all("measurement" not in t for t in db.trades.find())
    assert db.order_measurements.count_documents({}) == 0


def test_demo_account_and_synthetic_trades_are_never_measured():
    d = mongomock.MongoClient().db
    d.trades.insert_one(trade(1, 20000, 100.02, 1.0, "7", 0.1, accountId="demo-moderate"))
    d.trades.insert_one(trade(2, 20000, 100.02, 1.0, "8", 0.1, dataSource="synthetic-demo"))
    src = Source()
    assert measure_account(d, "demo-moderate", src, NOW)["skipped"] == {"demo": 1}
    r = measure_account(d, ACC, src, NOW)
    assert r["measured"] == 0 and src.calls == []
    assert all("measurement" not in t for t in d.trades.find())


def test_fill_too_recent_for_the_last_horizon_waits():
    d = mongomock.MongoClient().db
    d.trades.insert_one(trade(1, 20000, 100.02, 1.0, "7", 0.1))
    # fill at B+20000 needs prints until B+320000; now = B+320000+4999 is still too early (300 s + 5 s margin)
    r = measure_account(d, ACC, Source(), B + 20000 + 305_000 - 1)
    assert r["skipped"] == {"too_recent": 1} and r["pending"] == 1


def test_other_venues_get_a_reason_not_a_number():
    d = mongomock.MongoClient().db
    d.trades.insert_one(trade(1, 20000, 100.02, 1.0, "7", 0.1, exchange="bybit"))
    r = measure_account(d, ACC, Source(), NOW)
    m = d.trades.find_one({"_id": 1})["measurement"]
    assert r["skipped"] == {"venue": 1} and r["pending"] == 0
    assert m["unmeasuredReason"] == "no public prints for this venue in this measurement version"
    assert "effHalfBps" not in m


def test_unfilled_cancelled_order_is_pure_opportunity():
    # Buy 2.0 created B+10000 (arrival 100.00), cancelled B+40000 (end 100.10), never filled:
    # opportunity = 0.10 x 2.0 / 200 x 1e4 = 10.0 bps; fees 0 (no fills); total 10.0.
    d = mongomock.MongoClient().db
    d.orders.insert_one(order("9", 10000, 40000, 2.0, 0))
    r = measure_account(d, ACC, Source(), NOW)
    s = d.order_measurements.find_one({"orderId": "9"})["shortfall"]
    assert r["orders"] == 1
    assert s["opportunityBps"] == pytest.approx(10.0, abs=1e-9) and s["totalBps"] == pytest.approx(10.0, abs=1e-9)


def test_order_without_record_uses_first_fill_basis():
    # No order document: arrival = mid at the first fill (100.01); ordered = filled = 1.0; opportunity unknown.
    # execution = (100.02 - 100.01) x 1.0 / 100.01 x 1e4 = 0.99990001 bps.
    d = mongomock.MongoClient().db
    d.trades.insert_one(trade(1, 20000, 100.02, 1.0, "7", 0.1))
    measure_account(d, ACC, Source(), NOW)
    s = d.order_measurements.find_one({"orderId": "7"})["shortfall"]
    assert s["basis"] == "first_fill" and s["opportunityBps"] is None and s["totalBps"] is None
    assert s["executionBps"] == pytest.approx(0.99990001, abs=1e-8)


def test_non_usd_quote_leaves_fees_unknown():
    tape = AggTradeWindow.from_rows("XBTC", [(i + 1, p, 1.0, B + off, m) for i, (off, p, m) in enumerate(TAPE)], [REF])
    d = mongomock.MongoClient().db
    d.trades.insert_one(trade(1, 20000, 100.02, 1.0, "7", 0.1, symbol="XBTC"))
    measure_account(d, ACC, Source(tape), NOW)
    s = d.order_measurements.find_one({"orderId": "7"})["shortfall"]
    assert s["feesBps"] is None


class TooLargeOnMerged(Source):
    """Raises WindowTooLargeError for any window longer than one fill's span (305 s), like a busy hour on REST."""
    def __call__(self, symbol, start, end):
        from measure.data.rest import WindowTooLargeError
        if end - start > 305_000:
            self.calls.append((symbol, start, end))
            raise WindowTooLargeError("too many pages")
        return super().__call__(symbol, start, end)


def test_oversized_merged_window_falls_back_to_one_window_per_fill(db):
    # Review M1-2: the two fills (10 s apart) merge into one window; when it is too large, each fill is fetched alone.
    src = TooLargeOnMerged()
    r = measure_account(db, ACC, src, NOW)
    assert r["measured"] == 2 and "market_data" not in r["skipped"]
    assert db.trades.find_one({"_id": 1})["measurement"]["effHalfBps"] == pytest.approx(0.99990001, abs=1e-8)


def test_order_whose_stored_fills_do_not_add_up_is_not_measured():
    # Review M1-6: executedQty 1.5 but only 1.0 is stored (the other fill is outside the synced history). The unfilled
    # part would be overstated, so the order gets a reason, not a number.
    d = mongomock.MongoClient().db
    d.trades.insert_one(trade(1, 20000, 100.02, 1.0, "7", 0.10))
    d.orders.insert_one(order("7", 10000, 40000, 2.0, 1.5))
    measure_account(d, ACC, Source(), NOW)
    om = d.order_measurements.find_one({"orderId": "7"})
    assert om["shortfall"] is None
    assert om["unmeasuredReason"] == "stored fills do not add up to the order's executed quantity"


def test_open_order_is_measured_again_once_final():
    # Review M1-5: measured while open (end = creation + 1 h), later cancelled with no new fill -> measured again.
    d = mongomock.MongoClient().db
    d.trades.insert_one(trade(1, 20000, 100.02, 1.0, "7", 0.10))
    d.orders.insert_one(order("7", 10000, 40000, 2.0, 1.0, status="PARTIALLY_FILLED"))
    tape = AggTradeWindow.from_rows("XUSDT", [(i + 1, p, 1.0, B + off, m) for i, (off, p, m) in enumerate(
        TAPE + [(3_607_000, 100.05, True), (3_608_000, 100.07, False)])], [REF])
    measure_account(d, ACC, Source(tape), B + 2 * 3600_000)
    assert d.order_measurements.find_one({"orderId": "7"})["endBasis"] == "order still open: creation + 1 h"
    d.orders.update_one({"orderId": "7"}, {"$set": {"status": "CANCELED"}})
    r = measure_account(d, ACC, Source(tape), B + 2 * 3600_000)
    om = d.order_measurements.find_one({"orderId": "7"})
    assert r["orders"] == 1 and om["endBasis"] == "order canceled"
    assert om["endMid"] == pytest.approx(100.10, abs=1e-12)


def test_writes_only_registry_owned_fields(db):
    measure_account(db, ACC, Source(), NOW)
    for t in db.trades.find():
        assert_writable("Trade", "measurement", t["measurement"], "ml-service/measure/service.py")
    for om in db.order_measurements.find():
        for k, v in om.items():
            if k != "_id":
                assert_writable("OrderMeasurement", k, v, "ml-service/measure/service.py")


def test_real_btc_slice_matches_measure_fill(btc_2024):
    # The pretend buy from test_enrich_fill (aggregate trade 2830846703): the job stores the same record.
    from measure.enrich_fill import FillInput, measure_fill
    from measure.data.ticks import tick_from_prints
    d = mongomock.MongoClient().db
    t = trade(1, 0, 42864.25, 0.00148, "1", 0.06, symbol="BTCUSDT",
              executedAt=datetime.fromtimestamp(1705327260, tz=timezone.utc).replace(tzinfo=None))
    d.trades.insert_one(t)
    measure_account(d, ACC, Source(btc_2024), 1705327260000 + 3600_000)
    stored = d.trades.find_one({"_id": 1})["measurement"]
    # The job sees only its window, so its price step can only be >= the whole-slice step; here both are 0.01.
    direct = measure_fill(FillInput("1", "BTCUSDT", 1, 42864.25, 0.00148, 1705327260000), btc_2024, tick_from_prints(btc_2024.price))
    for k in ("mid", "effHalfBps", "eq", "realized", "impact", "tickSize", "quoteQuality"):
        assert stored[k] == direct[k], k

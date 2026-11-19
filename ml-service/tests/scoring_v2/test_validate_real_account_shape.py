"""The validation harness on the shape of Deepanshu's planned real account: 30 small Binance spot orders.

24 MARKET orders (12 BTCUSDT, 12 ETHUSDT, buys and sells), 6 LIMIT orders on BTCUSDT of which 3 are filled as maker and 3 are
cancelled with nothing filled; "Use BNB to pay fees" is off (every fee is in the quote asset at the standard 0.1%).
The market is a synthetic tape and synthetic 1-minute klines: the numbers below are hand-computed from them, not measured.

Tape (every order i is at T_i = 2024-01-15 14:00:00 UTC + i x 10 minutes; BTC mid 42000 + i, ETH mid 2300 + 0.1 i; half spread
0.005 for both): a bid print 2 s and an ask print 1 s before T_i make the mid at arrival equal the mid.
 MARKET: filled 1 s after T_i at the ask (buy) or the bid (sell); BTC qty 0.01, ETH qty 0.2.
   execution bps = 0.005 / mid x 1e4: BTC i = 0: 0.005 / 42000 x 1e4 = 0.0011905 bps.
 LIMIT filled: buy at the bid 30 s after T_i (maker), fee at the maker rate 0.1%.
 LIMIT cancelled: buy 0.01 BTC, cancelled 60 s after T_i with nothing filled; the mid rose by 1.00 at the end.
   opportunity cost = 1.00 x 0.01 = 0.01 USD = 0.01 / (0.01 x mid) x 1e4 bps; mid 42024 (i = 24): 0.2379 bps; for the three
   cancelled orders (i = 27, 28, 29, mids 42027, 42028, 42029) the total is 0.03 USD.
 Fees: notional x 0.001 for every fill, so fees paid equal fees at the account's stated rate.
Klines: 60 minute rows an hour with volume 5 BTC or 60 ETH a minute and a small deterministic wobble, so every market order has
an expected cost (24 usable orders, more than the 20 needed).
"""
import importlib.util
import math
from datetime import datetime, timezone
from pathlib import Path

import mongomock
import pytest

from config.versions import SCORING_V2_VERSION
from expected_cost.model import load_calibration
from expected_cost.runtime import kline_expected_cost_hook
from measure.data import klines as K
from measure.data.aggtrades import AggTradeWindow, MarketDataRef
from scoring_v2.version import load_version, version_file_sha256

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "validate_real_account.py"
T0 = 1_705_327_200_000
ACC = "real-acct-1"
NOW = T0 + 24 * 3600_000
HALF = 0.005


def _mod():
    spec = importlib.util.spec_from_file_location("validate_real_account", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _dt(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).replace(tzinfo=None)


def mid(sym, i):
    return round(42000.0 + i, 3) if sym == "BTCUSDT" else round(2300.0 + 0.1 * i, 3)


def build():
    """orders, trades, tape rows per symbol."""
    orders, trades, tape = [], [], {"BTCUSDT": [], "ETHUSDT": []}
    agg = {"BTCUSDT": 0, "ETHUSDT": 0}

    def prints(sym, t, m):
        for dt_ms, px, is_bid in ((t - 2000, m - HALF, True), (t - 1000, m + HALF, False)):
            agg[sym] += 1
            tape[sym].append((agg[sym], round(px, 6), 1.0, dt_ms, is_bid))

    for i in range(30):
        t = T0 + i * 600_000
        if i < 24:
            sym, side = ("BTCUSDT" if i % 2 == 0 else "ETHUSDT"), ("BUY" if (i // 2) % 2 == 0 else "SELL")
            m, qty = mid(sym, i), (0.01 if i % 2 == 0 else 0.2)
            prints(sym, t, m)
            prints(sym, t + 1000 + 1000, m)                      # bid/ask 2 s and 1 s before the fill at t + 2000 - shifted below
            px = round(m + HALF if side == "BUY" else m - HALF, 6)
            fill_t = t + 2000
            orders.append(dict(symbol=sym, orderId=str(100 + i), side=side, type="MARKET", origQty=qty, executedQty=qty,
                               status="FILLED", createdAt=_dt(t), updatedAt=_dt(fill_t)))
            trades.append(dict(symbol=sym, orderId=str(100 + i), side=side, price=px, qty=qty, t=fill_t, maker=False))
        elif i < 27:
            sym, side, m, qty = "BTCUSDT", "BUY", mid("BTCUSDT", i), 0.01
            prints(sym, t, m)
            fill_t = t + 30_000
            prints(sym, fill_t, m)
            orders.append(dict(symbol=sym, orderId=str(100 + i), side=side, type="LIMIT", origQty=qty, executedQty=qty,
                               status="FILLED", createdAt=_dt(t), updatedAt=_dt(fill_t)))
            trades.append(dict(symbol=sym, orderId=str(100 + i), side=side, price=round(m - HALF, 6), qty=qty, t=fill_t, maker=True))
        else:
            sym, side, m, qty = "BTCUSDT", "BUY", mid("BTCUSDT", i), 0.01
            prints(sym, t, m)
            end_t = t + 60_000
            prints(sym, end_t, m + 1.0)
            orders.append(dict(symbol=sym, orderId=str(100 + i), side=side, type="LIMIT", origQty=qty, executedQty=0.0,
                               status="CANCELED", createdAt=_dt(t), updatedAt=_dt(end_t)))
    for sym in tape:
        tape[sym].sort(key=lambda r: r[3])
        tape[sym] = [(n + 1, p, q, ts, b) for n, (_, p, q, ts, b) in enumerate(tape[sym])]
    return orders, trades, tape


class Source:
    def __init__(self, tape):
        ref = MarketDataRef("test", "synthetic", "X", None, None, "0" * 64)
        self.w = {s: AggTradeWindow.from_rows(s, rows, [ref]) for s, rows in tape.items()}

    def __call__(self, symbol, start, end):
        return self.w[symbol].between(start, end + 1)


class FakeKlines:
    def __init__(self):
        self.calls = 0

    def __call__(self, params):
        self.calls += 1
        sym, lo, hi, lim = params["symbol"], params["startTime"], params["endTime"], params["limit"]
        base, vol = (42000.0, 5.0) if sym == "BTCUSDT" else (2300.0, 60.0)
        rows = []
        for om in range((lo + 59_999) // 60_000, hi // 60_000 + 1):
            close = base * (1 + 0.0004 * math.sin(om / 5.0))
            rows.append([om * 60_000, "0", "0", "0", f"{close:.6f}", f"{vol}", om * 60_000 + 59_999, "0", 100, "0", "0", "0"])
        return rows[:lim], 2


def snapshot(sym):
    z = {"maker": 0.0, "taker": 0.0, "buyer": 0.0, "seller": 0.0}
    return {"accountId": ACC, "exchange": "binance", "symbol": sym, "source": "api", "fetchedAt": _dt(T0),
            "standard": {"maker": 0.001, "taker": 0.001, "buyer": 0.0, "seller": 0.0}, "tax": dict(z), "special": dict(z),
            "discount": {"enabledForAccount": False, "enabledForSymbol": False, "asset": "BNB", "rate": 0.75}}


def make_db():
    orders, trades, tape = build()
    d = mongomock.MongoClient().db
    for o in orders:
        d.orders.insert_one({**o, "accountId": ACC, "exchange": "binance", "dataSource": "real-user"})
    n = 0
    for t in trades:
        n += 1
        notional = t["price"] * t["qty"]
        d.trades.insert_one({"_id": n, "accountId": ACC, "userId": ACC, "dataSource": "real-user", "exchange": "binance",
                             "symbol": t["symbol"], "tradeId": str(n), "orderId": t["orderId"], "side": t["side"],
                             "executionPrice": t["price"], "quantity": t["qty"], "notional": notional,
                             "executedAt": _dt(t["t"]), "feeUsd": notional * 0.001, "fee": notional * 0.001, "feeAsset": "USDT",
                             "isMaker": t["maker"]})
    for s in ("BTCUSDT", "ETHUSDT"):
        d.fee_snapshots.insert_one(snapshot(s))
    return d, tape


@pytest.fixture(scope="module")
def report():
    m = _mod()
    d, tape = make_db()
    hook = kline_expected_cost_hook(K.KlineStore(get_json=FakeKlines()), load_calibration(), now_ms=lambda: NOW)
    rep = m.validate(m.ReadOnlyDB(d), ACC, Source(tape), load_version(SCORING_V2_VERSION), version_file_sha256(SCORING_V2_VERSION),
                     NOW, expected_cost=hook)
    return m, rep


def test_the_fixture_has_the_planned_shape(report):
    _, rep = report
    oc = rep["outcomes"]
    assert oc["total"] == 30
    assert oc["MARKET"] == {"total": 24, "filled": 24, "partial": 0, "unfilled": 0, "open": 0}
    assert oc["LIMIT"] == {"total": 6, "filled": 3, "partial": 0, "unfilled": 3, "open": 0}
    assert rep["trades"] == 27 and rep["dataSource"] == {"real-user": 27}


def test_cost_vs_expected_is_computed_for_24_market_orders(report):
    _, rep = report
    c = rep["costVsExpected"]
    assert c["insufficient"] is False and c["n"] == 24
    # hand: a BTC fill pays 0.005 / 42000 x 1e4 = 0.0012 bps, an ETH fill 0.005 / 2300 x 1e4 = 0.0217 bps. Notional-weighted
    # (BTC about 420 USD, ETH about 460 USD per order) the mean lies between them: 0.0012 < paid < 0.0217.
    assert 0.0012 < c["paidBps"] < 0.0217
    assert c["excluded"]["outsideModel"] == 6          # the six LIMIT orders are not priced by the market-order model


def test_unfilled_cost_matches_the_hand_value(report):
    _, rep = report
    u = rep["unfilledCost"]
    assert u["measured"] == 3 and u["notMeasured"] == 0
    assert u["totalUsd"] == pytest.approx(0.03, abs=1e-9)
    # median of 0.01 / (0.01 x 42027) x 1e4, 0.01 / (0.01 x 42028) x 1e4, 0.01 / (0.01 x 42029) x 1e4: the middle one (i = 28)
    assert u["medianBps"] == pytest.approx(1e4 / 42028, abs=1e-6)


def test_fees_equal_the_stated_rates(report):
    _, rep = report
    f = rep["feeCheck"]
    assert f["compared"] == 27 and f["noSnapshot"] == 0 and f["bnbFees"] == 0
    assert f["aboveRate"] == 0 and f["belowRate"] == 0
    assert f["differenceUsd"] == pytest.approx(0.0, abs=1e-9)


def test_the_report_text_is_complete_and_readable(report, capsys):
    m, rep = report
    text = m.format_report(rep)
    print("\n" + text)
    for needle in ("== Order outcomes", "MARKET   24:", "LIMIT     6:", "== Cost against expectation (market orders)",
                   "24 market orders: paid", "== Cost of orders that did not fill completely", "3 orders ended below a full fill",
                   "$0.03 in total", "== Fees against the account's rates", "27 fills compared", "fees paid in BNB: 0",
                   "integrity check: matched", "identity failures: 0"):
        assert needle in text, needle
    assert "grade:" in text
    for forbidden in ("could save", "should", "recommend", "because", "due to"):
        assert forbidden not in text


def test_fewer_than_20_market_orders_reads_insufficient_data(report):
    m, rep = report
    shrunk = dict(rep)
    shrunk["costVsExpected"] = {"insufficient": True, "n": 7, "excluded": {"noExpectedCost": 2, "outsideModel": 1, "partlyFilled": 0}}
    shrunk["marketOrders"] = 10
    text = m.format_report(shrunk)
    assert "insufficient data: 7 market orders had a usable expected cost; at least 20 are needed (the account has 10 market orders)." in text

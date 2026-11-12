"""demo_v2.build: decisions -> demo trades, orders and fee snapshots from real prints (plan §2-3).

Tape T (plan §3), times B + offset ms, B = 2024-01-01 00:00 UTC; T = seller-initiated, F = buyer-initiated:
  1000 100.00 1.0 T | 2000 100.02 0.5 F | 2500 100.03 0.4 F | 3000 99.99 2.0 T | 4000 100.04 1.0 F | 6000 99.98 1.0 T
Market buy 1.0 at 1500 -> fills 0.5 @100.02 (2000), 0.4 @100.03 (2500), 0.1 @100.04 (4000); FILLED at 4000.
  fees at 0.1%: 0.05001, 0.040012, 0.010004 USDT.
Limit buy 1.5 at 1500 -> limit 100.00 (sell print at 1000); 99.99 sell at 3000 trades through -> 1.5 @100.00 at 3000.
  fee 0.15 USDT; FILLED, resting 1500 ms.
Limit sell 1.0 at 9000 -> the ask proxy (buy print at 4000) is 5000 ms old: allowed (<= 5000); no buy print above 100.04
  afterwards -> CANCELED with nothing filled at 9000 + TTL.
Limit buy 1.0 at 20000 -> the last sell print (6000) is 14000 ms old: no limit price, skipped and counted.
"""
import pytest

from demo_v2.build import build_demo
from demo_v2.decisions import Decision
from measure.data.aggtrades import AggTradeWindow

B = 1_704_067_200_000
ROWS = [(1000, 100.00, 1.0, True), (2000, 100.02, 0.5, False), (2500, 100.03, 0.4, False), (3000, 99.99, 2.0, True),
        (4000, 100.04, 1.0, False), (6000, 99.98, 1.0, True)]
TAPE = AggTradeWindow.from_rows("XUSDT", [(i + 1, p, q, B + off, m) for i, (off, p, q, m) in enumerate(ROWS)])


def tapes(symbol, start, end):
    assert symbol == "XUSDT"
    return TAPE.between(start, end)


def D(side, kind, qty, off, n):
    return Decision("moderate", "XUSDT", side, kind, qty, B + off, 100.0, f"syn-moderate-XUSDT-{n}", f"ord-moderate-XUSDT-{n}")


def test_market_and_limit_orders_hand_values():
    out = build_demo("demo-moderate", [D("BUY", "MARKET", 1.0, 1500, 1), D("BUY", "LIMIT", 1.5, 1500, 2),
                                       D("SELL", "LIMIT", 1.0, 9000, 3), D("BUY", "LIMIT", 1.0, 20000, 4)],
                     tapes, fee_rates={"maker": 0.001, "taker": 0.001}, ttl_ms=1_800_000, horizon_ms=300_000)
    t = out["trades"]
    assert [(x["orderId"], x["executionPrice"], x["quantity"], x["isMaker"]) for x in t] == [
        ("ord-moderate-XUSDT-1", 100.02, 0.5, False), ("ord-moderate-XUSDT-1", 100.03, 0.4, False),
        ("ord-moderate-XUSDT-1", 100.04, pytest.approx(0.1), False), ("ord-moderate-XUSDT-2", 100.00, 1.5, True)]
    assert [x["fee"] for x in t] == pytest.approx([0.05001, 0.040012, 0.010004, 0.15])
    assert all(x["feeUsd"] == x["fee"] and x["feeAsset"] == "USDT" for x in t)
    assert [x["executedAt"] for x in t] == ["2024-01-01T00:00:02.000Z", "2024-01-01T00:00:02.500Z",
                                            "2024-01-01T00:00:04.000Z", "2024-01-01T00:00:03.000Z"]
    assert t[0]["tradeId"] == "v2:syn-moderate-XUSDT-1:0" and t[3]["tradeId"] == "v2:syn-moderate-XUSDT-2:0"
    assert all(x["userId"] == x["accountId"] == "demo-moderate" and x["dataSource"] == "synthetic-demo" for x in t)
    assert t[0]["notional"] == pytest.approx(50.01) and t[0]["orderType"] == "MARKET" and t[3]["orderType"] == "LIMIT"

    o = {x["orderId"]: x for x in out["orders"]}
    assert set(o) == {"ord-moderate-XUSDT-1", "ord-moderate-XUSDT-2", "ord-moderate-XUSDT-3"}
    m = o["ord-moderate-XUSDT-1"]
    assert (m["type"], m["status"], m["origQty"], m["price"], m["createdAt"], m["updatedAt"]) == (
        "MARKET", "FILLED", 1.0, None, "2024-01-01T00:00:01.500Z", "2024-01-01T00:00:04.000Z")
    assert m["executedQty"] == pytest.approx(1.0) and m["cummulativeQuoteQty"] == pytest.approx(100.026)
    lim = o["ord-moderate-XUSDT-2"]
    assert (lim["type"], lim["status"], lim["price"], lim["timeInForce"], lim["updatedAt"]) == (
        "LIMIT", "FILLED", 100.00, "GTC", "2024-01-01T00:00:03.000Z")
    assert lim["restingMs"] == 1500 and m["restingMs"] is None           # 3000 - 1500; market orders have none
    c = o["ord-moderate-XUSDT-3"]
    assert c["restingMs"] is None                                         # never filled
    assert (c["status"], c["executedQty"], c["price"], c["updatedAt"]) == ("CANCELED", 0.0, 100.04, "2024-01-01T00:30:09.000Z")
    assert all(x["accountId"] == "demo-moderate" and x["exchange"] == "binance" and x["dataSource"] == "synthetic-demo"
               for x in out["orders"])
    assert out["skipped"] == {"no_limit_price": 1}
    assert out["counts"] == {"decisions": 4, "orders": 3, "fills": 4}


def test_fee_snapshot_is_labelled_a_published_schedule():
    out = build_demo("demo-moderate", [D("BUY", "MARKET", 1.0, 1500, 1)], tapes, fee_rates={"maker": 0.001, "taker": 0.001},
                     ttl_ms=1_800_000, horizon_ms=300_000, fee_source="https://www.binance.com/en/fee/schedule (regular tier)")
    (s,) = out["fee_snapshots"]
    assert s["source"] == "published-schedule" and s["symbol"] == "XUSDT" and s["accountId"] == "demo-moderate"
    assert s["standard"] == {"maker": 0.001, "taker": 0.001, "buyer": 0.0, "seller": 0.0}
    assert s["discount"]["enabledForAccount"] is False
    assert s["fetchedAt"] == "2024-01-01T00:00:01.500Z"                # midpoint of the decision window (one decision here)
    assert "regular tier" in out["feeSource"]


def test_refuses_a_non_demo_account():
    with pytest.raises(ValueError):
        build_demo("acct-1", [], tapes, fee_rates={"maker": 0.001, "taker": 0.001}, ttl_ms=1, horizon_ms=1)

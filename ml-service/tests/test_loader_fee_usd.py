"""F-10: the fee packet sums `feePaid` as USD, so the loader must feed it the USD fee.

Hand-computed fixtures (same trades as the backend fixture):
  T1 fee 5.001 USDT, feeUsd 5.001                      -> feePaid 5.001
  T3 fee 0.004 BNB,  feeUsd 0.004 x 600 (BNBUSDT close) -> feePaid 2.4   (not 0.004)
  legacy/demo doc with no feeUsd, fee 12.5 USDT        -> feePaid 12.5  (fallback, demo hashes unchanged)
"""
from agents.metrics.loader import TRADE_PROJECTION, normalise_trade_doc
from agents.metrics.fee_packet import build_fee_packet


def test_fee_paid_uses_fee_usd_when_present():
    doc = normalise_trade_doc({"_id": "a", "fee": 0.004, "feeAsset": "BNB", "feeUsd": 2.4, "notional": 2500.0})
    assert doc["feePaid"] == 2.4
    assert doc["notionalValue"] == 2500.0
    assert doc["id"] == "a"


def test_fee_paid_falls_back_to_native_fee_for_legacy_docs():
    assert normalise_trade_doc({"_id": "b", "fee": 12.5, "notional": 10000.0})["feePaid"] == 12.5
    assert normalise_trade_doc({"_id": "c", "fee": 12.5, "feeUsd": None, "notional": 1.0})["feePaid"] == 12.5


def test_projection_loads_fee_usd():
    assert TRADE_PROJECTION.get("feeUsd") == 1


def test_fee_packet_total_is_in_usd():
    # total = 5.001 + 2.4 = 7.401 ; drag = 7.401 / (5001 + 2500) x 1e4 = 9.86668444207439 bps
    trades = [
        normalise_trade_doc({"_id": "1", "symbol": "BTCUSDT", "exchange": "binance", "isMaker": False, "orderType": "MARKET",
                             "fee": 5.001, "feeUsd": 5.001, "notional": 5001.0}),
        normalise_trade_doc({"_id": "3", "symbol": "BTCUSDT", "exchange": "binance", "isMaker": False, "orderType": "MARKET",
                             "fee": 0.004, "feeUsd": 2.4, "notional": 2500.0}),
    ]
    pkt = build_fee_packet(trades, "u1", "BTCUSDT")
    assert abs(pkt.total_fee_paid_usd - 7.401) < 1e-9
    assert abs(pkt.fee_drag_bps - 9.86668444207439) < 1e-6

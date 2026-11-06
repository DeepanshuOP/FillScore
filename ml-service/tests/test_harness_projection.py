"""F-11: the eval harness must load trades exactly as production does (loader projection + normalise),
so its packets carry fees, notional, vwap and whale-adverse flags. mongomock-motor, no Atlas."""
from __future__ import annotations

import asyncio
from datetime import datetime
from unittest.mock import patch

from mongomock_motor import AsyncMongoMockClient

from agents.metrics.fee_packet import build_fee_packet
from agents.metrics.risk_packet import build_risk_packet
from eval import harness


def _client():
    client = AsyncMongoMockClient()
    asyncio.run(client["fillscore"]["trades"].insert_many([
        # stored (camelCase) shape: fee in USDT, notional, vwap5min, whaleAdverse
        {"_id": "a", "userId": "u", "symbol": "BTCUSDT", "exchange": "okx", "isMaker": False, "fee": 2.0,
         "feeUsd": 2.5, "notional": 2000.0, "vwap5min": 101.5, "whaleAdverse": True,
         "executedAt": datetime(2024, 1, 2, 9)},
        {"_id": "b", "userId": "u", "symbol": "BTCUSDT", "exchange": "okx", "isMaker": True, "fee": 1.0,
         "notional": 1000.0, "whaleAdverse": False, "executedAt": datetime(2024, 1, 3, 9)},
        # after the cutoff (2024-01-15): must never load
        {"_id": "c", "userId": "u", "symbol": "BTCUSDT", "exchange": "okx", "isMaker": False, "fee": 9.0,
         "notional": 9000.0, "executedAt": datetime(2024, 1, 20, 9)},
    ]))
    return client


def _load():
    client = _client()
    with patch.object(harness, "_get_db", lambda: (client, client["fillscore"])):
        return asyncio.run(harness.fetch_trades_before_cutoff("u", "BTCUSDT"))


def test_harness_trades_are_normalised_like_production():
    trades = _load()
    assert [t["id"] for t in trades] == ["a", "b"]  # cutoff drops "c"; oldest first
    a, b = trades
    # feePaid: feeUsd 2.5 wins when stored; else native fee 1.0
    assert (a["feePaid"], b["feePaid"]) == (2.5, 1.0)
    assert (a["notionalValue"], b["notionalValue"]) == (2000.0, 1000.0)
    assert a["vwap5m"] == 101.5 and b.get("vwap5m") is None
    assert a["whaleAdverse"] is True and b["whaleAdverse"] is False


def test_harness_packets_see_the_fields():
    trades = _load()
    fee = build_fee_packet(trades, "u", "BTCUSDT")
    # total fees = 2.5 + 1.0 = 3.5 (before the fix both were 0 because feePaid was never loaded)
    assert abs(fee.total_fee_paid_usd - 3.5) < 1e-9
    risk = build_risk_packet(trades, "u", "BTCUSDT")
    assert risk.whale_adverse_count == 1

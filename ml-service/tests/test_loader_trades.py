"""1c.4 wiring: the loader reads a user's trades once and builds the packets from that same list,
so the verifier replays exactly the trades the packets summarise. mongomock-motor, no Atlas."""
from __future__ import annotations

import asyncio
from datetime import datetime
from unittest.mock import patch

from mongomock_motor import AsyncMongoMockClient

from agents.metrics import loader


def _client_with_trades():
    client = AsyncMongoMockClient()
    asyncio.run(client["fillscore"]["trades"].insert_many([
        {"_id": "b2", "userId": "u", "symbol": "BTCUSDT", "exchange": "okx", "isMaker": False, "fee": 2.0,
         "notional": 2000.0, "executedAt": datetime(2024, 1, 2, 9), "notes": "private"},
        {"_id": "b1", "userId": "u", "symbol": "BTCUSDT", "exchange": "okx", "isMaker": True, "fee": 1.0,
         "notional": 1000.0, "executedAt": datetime(2024, 1, 1, 8)},
        {"_id": "e1", "userId": "u", "symbol": "ETHUSDT", "exchange": "binance", "isMaker": False, "fee": 0.5,
         "notional": 500.0, "executedAt": datetime(2024, 1, 3, 10)},
        {"_id": "x1", "userId": "other", "symbol": "BTCUSDT", "exchange": "okx", "isMaker": False, "fee": 9.0,
         "notional": 9000.0, "executedAt": datetime(2024, 1, 1, 7)},
    ]))
    return client


class _Counting:
    def __init__(self, client):
        self.client, self.n = client, 0

    def __call__(self):
        self.n += 1
        return self.client


def test_load_trades_one_symbol_is_normalised_and_sorted():
    with patch.object(loader, "_get_mongo_client", _Counting(_client_with_trades())):
        trades = asyncio.run(loader.load_trades("u", "BTCUSDT"))
    assert [t["id"] for t in trades] == ["b1", "b2"]                 # sorted by executedAt
    assert [t["feePaid"] for t in trades] == [1.0, 2.0]              # no feeUsd -> native fee
    assert [t["notionalValue"] for t in trades] == [1000.0, 2000.0]
    assert "notes" not in trades[1]                                  # projection keeps notes out


def test_load_trades_all_symbols():
    with patch.object(loader, "_get_mongo_client", _Counting(_client_with_trades())):
        trades = asyncio.run(loader.load_trades("u", "ALL"))
    assert [t["id"] for t in trades] == ["b1", "b2", "e1"]


def test_load_run_inputs_reads_once_and_builds_packets_from_those_trades():
    counting = _Counting(_client_with_trades())
    with patch.object(loader, "_get_mongo_client", counting):
        (fee, risk, liq, alpha), trades = asyncio.run(loader.load_run_inputs("u", "BTCUSDT"))
    assert counting.n == 1
    assert len(trades) == 2 and fee.trade_count == 2
    assert fee.total_fee_paid_usd == 3.0                              # 1.0 + 2.0
    assert fee.symbol == risk.symbol == liq.symbol == alpha.symbol == "BTCUSDT"


def test_build_all_packets_matches_the_old_wrappers():
    counting = _Counting(_client_with_trades())
    with patch.object(loader, "_get_mongo_client", counting):
        old = asyncio.run(loader.load_all_packets_for_user("u"))
        trades = asyncio.run(loader.load_trades("u", "ALL"))
    new = loader.build_all_packets(trades, "u", "ALL")
    assert [p.content_hash for p in old] == [p.content_hash for p in new]
    assert old[0].trade_count == 3

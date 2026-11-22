"""Council scope (orders of 2026-11-22, step 1): the audit covers one symbol; the page says how much of the account that is.

Hand values: u1 has 3 BTCUSDT fills and 2 ETHUSDT fills; u2 has 4 BTCUSDT fills.
  u1, "BTCUSDT": symbolFills 3, accountFills 3 + 2 = 5.   u1, "ETHUSDT": 2 of 5.   u2, "BTCUSDT": 4 of 4.
"""
import asyncio
from unittest.mock import patch

import pytest
from mongomock_motor import AsyncMongoMockClient

from agents import council_service
from agents.metrics import loader
from agents.metrics.risk_packet import ALL_SYMBOLS, build_risk_packet
from agents import risk_auditor
from tests.test_risk_packet import FIXTURE_TRADES


def _client():
    c = AsyncMongoMockClient()
    docs = ([{"userId": "u1", "symbol": "BTCUSDT"}] * 3 + [{"userId": "u1", "symbol": "ETHUSDT"}] * 2
            + [{"userId": "u2", "symbol": "BTCUSDT"}] * 4)
    asyncio.run(c["fillscore"]["trades"].insert_many([dict(d) for d in docs]))
    return c


@pytest.mark.parametrize("user,symbol,expected", [
    ("u1", "BTCUSDT", {"symbolFills": 3, "accountFills": 5}),
    ("u1", "ETHUSDT", {"symbolFills": 2, "accountFills": 5}),
    ("u2", "BTCUSDT", {"symbolFills": 4, "accountFills": 4}),
    ("u1", "ALL", {"symbolFills": 5, "accountFills": 5}),
    ("nobody", "BTCUSDT", {"symbolFills": 0, "accountFills": 0}),
])
def test_scope_counts(user, symbol, expected):
    c = _client()
    with patch.object(loader, "_get_mongo_client", lambda: c):
        assert asyncio.run(loader.scope_counts(user, symbol)) == expected


def test_the_scope_event_carries_both_counts():
    events = []

    async def sink(name, data):
        events.append((name, data))

    c = _client()
    with patch.object(loader, "_get_mongo_client", lambda: c):
        asyncio.run(council_service.emit_scope(sink, "u1", "BTCUSDT"))
    assert events == [("scope", {"scope": {"symbol": "BTCUSDT", "symbolFills": 3, "accountFills": 5}})]


def test_no_event_when_the_counts_cannot_be_read():
    events = []

    async def sink(name, data):
        events.append((name, data))

    async def boom(*_a, **_k):
        raise RuntimeError("mongodb://user:secret@host")

    with patch.object(loader, "scope_counts", boom):
        asyncio.run(council_service.emit_scope(sink, "u1", "BTCUSDT"))
    assert events == []                       # nothing is invented; and the error text is never sent
    asyncio.run(council_service.emit_scope(None, "u1", "BTCUSDT"))   # no sink: nothing to do


# ---- the Risk Auditor prompt follows the packet's scope --------------------------------------------------------------
def test_the_prompt_of_a_one_symbol_packet_names_no_concentration_placeholder():
    one = build_risk_packet(FIXTURE_TRADES, "u1", "BTCUSDT")
    p = risk_auditor.system_prompt_for(one)
    assert "{{risk.top_symbol_notional_fraction}}" not in p
    assert "{{risk.top_hour_trade_fraction}}" in p          # the example uses a key the packet holds
    assert "one symbol only" in p
    assert "top_hour_trade_fraction" in one.to_prompt_dict()


def test_the_prompt_of_an_all_symbols_packet_is_unchanged():
    allp = build_risk_packet(FIXTURE_TRADES, "u1", ALL_SYMBOLS)
    p = risk_auditor.system_prompt_for(allp)
    assert p is risk_auditor.SYSTEM_PROMPT
    assert "{{risk.top_symbol_notional_fraction}}" in p and "one symbol only" not in p

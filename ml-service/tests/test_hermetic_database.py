"""No test may reach a real database through the loader's default client.

Why this exists (2026-11-25): `council_flow` sends a `scope` event first, from `loader.scope_counts`, which opens a
Mongo client from MONGODB_URI. Four tests (test_main stream NO_DATA, two in test_quick_deep, one in test_quick_deep_http)
assert the exact list of events and did not patch it. With a Mongo that answered (a local mongod, Atlas) the list gained a
`scope` event and the four failed; with one that did not answer, every flow waited for server selection (30 s) before
`asyncio.run` could close. The result depended on the machine, not on the code.

The fix is in conftest.py: the default client raises at once. A test that wants counts patches the client itself
(as test_council_scope.py does), so the dependency is written in the test.
"""
import asyncio
from unittest.mock import patch

import pytest

from agents import council_service
from agents.metrics import loader


def test_the_default_client_is_not_available_in_tests():
    with pytest.raises(RuntimeError, match="no database in tests"):
        loader._get_mongo_client()


def test_the_scope_event_is_absent_when_no_test_provides_a_database():
    events = []

    async def sink(name, data):
        events.append((name, data))

    asyncio.run(council_service.emit_scope(sink, "u1", "BTCUSDT"))
    assert events == []                      # the counts could not be read, so no number is sent


def test_a_test_that_provides_a_client_still_gets_counts():
    from mongomock_motor import AsyncMongoMockClient
    client = AsyncMongoMockClient()
    events = []

    async def sink(name, data):
        events.append((name, data))

    async def seed():
        await client["fillscore"]["trades"].insert_many(
            [{"userId": "u1", "symbol": "BTCUSDT"}, {"userId": "u1", "symbol": "ETHUSDT"}])

    asyncio.run(seed())
    with patch.object(loader, "_get_mongo_client", lambda: client):
        asyncio.run(council_service.emit_scope(sink, "u1", "BTCUSDT"))
    assert events == [("scope", {"scope": {"symbol": "BTCUSDT", "symbolFills": 1, "accountFills": 2}})]

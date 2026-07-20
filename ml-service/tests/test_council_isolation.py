import pytest
import pytest_asyncio
import os
import uuid
from unittest.mock import AsyncMock, patch, MagicMock

import agents.persistence; from agents.persistence import (
    save_council_run,
    load_council_run,
    list_council_runs,
    _get_db
)

# In-memory mock for council_runs
mock_runs = []

class MockCollection:
    async def delete_many(self, query):
        mock_runs.clear()
        
    async def insert_one(self, doc):
        mock_runs.append(doc)
        
    async def find_one(self, query):
        for run in mock_runs:
            match = True
            for k, v in query.items():
                if run.get(k) != v:
                    match = False
                    break
            if match:
                return dict(run)
        return None
        
    def find(self, query, projection=None):
        results = []
        for run in mock_runs:
            match = True
            for k, v in query.items():
                if run.get(k) != v:
                    match = False
                    break
            if match:
                results.append(dict(run))
        
        class MockCursor:
            def sort(self, *args, **kwargs):
                return self
            def limit(self, *args, **kwargs):
                return self
            async def __aiter__(self):
                for r in results:
                    yield r
                    
        return MockCursor()
        
    async def count_documents(self, query):
        count = 0
        for run in mock_runs:
            match = True
            for k, v in query.items():
                if run.get(k) != v:
                    match = False
                    break
            if match:
                count += 1
        return count

@pytest_asyncio.fixture(autouse=True)
async def mock_db():
    mock_runs.clear()
    client_mock = MagicMock()
    db_mock = {"council_runs": MockCollection()}
    with patch("agents.persistence._get_db", return_value=(client_mock, db_mock)):
        yield

@pytest.mark.asyncio
async def test_save_council_run_persists_account_id():
    """1. save_council_run persists an accountId field."""
    run_id = await save_council_run(
        account_id="account_A",
        user_id="user_A",
        symbol="BTCUSDT",
        council_result_dict={"synthesis": {"overallRating": "GOOD"}},
        grounding_summary={},
        packet_hashes={},
        model_usage={},
        total_latency_ms=100.0
    )
    
    client, db = agents.persistence._get_db()
    doc = await db["council_runs"].find_one({"run_id": run_id})
    assert doc is not None
    assert doc["accountId"] == "account_A"

@pytest.mark.asyncio
async def test_list_council_runs_scoped_by_account_id():
    """2. list_council_runs filtered by accountId returns ONLY that account's runs."""
    await save_council_run(
        account_id="account_A", user_id="user_A", symbol="BTCUSDT",
        council_result_dict={}, grounding_summary={}, packet_hashes={}, model_usage={}, total_latency_ms=100.0
    )
    await save_council_run(
        account_id="account_B", user_id="user_B", symbol="BTCUSDT",
        council_result_dict={}, grounding_summary={}, packet_hashes={}, model_usage={}, total_latency_ms=100.0
    )
    
    runs = await list_council_runs(account_id="account_A")
    assert len(runs) == 1
    assert runs[0]["accountId"] == "account_A"
    
@pytest.mark.asyncio
async def test_load_council_run_scoped_by_account_id():
    """3. load_council_run must NOT return B's runs even if given B's run_id."""
    run_id_B = await save_council_run(
        account_id="account_B", user_id="user_B", symbol="BTCUSDT",
        council_result_dict={}, grounding_summary={}, packet_hashes={}, model_usage={}, total_latency_ms=100.0
    )
    
    # Query B's run under A's account
    run = await load_council_run(run_id=run_id_B, account_id="account_A")
    assert run is None

@pytest.mark.asyncio
async def test_persistence_fire_and_forget():
    """4. if accountId is missing/None, function does not crash the council and does not create a document."""
    try:
        run_id = await save_council_run(
            account_id=None,
            user_id="user_C",
            symbol="BTCUSDT",
            council_result_dict={},
            grounding_summary={},
            packet_hashes={},
            model_usage={},
            total_latency_ms=100.0
        )
        assert run_id is None, "save_council_run should return None for orphan records"
        
        # Verify no document was actually created
        client, db = agents.persistence._get_db()
        count = await db["council_runs"].count_documents({"user_id": "user_C"})
        assert count == 0, "No document should be created for orphan records"
    except Exception as e:
        pytest.fail(f"save_council_run threw an exception instead of failing gracefully: {e}")

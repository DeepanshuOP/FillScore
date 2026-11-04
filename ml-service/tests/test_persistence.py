"""
Tests for persistence.py — mocked MongoDB so no Atlas connection needed.
"""
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch


# ── Helpers ───────────────────────────────────────────────────────────────────

def async_return(val):
    """Return a coroutine that resolves to val."""
    async def _inner(*args, **kwargs):
        return val
    return _inner


class AsyncCursorMock:
    """Minimal async cursor mock for list_council_runs tests."""
    def __init__(self, docs):
        self._docs = docs

    def sort(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def __aiter__(self):
        return self._aiter()

    async def _aiter(self):
        for doc in self._docs:
            yield doc


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestSaveCouncilRun:
    def test_returns_run_id_string(self):
        """save_council_run should return a UUID string."""
        mock_collection = MagicMock()
        mock_collection.insert_one = AsyncMock(return_value=None)
        mock_db = MagicMock()
        mock_db.__getitem__ = MagicMock(return_value=mock_collection)
        mock_client = MagicMock()
        mock_client.close = MagicMock()

        with patch("agents.persistence._get_db", return_value=(mock_client, mock_db)):
            import asyncio
            from agents.persistence import save_council_run
            run_id = asyncio.run(save_council_run(
                account_id="a1", user_id="u1",
                symbol="BTCUSDT",
                council_result_dict={"synthesis": {"overallRating": "FAIR"}},
                grounding={"faithfulness_after": 0.9, "violations_first_pass": 1},
                packet_hashes={"fee": "abc", "risk": "def", "liquidity": "ghi", "alpha": "jkl"},
                model_usage={"specialists": "llama", "synthesis": "llama"},
                total_latency_ms=2500.0,
            ))
            assert isinstance(run_id, str)
            assert len(run_id) == 36  # UUID format

    def test_insert_called_once(self):
        mock_collection = MagicMock()
        mock_collection.insert_one = AsyncMock(return_value=None)
        mock_db = MagicMock()
        mock_db.__getitem__ = MagicMock(return_value=mock_collection)
        mock_client = MagicMock()
        mock_client.close = MagicMock()

        with patch("agents.persistence._get_db", return_value=(mock_client, mock_db)):
            from agents.persistence import save_council_run
            asyncio.run(save_council_run(
                account_id="a1", user_id="u1", symbol="BTCUSDT",
                council_result_dict={"synthesis": {"overallRating": "GOOD"}},
                grounding={"faithfulness_after": 1.0, "violations_first_pass": 0},
                packet_hashes={}, model_usage={}, total_latency_ms=1000.0,
            ))
            mock_collection.insert_one.assert_called_once()

    def test_document_structure(self):
        """Verify the persisted document has required fields."""
        inserted_doc = {}

        async def capture_insert(doc):
            inserted_doc.update(doc)

        mock_collection = MagicMock()
        mock_collection.insert_one = capture_insert
        mock_db = MagicMock()
        mock_db.__getitem__ = MagicMock(return_value=mock_collection)
        mock_client = MagicMock()
        mock_client.close = MagicMock()

        with patch("agents.persistence._get_db", return_value=(mock_client, mock_db)):
            from agents.persistence import save_council_run
            asyncio.run(save_council_run(
                account_id="a1", user_id="u1", symbol="BTCUSDT",
                council_result_dict={"synthesis": {"overallRating": "POOR"}},
                grounding={"faithfulness_after": 0.8, "violations_first_pass": 2},
                verification={"proposed": 1},
                packet_hashes={"fee": "hash1"}, model_usage={}, total_latency_ms=3000.0,
            ))

        required_fields = [
            "run_id", "user_id", "symbol", "created_at", "prompt_version",
            "total_latency_ms", "packet_hashes", "grounding", "verification",
            "council_result", "overall_rating", "avg_faithfulness_score",
            "total_violations", "data_source",
        ]
        for f in required_fields:
            assert f in inserted_doc, f"Missing field: {f}"
        assert inserted_doc["avg_faithfulness_score"] == 0.8 and inserted_doc["total_violations"] == 2
        assert inserted_doc["verification"] == {"proposed": 1}

    def test_overall_rating_extracted(self):
        """overall_rating should be extracted from council_result for easy querying."""
        inserted_doc = {}

        async def capture_insert(doc):
            inserted_doc.update(doc)

        mock_collection = MagicMock()
        mock_collection.insert_one = capture_insert
        mock_db = MagicMock()
        mock_db.__getitem__ = MagicMock(return_value=mock_collection)
        mock_client = MagicMock()
        mock_client.close = MagicMock()

        with patch("agents.persistence._get_db", return_value=(mock_client, mock_db)):
            from agents.persistence import save_council_run
            asyncio.run(save_council_run(
                account_id="a1", user_id="u1", symbol="BTCUSDT",
                council_result_dict={"synthesis": {"overallRating": "CRITICAL"}},
                grounding={}, packet_hashes={}, model_usage={},
                total_latency_ms=1000.0,
            ))
        assert inserted_doc["overall_rating"] == "CRITICAL"

    def test_data_source_is_synthetic_for_demo(self):
        inserted_doc = {}
        async def capture_insert(doc):
            inserted_doc.update(doc)
        mock_collection = MagicMock()
        mock_collection.insert_one = capture_insert
        mock_db = MagicMock()
        mock_db.__getitem__ = MagicMock(return_value=mock_collection)
        mock_client = MagicMock()
        mock_client.close = MagicMock()
        with patch("agents.persistence._get_db", return_value=(mock_client, mock_db)):
            from agents.persistence import save_council_run
            asyncio.run(save_council_run(
                account_id="demo-disciplined", user_id="demo-disciplined", symbol="BTCUSDT",
                council_result_dict={}, grounding={}, packet_hashes={}, model_usage={}, total_latency_ms=10.0,
            ))
        assert inserted_doc["data_source"] == "synthetic-demo"

    def test_data_source_is_real_user_for_others(self):
        inserted_doc = {}
        async def capture_insert(doc):
            inserted_doc.update(doc)
        mock_collection = MagicMock()
        mock_collection.insert_one = capture_insert
        mock_db = MagicMock()
        mock_db.__getitem__ = MagicMock(return_value=mock_collection)
        mock_client = MagicMock()
        mock_client.close = MagicMock()
        with patch("agents.persistence._get_db", return_value=(mock_client, mock_db)):
            from agents.persistence import save_council_run
            asyncio.run(save_council_run(
                account_id="some-real-uid", user_id="some-real-uid", symbol="BTCUSDT",
                council_result_dict={}, grounding={}, packet_hashes={}, model_usage={}, total_latency_ms=10.0,
            ))
        assert inserted_doc["data_source"] == "real-user"


class TestLoadCouncilRun:
    def test_returns_none_when_not_found(self):
        mock_collection = MagicMock()
        mock_collection.find_one = AsyncMock(return_value=None)
        mock_db = MagicMock()
        mock_db.__getitem__ = MagicMock(return_value=mock_collection)
        mock_client = MagicMock()
        mock_client.close = MagicMock()

        with patch("agents.persistence._get_db", return_value=(mock_client, mock_db)):
            from agents.persistence import load_council_run
            result = asyncio.run(load_council_run("nonexistent-run-id", "a1"))
            assert result is None

    def test_strips_mongo_id(self):
        """MongoDB _id field should be stripped from returned document."""
        mock_collection = MagicMock()
        mock_collection.find_one = AsyncMock(return_value={
            "_id": "mongo_object_id",
            "run_id": "test-run-1",
            "user_id": "u1",
        })
        mock_db = MagicMock()
        mock_db.__getitem__ = MagicMock(return_value=mock_collection)
        mock_client = MagicMock()
        mock_client.close = MagicMock()

        with patch("agents.persistence._get_db", return_value=(mock_client, mock_db)):
            from agents.persistence import load_council_run
            result = asyncio.run(load_council_run("test-run-1", "a1"))
            assert "_id" not in result
            assert result["run_id"] == "test-run-1"


class TestSaveAgentTrace:
    def test_trace_inserted(self):
        mock_collection = MagicMock()
        mock_collection.insert_one = AsyncMock(return_value=None)
        mock_db = MagicMock()
        mock_db.__getitem__ = MagicMock(return_value=mock_collection)
        mock_client = MagicMock()
        mock_client.close = MagicMock()

        with patch("agents.persistence._get_db", return_value=(mock_client, mock_db)):
            from agents.persistence import save_agent_trace
            asyncio.run(save_agent_trace(
                run_id="run-1", agent_name="fee_optimizer",
                prompt_text="...", raw_llm_output='{"feeRating":"WASTEFUL"}',
                parsed_verdict={"feeRating": "WASTEFUL"},
                input_tokens=500, output_tokens=100, latency_ms=800.0,
                model="llama-3.3-70b-versatile", grounding_score=1.0,
            ))
            mock_collection.insert_one.assert_called_once()
            call_args = mock_collection.insert_one.call_args[0][0]
            assert call_args["total_tokens"] == 600
            assert call_args["agent_name"] == "fee_optimizer"


def test_telemetry_excludes_legacy_runs():
    """1c.7: legacy runs never enter telemetry, even with include_degraded=True."""
    from mongomock_motor import AsyncMongoMockClient
    from agents import persistence

    client = AsyncMongoMockClient()
    db = client["x"]

    async def go():
        await db.council_runs.insert_many([
            {"run_id": "a", "total_latency_ms": 100.0, "avg_faithfulness_score": 1.0, "total_violations": 0, "overall_rating": "A"},
            {"run_id": "b", "legacy": True, "degraded": False, "total_latency_ms": 900.0, "avg_faithfulness_score": 0.0, "total_violations": 5, "overall_rating": "F"},
        ])
        with patch.object(persistence, "_get_db", return_value=(MagicMock(), db)):
            return (await persistence.get_telemetry_summary(),
                    await persistence.get_telemetry_summary(include_degraded=True))

    plain, inc = asyncio.run(go())
    assert plain["total_runs"] == 1 and plain["avg_latency_ms"] == 100.0
    assert inc["total_runs"] == 1


def test_telemetry_faithfulness_reads_grounding_and_skips_null():
    """1c.3: avg faithfulness = $avg of grounding.faithfulness_after; null (number-free run) is skipped.
    Runs: 0.8, 1.0, null -> (0.8 + 1.0) / 2 = 0.9 ; violations 3 + 0 + 0 = 3."""
    from mongomock_motor import AsyncMongoMockClient
    from agents import persistence

    db = AsyncMongoMockClient()["x"]

    async def go():
        await db.council_runs.insert_many([
            {"run_id": "a", "degraded": False, "total_latency_ms": 1.0,
             "grounding": {"faithfulness_after": 0.8, "violations_first_pass": 3}},
            {"run_id": "b", "degraded": False, "total_latency_ms": 1.0,
             "grounding": {"faithfulness_after": 1.0, "violations_first_pass": 0}},
            {"run_id": "c", "degraded": False, "total_latency_ms": 1.0,
             "grounding": {"faithfulness_after": None, "violations_first_pass": 0}},
        ])
        with patch.object(persistence, "_get_db", return_value=(MagicMock(), db)):
            return await persistence.get_telemetry_summary()

    r = asyncio.run(go())
    assert r["total_runs"] == 3
    assert r["avg_faithfulness"] == pytest.approx(0.9)
    assert r["total_violations"] == 3

"""Phase 1b.5: fewer calls, same honesty.

- content-hash cache: a fresh non-degraded run with identical inputs is returned with zero calls;
- demo accounts are never run live (F-09): stored run → committed fixture → "not generated";
- signed-in users keep the 3/hour quota and get a "try tomorrow" refusal when the router budget is gone.
"""
from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import main
from agents.errors import CouncilError
from config.budget import council_budget
from config.versions import METRICS_VERSION, PROMPT_VERSION
from tests.council_fakes import DAY, ROUTES, make_packets, make_router

client = TestClient(main.app)
USER = "acct-real-2"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    council_budget.reset()
    monkeypatch.setenv("COUNCIL_ENABLED", "true")
    monkeypatch.setenv("COUNCIL_DAILY_RUN_CAP", "100")
    monkeypatch.delenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", raising=False)   # default: 3 per hour
    yield
    council_budget.reset()


def _flow(router, db, account=USER, packets=None, loads=None):
    from agents.council_service import council_flow

    packets = packets or make_packets()

    async def load(*_a, **_k):
        if loads is not None:
            loads.append(1)
        return packets, []          # (packets, trades)

    with patch("agents.council_service._router", return_value=router), \
         patch("agents.metrics.loader.load_run_inputs", load), \
         patch("agents.persistence._get_db", return_value=(MagicMock(), db)):
        return asyncio.run(council_flow(account, "BTCUSDT"))


def _stored_run(router, account=USER, created=None, degraded=False, **overrides):
    """A council_runs document shaped like save_council_run writes, for the cache to find."""
    fee, risk, liq, alpha = make_packets()
    from tests.council_fakes import SYNTHESIS

    result = {
        "tradeContext": {"userId": account, "symbol": "BTCUSDT"},
        "liquidity": {"liquidityRating": "GOOD", "slippageRoot": "x", "confidence": 0.5},
        "alpha": {"alphaRating": "NEUTRAL", "bestAlternative": "x", "confidence": 0.5},
        "risk": {"riskLevel": "LOW", "confidence": 0.5},
        "fee": {"feeRating": "OPTIMAL", "recommendedAction": "x", "confidence": 0.5},
        "synthesis": {**SYNTHESIS, "estimatedMonthlyCostUSD": 328.0},
        "totalLatencyMs": 1.0, "modelUsage": {}, "degraded": degraded, "run_id": "stored-1",
    }
    doc = {
        "run_id": "stored-1", "accountId": account, "symbol": "BTCUSDT",
        "created_at": (created or datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        "prompt_version": PROMPT_VERSION, "metrics_version": METRICS_VERSION,
        "route_config_hash": router.config.hash, "degraded": degraded,
        "packet_hashes": {"fee": fee.content_hash, "risk": risk.content_hash,
                          "liquidity": liq.content_hash, "alpha": alpha.content_hash},
        "council_result": result,
    }
    doc.update(overrides)
    return doc


# ── content-hash cache ───────────────────────────────────────────────────────

def test_identical_inputs_are_served_from_cache_with_zero_calls():
    router, provider = make_router()
    db = AsyncMongoMockClient()["fillscore"]
    asyncio.run(db["council_runs"].insert_one(_stored_run(router)))
    result = _flow(router, db)
    assert result.cached is True and result.run_id == "stored-1"
    assert provider.calls == []
    assert council_budget.try_acquire(USER).allowed     # the cache hit used no quota (3 left before this)


def test_a_live_run_is_cached_for_the_next_identical_request():
    router, provider = make_router()
    db = AsyncMongoMockClient()["fillscore"]
    first = _flow(router, db)
    calls_after_first = len(provider.calls)
    second = _flow(router, db)
    assert first.cached is False and calls_after_first == 9
    assert second.cached is True and second.run_id == first.run_id
    assert len(provider.calls) == 9                     # no new calls


@pytest.mark.parametrize("why, overrides", [
    ("degraded", {"degraded": True}),
    ("8 days old", {"created_at": (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()}),
    ("other route config", {"route_config_hash": "0000000000000000"}),
    ("other prompt version", {"prompt_version": "0.0.1"}),
    ("other metrics version", {"metrics_version": "0.0.1"}),
    ("other packet", {"packet_hashes": {"fee": "x", "risk": "x", "liquidity": "x", "alpha": "x"}}),
    ("other account", {"accountId": "someone-else"}),
])
def test_cache_misses_run_live(why, overrides):
    router, provider = make_router()
    db = AsyncMongoMockClient()["fillscore"]
    asyncio.run(db["council_runs"].insert_one(_stored_run(router, **overrides)))
    result = _flow(router, db)
    assert result.cached is False, why
    assert len(provider.calls) == 9


# ── demo accounts never run live (F-09) ──────────────────────────────────────

def test_demo_request_serves_the_latest_stored_run_without_calls_or_packet_loads():
    router, provider = make_router()
    db = AsyncMongoMockClient()["fillscore"]
    older = _stored_run(router, account="demo-aggressive", run_id="old",
                        created=datetime.now(timezone.utc) - timedelta(days=30))
    newer = _stored_run(router, account="demo-aggressive", run_id="new",
                        created=datetime.now(timezone.utc) - timedelta(days=20))
    degraded_newest = _stored_run(router, account="demo-aggressive", run_id="broken", degraded=True,
                                  created=datetime.now(timezone.utc) - timedelta(days=1))
    asyncio.run(db["council_runs"].insert_many([older, newer, degraded_newest]))
    loads = []
    result = _flow(router, db, account="demo-aggressive", loads=loads)
    assert result.run_id == "new" and result.cached is True        # newest NON-degraded, any age
    assert provider.calls == [] and loads == []


def test_demo_request_falls_back_to_the_committed_fixture(tmp_path):
    router, provider = make_router()
    stored = _stored_run(router, account="demo-moderate")
    (tmp_path / "demo-moderate.json").write_text(json.dumps({
        "account_id": "demo-moderate", "symbol": "BTCUSDT", "generated_at": "2026-11-04T00:00:00+00:00",
        "council_result": {**stored["council_result"], "run_id": "fixture-1"},
    }))
    db = AsyncMongoMockClient()["fillscore"]
    with patch("agents.council_service.DEMO_RUNS_DIR", tmp_path):
        result = _flow(router, db, account="demo-moderate")
    assert result.run_id == "fixture-1" and result.cached is True
    assert provider.calls == []


def test_demo_request_uses_the_fixture_when_the_database_is_down(tmp_path):
    router, provider = make_router()
    stored = _stored_run(router, account="demo-moderate")
    (tmp_path / "demo-moderate.json").write_text(json.dumps({"account_id": "demo-moderate", "symbol": "BTCUSDT",
                                                             "council_result": stored["council_result"]}))

    async def db_down(*_a, **_k):
        raise RuntimeError("bad auth")

    from agents.council_service import council_flow
    with patch("agents.council_service.DEMO_RUNS_DIR", tmp_path), \
         patch("agents.persistence.latest_demo_run", db_down):
        result = asyncio.run(council_flow("demo-moderate", "BTCUSDT", llm=router))
    assert result.cached is True and provider.calls == []


def test_demo_without_a_stored_run_or_fixture_is_not_generated(tmp_path):
    router, provider = make_router()
    db = AsyncMongoMockClient()["fillscore"]
    with patch("agents.council_service.DEMO_RUNS_DIR", tmp_path), pytest.raises(CouncilError) as info:
        _flow(router, db, account="demo-aggressive")
    assert info.value.code == "DEMO_NOT_GENERATED"
    assert provider.calls == []


def test_anonymous_demo_stream_says_not_generated_and_makes_no_calls(tmp_path, monkeypatch):
    router, provider = make_router()
    db = AsyncMongoMockClient()["fillscore"]
    with patch("agents.council_service._router", return_value=router), \
         patch("agents.persistence._get_db", return_value=(MagicMock(), db)), \
         patch("agents.council_service.DEMO_RUNS_DIR", tmp_path):
        res = client.post("/ml/agents/council/stream", json={"userId": "demo-aggressive", "symbol": "BTCUSDT"})
        plain = client.post("/ml/agents/council", json={"userId": "demo-aggressive", "symbol": "BTCUSDT"})
    assert "event: error" in res.text and "DEMO_NOT_GENERATED" in res.text
    assert "Demo analysis not generated yet" in res.text
    assert plain.status_code == 404 and plain.json()["detail"]["code"] == "DEMO_NOT_GENERATED"
    assert provider.calls == []


def test_committed_demo_fixtures_are_never_degraded():
    from agents.council_service import DEMO_RUNS_DIR
    from agents.schemas import CouncilResult

    for path in DEMO_RUNS_DIR.glob("*.json"):
        data = json.loads(path.read_text())
        assert CouncilResult.model_validate(data["council_result"]).degraded is False, path.name


# ── signed-in quotas ─────────────────────────────────────────────────────────

def test_signed_in_users_keep_the_three_per_hour_quota():
    router, provider = make_router()
    results = []
    for i in range(3):
        db = AsyncMongoMockClient()["fillscore"]     # fresh DB each time: no cache hits
        results.append(_flow(router, db))
    with pytest.raises(CouncilError) as info:
        _flow(router, AsyncMongoMockClient()["fillscore"])
    assert info.value.code == "RATE_LIMIT_EXHAUSTED"
    assert len(provider.calls) == 27                  # 3 runs x 9 calls, none for the 4th


def test_an_exhausted_router_budget_refuses_with_try_tomorrow_and_no_calls():
    usage_db = AsyncMongoMockClient()["usage"]
    # specialist model has 1000 requests/day; 999 are used and a run needs 4 + 4 on it -> refused
    asyncio.run(usage_db["llm_usage"].insert_one(
        {"provider": "fake", "model": "fake-small", "day_utc": DAY, "requests": 999, "tokens": 0}))
    router, provider = make_router(db=usage_db)
    token = jwt.encode({"exp": int(time.time()) + 60, "userId": USER, "typ": "access"},
                       main.JWT_ACCESS_SECRET, algorithm="HS256")

    async def load(*_a, **_k):
        return make_packets(), []

    db = AsyncMongoMockClient()["fillscore"]
    with patch("agents.council_service._router", return_value=router), \
         patch("agents.metrics.loader.load_run_inputs", load), \
         patch("agents.persistence._get_db", return_value=(MagicMock(), db)):
        res = client.post("/ml/agents/council/stream", json={"symbol": "BTCUSDT"},
                          headers={"Authorization": f"Bearer {token}"})
        plain = client.post("/ml/agents/council", json={"symbol": "BTCUSDT"},
                            headers={"Authorization": f"Bearer {token}"})
    assert "DAILY_BUDGET_EXHAUSTED" in res.text and "try again tomorrow" in res.text
    assert "event: complete" not in res.text          # refused, not a degraded run
    assert plain.status_code == 429 and plain.json()["detail"]["code"] == "DAILY_BUDGET_EXHAUSTED"
    assert provider.calls == []
    assert asyncio.run(db["council_runs"].count_documents({})) == 0
    # the refusal did not use the per-account quota: 3 of 3 still free
    assert all(council_budget.try_acquire(USER).allowed for _ in range(3))


def test_demo_runs_from_an_older_prompt_version_are_not_served(tmp_path):
    router, provider = make_router()
    db = AsyncMongoMockClient()["fillscore"]
    asyncio.run(db["council_runs"].insert_one(_stored_run(router, account="demo-aggressive", prompt_version="0.9.0")))
    with patch("agents.council_service.DEMO_RUNS_DIR", tmp_path), pytest.raises(CouncilError) as info:
        _flow(router, db, account="demo-aggressive")
    assert info.value.code == "DEMO_NOT_GENERATED" and provider.calls == []


def test_no_provider_key_is_a_config_error_not_a_budget_refusal():
    router, provider = make_router(env={})
    with pytest.raises(CouncilError) as info:
        _flow(router, AsyncMongoMockClient()["fillscore"])
    assert info.value.code == "MODEL_UNAVAILABLE" and provider.calls == []
    assert all(council_budget.try_acquire(USER).allowed for _ in range(3))   # quota untouched

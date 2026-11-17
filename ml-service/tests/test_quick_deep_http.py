"""M3 §3 and §4 over HTTP: the `mode` of the request, the Quick result, the refusal that offers Quick, the budget status."""
from __future__ import annotations

import json
import time
from contextlib import ExitStack
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import main
from config.budget import council_budget
from tests.council_fakes import make_packets, make_router

client = TestClient(main.app)
USER = "acct-real-h"


def _token(user=USER):
    return jwt.encode({"exp": int(time.time()) + 300, "userId": user, "typ": "access"}, main.JWT_ACCESS_SECRET, algorithm="HS256")


def _h():
    return {"Authorization": f"Bearer {_token()}"}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    council_budget.reset()
    monkeypatch.setenv("COUNCIL_ENABLED", "true")
    monkeypatch.setenv("COUNCIL_DAILY_RUN_CAP", "100")
    monkeypatch.delenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", raising=False)
    yield
    council_budget.reset()


def _patched(router, packets=None):
    db = AsyncMongoMockClient()["fillscore"]
    packets = packets or make_packets()

    async def load(*_a, **_k):
        return packets, []

    stack = ExitStack()
    stack.enter_context(patch("agents.council_service._router", return_value=router))
    stack.enter_context(patch("agents.metrics.loader.load_run_inputs", load))
    stack.enter_context(patch("agents.persistence._get_db", return_value=(MagicMock(), db)))
    return stack


def _sse(text):
    events = []
    for block in text.strip().split("\n\n"):
        lines = block.split("\n")
        name = next((l[7:] for l in lines if l.startswith("event: ")), None)
        data = next((l[6:] for l in lines if l.startswith("data: ")), None)
        if name and data:
            events.append((name, json.loads(data)))
    return events


def test_quick_over_http_is_one_call_and_has_no_specialists():
    router, provider = make_router()
    with _patched(router):
        res = client.post("/ml/agents/council", json={"symbol": "BTCUSDT", "mode": "quick"}, headers=_h())
    assert res.status_code == 200
    b = res.json()
    assert b["mode"] == "quick" and b["n_calls_ok"] == 1 and "liquidity" not in b and b["synthesis"]["overallRating"] == "GOOD"
    assert len(provider.calls) == 1


def test_without_a_mode_the_api_runs_the_council_as_before():
    router, provider = make_router()
    with _patched(router):
        res = client.post("/ml/agents/council", json={"symbol": "BTCUSDT"}, headers=_h())
    assert res.status_code == 200 and "liquidity" in res.json() and len(provider.calls) >= 9


def test_an_unknown_mode_is_a_validation_error():
    router, _ = make_router()
    with _patched(router):
        assert client.post("/ml/agents/council", json={"symbol": "BTCUSDT", "mode": "turbo"}, headers=_h()).status_code == 422


def test_a_refused_deep_run_answers_429_and_says_quick_is_available(monkeypatch):
    monkeypatch.setenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", "1")
    router, _ = make_router()
    with _patched(router):
        assert client.post("/ml/agents/council", json={"symbol": "BTCUSDT", "mode": "quick"}, headers=_h()).status_code == 200   # 1 of 9 units
        council_budget.try_acquire(USER, 2)                                                                                     # 3 of 9 units
        res = client.post("/ml/agents/council", json={"symbol": "BTCUSDT", "mode": "deep"},
                          headers=_h())
    assert res.status_code == 429
    d = res.json()["detail"]
    assert d["code"] == "RATE_LIMIT_EXHAUSTED" and d["quick_available"] is True
    assert "Quick" in d["message"] and int(res.headers["Retry-After"]) > 0


def test_the_stream_of_a_quick_audit_has_three_events_and_the_refusal_event_carries_the_offer(monkeypatch):
    router, _ = make_router()
    with _patched(router):
        res = client.post("/ml/agents/council/stream", json={"symbol": "BTCUSDT", "mode": "quick"}, headers=_h())
    ev = _sse(res.text)
    assert [n for n, _ in ev] == ["synthesis_done", "gate_done", "complete"] and ev[-1][1]["mode"] == "quick"
    monkeypatch.setenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", "1")
    council_budget.reset()
    council_budget.try_acquire(USER, 5)
    router2, _ = make_router()
    with _patched(router2, make_packets(total_fee_paid_usd=777.0)):
        res = client.post("/ml/agents/council/stream", json={"symbol": "BTCUSDT", "mode": "deep"}, headers=_h())
    err = [d for n, d in _sse(res.text) if n == "error"][0]
    assert err["code"] == "RATE_LIMIT_EXHAUSTED" and err["quick_available"] is True and "Quick" in err["message"]


def test_budget_status_endpoint_needs_a_token_and_reports_units(monkeypatch):
    monkeypatch.setenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", "2")
    assert client.get("/ml/agents/council/budget").status_code == 401
    council_budget.try_acquire(USER, 1)
    b = client.get("/ml/agents/council/budget", headers=_h()).json()
    assert b["account"] == {"unitsLeft": 17, "deepLeft": 1, "quickLeft": 17, "retryAfterS": 0}
    assert b["deepAvailable"] is True and b["quickAvailable"] is True and b["units"] == {"deep": 9, "quick": 1}


def test_budget_status_for_a_demo_account_says_it_runs_nothing_live():
    b = client.get("/ml/agents/council/budget?userId=demo-moderate").json()
    assert b["demo"] is True

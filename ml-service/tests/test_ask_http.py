"""POST /ml/agents/ask: a signed-in account asks a question about its own past executions; demo accounts are refused; each question costs
2 budget units (a planner call and an answerer call); the data read is the caller's own."""
from __future__ import annotations

import time
from contextlib import ExitStack
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

import main
from config.budget import council_budget
from tests.council_fakes import make_router

client = TestClient(main.app)
USER = "acct-real-ask"
SCORE = {"scoringVersion": "v2.3.0", "result": {"grade": "A", "composite": 93.4, "band": [92.5, 94.1], "fills": 40, "orders": 30}}
MS = [{"orderId": "o1", "symbol": "BTCUSDT", "shortfall": {"totalBps": 4.0, "executionBps": 2.0, "feesBps": 0.5, "opportunityBps": 0.0,
                                                           "intendedNotional": 20000, "fillRatio": 1.0}, "unmeasuredReason": None, "expectedCost": None}]


def _token(user=USER):
    return jwt.encode({"exp": int(time.time()) + 300, "userId": user, "typ": "access"}, main.JWT_ACCESS_SECRET, algorithm="HS256")


def _h(user=USER):
    return {"Authorization": f"Bearer {_token(user)}"}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    council_budget.reset()
    monkeypatch.setenv("COUNCIL_ENABLED", "true")
    monkeypatch.setenv("COUNCIL_DAILY_RUN_CAP", "100")
    monkeypatch.delenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", raising=False)
    yield
    council_budget.reset()


def _patched(router, seen=None):
    async def load(account_id):
        if seen is not None:
            seen.append(account_id)
        return SCORE, MS

    stack = ExitStack()
    stack.enter_context(patch("agents.ask_service._router", return_value=router))
    stack.enter_context(patch("agents.ask_service.load_account_data", load))
    return stack


def test_a_signed_in_account_gets_an_answer_from_its_own_data():
    router, provider = make_router()
    seen: list = []
    with _patched(router, seen):
        res = client.post("/ml/agents/ask", json={"question": "How did my orders do?"}, headers=_h())
    assert res.status_code == 200
    b = res.json()
    # one order: 4 bps x 20,000 USD / 10,000 = $8.00
    assert b["mode"] == "ask" and b["answer"] == "The measured score was A at 93.4 and the orders cost $8.00."
    assert b["tools_used"] == ["score", "costs"] and b["n_calls"] == 2 and len(provider.calls) == 2
    assert seen == [USER]                                                   # the data read is the token's account


def test_each_question_costs_two_budget_units(monkeypatch):
    monkeypatch.setenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", "1")               # 9 units per hour
    router, _ = make_router()
    with _patched(router):
        for _ in range(4):
            assert client.post("/ml/agents/ask", json={"question": "How did my orders do?"}, headers=_h()).status_code == 200
        res = client.post("/ml/agents/ask", json={"question": "And again?"}, headers=_h())      # 4 x 2 = 8 used; 2 more would be 10 > 9
    assert res.status_code == 429
    assert res.json()["detail"]["code"] == "RATE_LIMIT_EXHAUSTED" and int(res.headers["Retry-After"]) > 0


def test_a_question_that_is_empty_after_cleaning_costs_nothing(monkeypatch):
    """Review finding 7: no model call, so no units either."""
    monkeypatch.setenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", "1")
    router, provider = make_router()
    with _patched(router):
        res = client.post("/ml/agents/ask", json={"question": "   \u0000\u001b[31m  "}, headers=_h())
    assert res.status_code == 200 and res.json()["tools_used"] == [] and provider.calls == []
    assert council_budget.status(USER)["account"]["unitsLeft"] == 9


def test_a_refused_question_makes_no_model_call(monkeypatch):
    monkeypatch.setenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", "1")
    council_budget.try_acquire(USER, 9)
    router, provider = make_router()
    with _patched(router):
        assert client.post("/ml/agents/ask", json={"question": "How did my orders do?"}, headers=_h()).status_code == 429
    assert provider.calls == []


def test_a_demo_account_is_refused_and_no_model_runs():
    router, provider = make_router()
    with _patched(router):
        res = client.post("/ml/agents/ask", json={"question": "How did my orders do?", "userId": "demo-moderate"})
    assert res.status_code == 403 and res.json()["detail"]["code"] == "ASK_NOT_AVAILABLE_FOR_DEMO"
    assert provider.calls == []


def test_no_token_is_401_and_a_foreign_user_id_is_403():
    router, _ = make_router()
    with _patched(router):
        assert client.post("/ml/agents/ask", json={"question": "x"}).status_code == 401
        assert client.post("/ml/agents/ask", json={"question": "x", "userId": "someone-else"}).status_code == 403


def test_the_body_is_validated():
    router, _ = make_router()
    with _patched(router):
        assert client.post("/ml/agents/ask", json={}, headers=_h()).status_code == 422
        assert client.post("/ml/agents/ask", json={"question": "x" * 5000}, headers=_h()).status_code == 422
        assert client.post("/ml/agents/ask", json={"question": 5}, headers=_h()).status_code == 422
        assert client.post("/ml/agents/ask", json={"question": "ok", "tools": ["shell"]}, headers=_h()).status_code == 200   # unknown field is ignored


def test_the_switch_that_turns_the_council_off_turns_ask_off_too(monkeypatch):
    monkeypatch.setenv("COUNCIL_ENABLED", "false")
    router, provider = make_router()
    with _patched(router):
        res = client.post("/ml/agents/ask", json={"question": "How did my orders do?"}, headers=_h())
    assert res.status_code == 503 and provider.calls == []

"""
Tests for main.py's /health, /ready, /version endpoints.
Mongo is mocked (via main._get_db), matching this project's established
convention for these tests (see tests/test_persistence.py) — no live Atlas
connection needed.
"""
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)

# Hand-computed fixture: main.py's FastAPI(...) constructor sets version="0.1.0"
EXPECTED_VERSION = "0.1.0"


def test_health_returns_200_with_model_info():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert "specialists" in body["models"]
    assert "synthesis" in body["models"]


def test_version_returns_app_version():
    res = client.get("/version")
    assert res.status_code == 200
    assert res.json() == {"version": EXPECTED_VERSION}


def test_ready_returns_200_when_mongo_and_groq_ok(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")
    fake_db = MagicMock()
    fake_db.client.admin.command.return_value = {"ok": 1.0}
    with patch("main._get_db", return_value=fake_db):
        res = client.get("/ready")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ready"
    assert body["checks"] == {"mongo": True, "groq_api_key": True}


def test_ready_returns_503_when_mongo_ping_fails(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")
    fake_db = MagicMock()
    fake_db.client.admin.command.side_effect = Exception("connection refused")
    with patch("main._get_db", return_value=fake_db):
        res = client.get("/ready")
    assert res.status_code == 503
    body = res.json()
    assert body["status"] == "not ready"
    assert body["checks"] == {"mongo": False, "groq_api_key": True}


def test_ready_returns_503_when_groq_key_missing(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    fake_db = MagicMock()
    fake_db.client.admin.command.return_value = {"ok": 1.0}
    with patch("main._get_db", return_value=fake_db):
        res = client.get("/ready")
    assert res.status_code == 503
    body = res.json()
    assert body["status"] == "not ready"
    assert body["checks"] == {"mongo": True, "groq_api_key": False}


# ---------------------------------------------------------------------------
# R6-D9: Council kill switch
# ---------------------------------------------------------------------------

def test_council_returns_503_when_flag_disabled(monkeypatch):
    monkeypatch.setenv("COUNCIL_ENABLED", "false")
    # deliberately no mock for main._get_db: a 503 here with no DB error proves
    # the gate returns before any Mongo call is attempted.
    res = client.post("/ml/agents/council", json={"symbol": "BTCUSDT"})
    assert res.status_code == 503
    body = res.json()
    assert body["status"] == "unavailable"
    assert body["feature"] == "council"
    assert isinstance(body["detail"], str) and len(body["detail"]) > 0


def test_council_stream_returns_503_when_flag_disabled(monkeypatch):
    monkeypatch.setenv("COUNCIL_ENABLED", "false")
    res = client.post("/ml/agents/council/stream", json={"symbol": "BTCUSDT"})
    assert res.status_code == 503
    assert res.headers["content-type"].startswith("application/json")
    body = res.json()
    assert body["status"] == "unavailable"
    assert body["feature"] == "council"


def test_council_not_gated_when_flag_enabled(monkeypatch):
    monkeypatch.setenv("COUNCIL_ENABLED", "true")
    # no userId, no Authorization header -> should reach get_account_id and 401 there,
    # proving the request passed through the gate without hitting Groq/Mongo.
    res = client.post("/ml/agents/council", json={"symbol": "BTCUSDT"})
    assert res.status_code == 401


def test_council_stream_not_gated_when_flag_enabled(monkeypatch):
    monkeypatch.setenv("COUNCIL_ENABLED", "true")
    res = client.post("/ml/agents/council/stream", json={"symbol": "BTCUSDT"})
    assert res.status_code == 401


def test_council_history_endpoints_not_gated(monkeypatch):
    monkeypatch.setenv("COUNCIL_ENABLED", "false")
    res = client.get("/ml/agents/council/runs")
    assert res.status_code == 401  # not 503: read-only history survives the kill switch


def test_health_reports_council_flag_state(monkeypatch):
    monkeypatch.setenv("COUNCIL_ENABLED", "false")
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["flags"]["council_enabled"] is False

    monkeypatch.setenv("COUNCIL_ENABLED", "true")
    res = client.get("/health")
    assert res.json()["flags"]["council_enabled"] is True


def test_ready_ignores_council_flag(monkeypatch):
    monkeypatch.setenv("COUNCIL_ENABLED", "false")
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")
    fake_db = MagicMock()
    fake_db.client.admin.command.return_value = {"ok": 1.0}
    with patch("main._get_db", return_value=fake_db):
        res = client.get("/ready")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ready"
    assert "council_enabled" not in body["checks"]


# ---------------------------------------------------------------------------
# Council stream: typed, sanitized errors and run budget
# ---------------------------------------------------------------------------
import json as _json

from config.budget import council_budget


def _sse_events(text):
    events = []
    for block in text.strip().split("\n\n"):
        lines = block.split("\n")
        name = next((l[7:] for l in lines if l.startswith("event: ")), None)
        data = next((l[6:] for l in lines if l.startswith("data: ")), None)
        if name and data:
            events.append((name, _json.loads(data)))
    return events


def _stream(user="demo-disciplined"):
    return client.post("/ml/agents/council/stream", json={"userId": user, "symbol": "BTCUSDT"})


def _reset_budget(monkeypatch):
    council_budget.reset()
    monkeypatch.setenv("COUNCIL_ENABLED", "true")
    monkeypatch.setenv("COUNCIL_DAILY_RUN_CAP", "100")
    monkeypatch.setenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", "100")


def test_stream_error_never_leaks_connection_details(monkeypatch):
    _reset_budget(monkeypatch)
    # assembled at runtime so this fake value never looks like a real connection string to a scanner
    leak = "bad auth : authentication failed " + "mongodb+srv" + "://admin:hunter2@cluster0.example.invalid"

    async def boom(*a, **k):
        raise Exception(leak)

    with patch("agents.metrics.loader.load_all_packets", boom):
        res = _stream()

    assert "hunter2" not in res.text
    assert "mongodb" not in res.text.lower()
    assert "bad auth" not in res.text
    events = _sse_events(res.text)
    assert events[-1][0] == "error"
    assert events[-1][1]["code"] == "DB_UNAVAILABLE"
    assert isinstance(events[-1][1]["message"], str)


def test_stream_reports_rate_limit_as_a_code(monkeypatch):
    _reset_budget(monkeypatch)

    async def boom(*a, **k):
        raise Exception("Max retries exceeded after 3 attempts")

    with patch("agents.metrics.loader.load_all_packets", boom):
        res = _stream()

    events = _sse_events(res.text)
    assert events[-1][1]["code"] == "RATE_LIMIT_EXHAUSTED"
    assert "Max retries" not in res.text


def test_stream_reports_empty_accounts_as_no_data(monkeypatch):
    _reset_budget(monkeypatch)
    empty = MagicMock()
    empty.trade_count = 0

    async def no_trades(*a, **k):
        return empty, empty, empty, empty

    with patch("agents.metrics.loader.load_all_packets", no_trades):
        res = _stream()

    events = _sse_events(res.text)
    assert [e[0] for e in events] == ["error"]
    assert events[0][1]["code"] == "NO_DATA"


def test_stream_refuses_when_the_daily_budget_is_spent_without_calling_the_model(monkeypatch):
    _reset_budget(monkeypatch)
    monkeypatch.setenv("COUNCIL_DAILY_RUN_CAP", "1")
    council_budget.try_acquire("someone-else")  # uses the only run of the day
    packets = MagicMock()
    packets.trade_count = 10
    groq_calls = []

    async def load(*a, **k):
        return packets, packets, packets, packets

    with patch("agents.metrics.loader.load_all_packets", load), \
         patch("agents.llm_client.get_groq_client", side_effect=lambda: groq_calls.append(1)):
        res = _stream()

    events = _sse_events(res.text)
    assert events[-1][0] == "error"
    assert events[-1][1]["code"] == "RATE_LIMIT_EXHAUSTED"
    assert groq_calls == []


def test_non_stream_endpoint_returns_429_with_a_code_when_budget_is_spent(monkeypatch):
    _reset_budget(monkeypatch)
    monkeypatch.setenv("COUNCIL_DAILY_RUN_CAP", "1")
    council_budget.try_acquire("someone-else")
    fake_db = MagicMock()
    fake_db.audits.find_one.return_value = {"accountId": "demo-disciplined"}

    with patch("main._get_db", return_value=fake_db):
        res = client.post("/ml/agents/council", json={"userId": "demo-disciplined", "symbol": "BTCUSDT"})

    assert res.status_code == 429
    assert res.json()["detail"]["code"] == "RATE_LIMIT_EXHAUSTED"
    assert int(res.headers["Retry-After"]) > 0


def test_cors_only_allows_the_methods_and_headers_the_frontend_uses():
    res = client.options(
        "/ml/agents/council/stream",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "DELETE",
            "Access-Control-Request-Headers": "X-Evil",
        },
    )
    assert res.status_code == 400  # preflight refused for a disallowed method/header

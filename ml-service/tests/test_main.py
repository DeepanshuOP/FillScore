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

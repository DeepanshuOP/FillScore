"""POST /internal/score-v2 and /internal/verify-v2: service token only (typ "measure"), the account from the token."""
import time

import jwt
import mongomock
import pytest
from fastapi.testclient import TestClient

import main

VERSION = {"id": "v2.0.0", "anchors": {}, "hourProfiles": {}, "feeTable": {}}


SERVICE_SECRET = "s" * 40


def tok(claims):
    return jwt.encode({"exp": int(time.time()) + 60, **claims}, SERVICE_SECRET, algorithm="HS256")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ML_SERVICE_TOKEN_SECRET", SERVICE_SECRET)
    db = mongomock.MongoClient().db
    monkeypatch.setattr(main, "_get_db", lambda: db)
    import scoring_v2.version as ver
    monkeypatch.setattr(ver, "load_version", lambda vid: VERSION)
    monkeypatch.setattr(ver, "version_file_sha256", lambda vid: "ff" * 32)
    c = TestClient(main.app)
    c.db = db
    return c


def post(c, path, token, account="acct-1"):
    return c.post(path, json={"accountId": account}, headers={"Authorization": f"Bearer {token}"} if token else {})


def test_score_stores_a_result_and_verify_matches(client):
    t = tok({"typ": "measure", "accountId": "acct-1"})
    r = post(client, "/internal/score-v2", t)
    assert r.status_code == 200
    body = r.json()
    assert body["scoringVersion"] == "v2.0.0" and len(body["integrityHash"]) == 64
    assert body["result"]["grade"] is None              # no fills: no letter, reason given
    assert body["result"]["reason"] == "insufficient data"
    assert client.db.scores_v2.count_documents({"accountId": "acct-1"}) == 1
    v = post(client, "/internal/verify-v2", t).json()
    assert v["match"] is True and v["storedHash"] == body["integrityHash"]


def test_verify_without_score_is_404(client):
    assert post(client, "/internal/verify-v2", tok({"typ": "measure", "accountId": "acct-1"})).status_code == 404


@pytest.mark.parametrize("path", ["/internal/score-v2", "/internal/verify-v2"])
def test_user_tokens_refused(client, path):
    assert post(client, path, tok({"typ": "access", "userId": "acct-1"})).status_code == 401
    assert post(client, path, None).status_code == 401
    assert post(client, path, tok({"typ": "measure", "accountId": "acct-2"})).status_code == 403


def test_demo_account_is_refused(client):
    assert post(client, "/internal/score-v2", tok({"typ": "measure", "accountId": "demo-moderate"}), "demo-moderate").status_code == 400

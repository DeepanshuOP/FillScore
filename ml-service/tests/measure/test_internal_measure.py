"""POST /internal/measure: service-to-service only. The backend signs a short-lived token on ML_SERVICE_TOKEN_SECRET
(a secret of its own, never the user-token secret; M1.1) with typ "measure"; a user's access token, or any other type,
is refused. Without a usable ML_SERVICE_TOKEN_SECRET every /internal/* call is refused (fail closed)."""
import time

import jwt
import mongomock
import pytest
from fastapi.testclient import TestClient

import main


SERVICE_SECRET = "s" * 40     # test value; 32 characters is the minimum


def tok(claims, alg="HS256", ttl=60, secret=SERVICE_SECRET):
    return jwt.encode({"exp": int(time.time()) + ttl, **claims}, secret, algorithm=alg)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ML_SERVICE_TOKEN_SECRET", SERVICE_SECRET)
    db = mongomock.MongoClient().db
    calls = []

    def fake_measure(d, account_id, source, now_ms, limit=500):
        calls.append(account_id)
        return {"measured": 0, "orders": 0, "skipped": {}, "pending": 0, "measureVersion": "1.0.0"}

    monkeypatch.setattr(main, "_get_db", lambda: db)
    import measure.service as svc
    monkeypatch.setattr(svc, "measure_account", fake_measure)
    c = TestClient(main.app)
    c.calls = calls
    return c


def post(c, token, account="acct-1"):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return c.post("/internal/measure", json={"accountId": account}, headers=h)


def test_measure_token_runs_the_job(client):
    r = post(client, tok({"typ": "measure", "accountId": "acct-1"}))
    assert r.status_code == 200
    assert r.json()["measureVersion"] == "1.0.0"
    assert client.calls == ["acct-1"]


@pytest.mark.parametrize("claims", [
    {"typ": "access", "userId": "acct-1"},      # a user's own access token
    {"typ": "refresh", "accountId": "acct-1"},
    {"accountId": "acct-1"},                    # no type
])
def test_other_tokens_are_refused(client, claims):
    assert post(client, tok(claims)).status_code == 401
    assert client.calls == []


def test_missing_token_refused(client):
    assert post(client, None).status_code == 401


def test_token_for_another_account_is_forbidden(client):
    assert post(client, tok({"typ": "measure", "accountId": "acct-2"})).status_code == 403
    assert client.calls == []


def test_other_algorithm_refused(client):
    assert post(client, tok({"typ": "measure", "accountId": "acct-1"}, alg="HS512")).status_code == 401


def test_long_lived_token_refused(client):
    # A measure token must be short-lived (at most 5 minutes), so a leaked one is useless soon.
    assert post(client, tok({"typ": "measure", "accountId": "acct-1"}, ttl=3600)).status_code == 401


def test_measure_token_is_not_a_user_token():
    from starlette.requests import Request
    from fastapi import HTTPException
    req = Request({"type": "http", "headers": [(b"authorization", f"Bearer {tok({'typ': 'measure', 'userId': 'acct-1', 'accountId': 'acct-1'})}".encode())]})
    with pytest.raises(HTTPException):
        main.get_account_id(None, req)


def test_token_signed_with_the_user_token_secret_is_refused(client):
    # Key separation (M1.1): a token minted on JWT_ACCESS_SECRET is not a service token.
    assert post(client, tok({"typ": "measure", "accountId": "acct-1"}, secret=main.JWT_ACCESS_SECRET)).status_code == 401
    assert client.calls == []


@pytest.mark.parametrize("value", [None, "", "short-secret", "USE_JWT"])
def test_unusable_service_secret_fails_closed(client, monkeypatch, value):
    # Missing, empty, shorter than 32 characters, or equal to the user-token secret: 503, and the job does not run.
    if value is None:
        monkeypatch.delenv("ML_SERVICE_TOKEN_SECRET", raising=False)
    else:
        monkeypatch.setenv("ML_SERVICE_TOKEN_SECRET", main.JWT_ACCESS_SECRET if value == "USE_JWT" else value)
    secret = main.JWT_ACCESS_SECRET if value == "USE_JWT" else (value or SERVICE_SECRET)
    r = post(client, tok({"typ": "measure", "accountId": "acct-1"}, secret=secret))
    assert r.status_code == 503
    assert r.json()["detail"] == "Service token not configured"
    assert client.calls == []
    assert post(client, None).status_code == 401        # without a token the configuration state is not revealed

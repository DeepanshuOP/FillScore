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


def _om(account, i, paid=1.0, expected=0.5, notional=1000.0):
    return {"accountId": account, "exchange": "binance", "symbol": "BTCUSDT", "orderId": str(i),
            "shortfall": {"executionBps": paid, "intendedNotional": notional, "fillRatio": 1.0},
            "expectedCost": {"applies": True, "expectedBps": expected, "version": "ec1.0.0", "calibrationSha256": "ab" * 32}}


def test_cost_vs_expected_is_stored_beside_the_grade_for_a_real_account(client):
    # 20 market orders of 1000 USD, each paid 1.0 bps against 0.5 expected: paid 1.0, expected 0.5, excess 0.5 (equal
    # orders, so every bootstrap resample gives 0.5); paid USD = 1.0 * 20000 / 1e4 = 2.0; expected USD = 1.0.
    # Another account's 25 orders must not enter.
    client.db.order_measurements.insert_many([_om("acct-1", i) for i in range(20)] + [_om("acct-2", i, paid=9.0) for i in range(25)])
    t = tok({"typ": "measure", "accountId": "acct-1"})
    body = post(client, "/internal/score-v2", t).json()
    c = body["costVsExpected"]
    assert c["insufficient"] is False and c["n"] == 20
    assert (c["paidBps"], c["expectedBps"], c["excessBps"]) == (pytest.approx(1.0), pytest.approx(0.5), pytest.approx(0.5))
    assert (c["paidUsd"], c["expectedUsd"]) == (pytest.approx(2.0), pytest.approx(1.0))
    stored = client.db.scores_v2.find_one({"accountId": "acct-1"})
    assert stored["costVsExpected"]["n"] == 20
    # it sits beside the grade: the integrity hash is the same with or without it
    assert post(client, "/internal/verify-v2", t).json()["match"] is True


def test_cost_vs_expected_says_insufficient_data_below_twenty_orders(client):
    client.db.order_measurements.insert_many([_om("acct-1", i) for i in range(3)])
    c = post(client, "/internal/score-v2", tok({"typ": "measure", "accountId": "acct-1"})).json()["costVsExpected"]
    assert c["insufficient"] is True and c["n"] == 3


def test_delete_account_data_removes_only_the_callers_council_runs_and_traces(client):
    # security review M9: account deletion in the backend could not reach these two collections
    db = client.db
    for acct in ("acct-1", "acct-2"):
        db.council_runs.insert_many([{"run_id": f"{acct}-r{i}", "accountId": acct} for i in range(3)])
        # a trace document holds `run_id` only (agents/persistence.py save_agent_trace): it is found through the account's runs
        db.council_traces.insert_many([{"run_id": f"{acct}-r{i % 3}", "agent_name": "x", "n": i} for i in range(5)])
    t = tok({"typ": "measure", "accountId": "acct-1"})
    r = post(client, "/internal/delete-account-data", t)
    assert r.status_code == 200 and r.json() == {"deleted": {"council_runs": 3, "council_traces": 5}}
    assert db.council_runs.count_documents({"accountId": "acct-1"}) == 0 and db.council_traces.count_documents({"run_id": {"$regex": "^acct-1-"}}) == 0
    assert db.council_runs.count_documents({"accountId": "acct-2"}) == 3 and db.council_traces.count_documents({"run_id": {"$regex": "^acct-2-"}}) == 5


def test_delete_account_data_refuses_user_tokens_other_accounts_and_demo_accounts(client):
    assert post(client, "/internal/delete-account-data", tok({"typ": "access", "userId": "acct-1"})).status_code == 401
    assert post(client, "/internal/delete-account-data", None).status_code == 401
    assert post(client, "/internal/delete-account-data", tok({"typ": "measure", "accountId": "acct-2"})).status_code == 403
    assert post(client, "/internal/delete-account-data", tok({"typ": "measure", "accountId": "demo-moderate"}), "demo-moderate").status_code == 400


def test_verify_without_score_is_404(client):
    assert post(client, "/internal/verify-v2", tok({"typ": "measure", "accountId": "acct-1"})).status_code == 404


@pytest.mark.parametrize("path", ["/internal/score-v2", "/internal/verify-v2"])
def test_user_tokens_refused(client, path):
    assert post(client, path, tok({"typ": "access", "userId": "acct-1"})).status_code == 401
    assert post(client, path, None).status_code == 401
    assert post(client, path, tok({"typ": "measure", "accountId": "acct-2"})).status_code == 403


def test_demo_account_is_refused(client):
    assert post(client, "/internal/score-v2", tok({"typ": "measure", "accountId": "demo-moderate"}), "demo-moderate").status_code == 400

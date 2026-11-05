"""R7: every Council endpoint resolves the account from the JWT only. A demo id is allowed (fixtures,
read-only). Another real user's id is refused (403), and a run owned by someone else is never returned."""
import time
from unittest.mock import AsyncMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)
USER_A, USER_B, DEMO = "aaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbb", "demo-disciplined"


def _hdr(user_id: str) -> dict:
    tok = jwt.encode({"userId": user_id, "typ": "access", "exp": int(time.time()) + 60}, main.JWT_ACCESS_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture
def spies():
    """Capture the account each endpoint ends up using, without touching Mongo or an LLM."""
    flow = AsyncMock(side_effect=RuntimeError("stub"))  # only the account it receives matters here
    with patch("agents.council_service.council_flow", flow), \
         patch("agents.persistence.list_council_runs", AsyncMock(return_value=[])) as lst, \
         patch("agents.persistence.get_telemetry_summary", AsyncMock(return_value={})) as tel, \
         patch("agents.persistence.load_council_run", AsyncMock(return_value=None)) as load, \
         patch("main.council_enabled", return_value=True):
        yield {"flow": flow, "list": lst, "telemetry": tel, "load": load}


# (method, path, body-or-params builder) for each endpoint that accepts a userId
def _call(endpoint: str, user_param: str | None, headers: dict | None):
    h = headers or {}
    if endpoint == "run":
        return client.post("/ml/agents/council", json={"symbol": "BTCUSDT", **({"userId": user_param} if user_param else {})}, headers=h)
    if endpoint == "stream":
        return client.post("/ml/agents/council/stream", json={"symbol": "BTCUSDT", **({"userId": user_param} if user_param else {})}, headers=h)
    if endpoint == "runs":
        return client.get("/ml/agents/council/runs", params={"userId": user_param} if user_param else {}, headers=h)
    if endpoint == "telemetry":
        return client.get("/ml/agents/council/telemetry", params={"userId": user_param} if user_param else {}, headers=h)
    if endpoint == "fetch":
        return client.get("/ml/agents/council/runs/run-1", params={"userId": user_param} if user_param else {}, headers=h)
    raise AssertionError(endpoint)


ENDPOINTS = ["run", "stream", "runs", "telemetry", "fetch"]


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_another_real_users_id_is_refused_even_with_a_valid_token(endpoint, spies):
    res = _call(endpoint, USER_B, _hdr(USER_A))
    assert res.status_code == 403
    for spy in spies.values():
        spy.assert_not_called()


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_own_id_in_the_request_is_not_trusted_either(endpoint, spies):
    # identity comes from the JWT only; only demo ids may be named explicitly
    assert _call(endpoint, USER_A, _hdr(USER_A)).status_code == 403


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_no_token_and_no_demo_id_is_401(endpoint, spies):
    assert _call(endpoint, None, None).status_code == 401


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_demo_id_is_allowed_without_a_token(endpoint, spies):
    res = _call(endpoint, DEMO, None)
    assert res.status_code not in (401, 403)  # accepted; downstream stubs may answer 200, 404 (unknown run) or 500 (stub flow)
    used = [c for s in spies.values() for c in (s.call_args_list)]
    assert used and all(DEMO in str(c) for c in used)


@pytest.mark.parametrize("endpoint", ["run", "stream", "runs", "telemetry"])
def test_token_without_user_id_uses_the_jwt_account(endpoint, spies):
    res = _call(endpoint, None, _hdr(USER_A))
    assert res.status_code not in (401, 403)
    used = [c for s in spies.values() for c in s.call_args_list]
    assert used and all(USER_A in str(c) for c in used)


def test_fetch_scopes_the_lookup_to_the_jwt_account(spies):
    res = _call("fetch", None, _hdr(USER_A))
    assert res.status_code == 404
    spies["load"].assert_awaited_once_with("run-1", USER_A)


def test_a_run_owned_by_someone_else_reads_as_not_found(spies):
    # load_council_run filters by account id, so user B's lookup of user A's run id returns None -> 404
    res = _call("fetch", None, _hdr(USER_B))
    assert res.status_code == 404
    spies["load"].assert_awaited_once_with("run-1", USER_B)

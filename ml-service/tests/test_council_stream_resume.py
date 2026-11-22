"""The resumable Council stream over HTTP, including a connection dropped in the middle of a run.

Fault injection: the ASGI driver below sends `http.disconnect` after the second event reaches the client, exactly what a
dropped connection looks like to the server. The run must go on, a GET with `Last-Event-ID` must deliver only the events
after that id, and the pieces together must equal an uninterrupted run, with no extra model call.
"""
from __future__ import annotations

import asyncio
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

USER = "acct-resume"
BODY = json.dumps({"symbol": "BTCUSDT", "mode": "deep"}).encode()
# fields of the final result that carry the notes and the call count (timings, ids and trace ids differ between runs)
NOTE_KEYS = ("liquidity", "alpha", "risk", "fee", "synthesis", "verification", "n_calls_ok", "n_calls_expected")


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


def _patched(router):
    db = AsyncMongoMockClient()["fillscore"]
    packets = make_packets()

    async def load(*_a, **_k):
        return packets, []

    async def counts(*_a, **_k):
        return {"symbolFills": 10, "accountFills": 10}

    stack = ExitStack()
    stack.enter_context(patch("agents.metrics.loader.scope_counts", counts))
    stack.enter_context(patch("agents.council_service._router", return_value=router))
    stack.enter_context(patch("agents.metrics.loader.load_run_inputs", load))
    stack.enter_context(patch("agents.persistence._get_db", return_value=(MagicMock(), db)))
    return stack


def parse(text: str):
    """[(id or None, name, data)] for each event block; comment lines (heartbeats) are skipped."""
    out = []
    for block in text.strip().split("\n\n"):
        lines = block.split("\n")
        name = next((ln[7:] for ln in lines if ln.startswith("event: ")), None)
        data = next((ln[6:] for ln in lines if ln.startswith("data: ")), None)
        eid = next((ln[4:] for ln in lines if ln.startswith("id: ")), None)
        if name and data:
            out.append((int(eid) if eid is not None else None, name, json.loads(data)))
    return out


async def asgi_call(method, path, *, headers=None, body=b"", query="", stop_after_events=None):
    """Call the app in-process and read the streamed body. With `stop_after_events`, the client 'disconnects' once that
    many events have arrived. Returns (status, response headers, body text)."""
    scope = {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"}, "http_version": "1.1", "method": method,
             "path": path, "raw_path": path.encode(), "query_string": query.encode(), "root_path": "", "scheme": "http",
             "server": ("test", 80), "client": ("c", 1),
             "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]}
    sent = False
    gone = asyncio.Event()
    state = {"status": None, "headers": {}, "chunks": []}

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        await gone.wait()
        return {"type": "http.disconnect"}

    async def send(message):
        if message["type"] == "http.response.start":
            state["status"] = message["status"]
            state["headers"] = {k.decode().lower(): v.decode() for k, v in message["headers"]}
        elif message["type"] == "http.response.body" and message.get("body"):
            state["chunks"].append(message["body"].decode())
            if stop_after_events is not None and len(parse("".join(state["chunks"]))) >= stop_after_events:
                gone.set()

    await main.app(scope, receive, send)
    return state["status"], state["headers"], "".join(state["chunks"])


def _post_headers():
    return {**_h(), "content-type": "application/json"}


def test_a_dropped_connection_resumes_to_the_same_notes_with_no_extra_model_call():
    async def uninterrupted():
        router, provider = make_router()
        with _patched(router):
            status, _hdrs, text = await asgi_call("POST", "/ml/agents/council/stream", headers=_post_headers(), body=BODY)
        return status, parse(text), len(provider.calls)

    async def interrupted():
        council_budget.reset()
        router, provider = make_router()
        with _patched(router):
            status, hdrs, text = await asgi_call("POST", "/ml/agents/council/stream", headers=_post_headers(), body=BODY,
                                                 stop_after_events=2)
            first = parse(text)
            last_id = first[-1][0]
            status2, _h2, text2 = await asgi_call(
                "GET", f"/ml/agents/council/stream/{hdrs['x-council-run']}",
                headers={**_h(), "Last-Event-ID": str(last_id)})
        return status, hdrs, first, status2, parse(text2), len(provider.calls)

    status_u, whole, calls_u = asyncio.run(uninterrupted())
    status, hdrs, first, status2, rest, calls_i = asyncio.run(interrupted())

    assert status_u == 200 and status == 200 and status2 == 200
    assert hdrs["x-council-run"]
    assert 2 <= len(first) < len(whole)                          # the first connection really was cut short
    assert not any(name == "complete" for _i, name, _d in first)
    # only the events after the last id seen arrive, and nothing is repeated
    assert [i for i, _n, _d in rest] == list(range(first[-1][0] + 1, first[-1][0] + 1 + len(rest)))
    joined = first + rest
    assert [i for i, _n, _d in joined] == list(range(1, len(joined) + 1))        # ids 1..N, no gap, no duplicate
    assert [n for _i, n, _d in joined] == [n for _i, n, _d in whole]
    result_i = next(d for _i, n, d in joined if n == "complete")
    result_u = next(d for _i, n, d in whole if n == "complete")
    assert {k: result_i[k] for k in NOTE_KEYS} == {k: result_u[k] for k in NOTE_KEYS}
    for r in (result_i, result_u):
        r["debate_transcript"].pop("debate_latency_ms", None)       # timing, not a note
    assert result_i["debate_transcript"] == result_u["debate_transcript"]
    assert result_i["n_calls_ok"] == 9
    assert calls_i == calls_u                                    # the interrupted run made exactly the calls of a whole run


client = TestClient(main.app)


def _finished_run():
    router, provider = make_router()
    with _patched(router):
        res = client.post("/ml/agents/council/stream", json={"symbol": "BTCUSDT", "mode": "deep"}, headers=_h())
    return res.headers["x-council-run"], parse(res.text), provider


def test_every_event_has_an_id_counting_up_from_one_and_the_run_is_named_in_a_header():
    run_id, events, _p = _finished_run()
    assert run_id
    assert [i for i, _n, _d in events] == list(range(1, len(events) + 1))
    assert events[-1][1] == "complete"


def test_a_resume_from_id_zero_replays_everything_and_from_the_last_id_nothing():
    run_id, events, _p = _finished_run()
    full = client.get(f"/ml/agents/council/stream/{run_id}", headers={**_h(), "Last-Event-ID": "0"})
    assert full.status_code == 200 and parse(full.text) == events
    tail = client.get(f"/ml/agents/council/stream/{run_id}", headers={**_h(), "Last-Event-ID": str(events[-1][0])})
    assert tail.status_code == 200 and parse(tail.text) == []
    mid = client.get(f"/ml/agents/council/stream/{run_id}", params={"lastEventId": 3}, headers=_h())
    assert [i for i, _n, _d in parse(mid.text)] == list(range(4, len(events) + 1))


def test_an_unknown_event_id_is_a_409_not_a_restart(monkeypatch):
    run_id, events, _p = _finished_run()
    called = []
    monkeypatch.setattr("agents.council_service.council_flow", lambda *a, **k: called.append(1))
    for bad in (str(events[-1][0] + 50), "-1", "abc"):
        res = client.get(f"/ml/agents/council/stream/{run_id}", headers={**_h(), "Last-Event-ID": bad})
        assert res.status_code == 409, bad
        assert res.json()["code"] == "unknown_event_id" and "not started again" in res.json()["message"]
    assert called == []


def test_an_expired_unknown_or_foreign_run_is_a_404_that_says_so_and_starts_nothing(monkeypatch):
    run_id, _events, provider = _finished_run()
    n_calls = len(provider.calls)
    called = []
    monkeypatch.setattr("agents.council_service.council_flow", lambda *a, **k: called.append(1))
    unknown = client.get("/ml/agents/council/stream/does-not-exist", headers=_h())
    foreign = client.get(f"/ml/agents/council/stream/{run_id}", headers=_h("acct-someone-else"))
    for res in (unknown, foreign):
        assert res.status_code == 404
        assert res.json()["code"] == "stream_expired" and "not started again" in res.json()["message"]
    # expiry by the clock
    from agents.stream_store import store
    rs = store.get(run_id, USER)
    rs.finished_at = time.monotonic() - 10_000
    gone = client.get(f"/ml/agents/council/stream/{run_id}", headers=_h())
    assert gone.status_code == 404 and gone.json()["code"] == "stream_expired"
    assert called == [] and len(provider.calls) == n_calls


def test_resuming_needs_a_token():
    assert client.get("/ml/agents/council/stream/anything").status_code == 401


def test_a_run_that_does_not_finish_in_time_ends_with_an_error_event_and_a_full_account_is_refused(monkeypatch):
    import asyncio as aio
    from agents import stream_store as mod

    async def hangs(*_a, **_k):
        await aio.sleep(30)

    monkeypatch.setattr("agents.council_service.council_flow", hangs)
    monkeypatch.setattr(mod, "RUN_TIMEOUT_S", 0.2)
    res = client.post("/ml/agents/council/stream", json={"symbol": "BTCUSDT", "mode": "deep"}, headers=_h())
    events = parse(res.text)
    assert [n for _i, n, _d in events] == ["error"]
    assert events[0][2]["code"] == "RUN_TIMEOUT" and events[0][0] == 1
    # the cap: three unfinished runs of one account, the fourth POST is refused with a 429 and starts nothing
    monkeypatch.setattr(mod, "UNFINISHED_PER_ACCOUNT", 0)
    refused = client.post("/ml/agents/council/stream", json={"symbol": "BTCUSDT", "mode": "deep"}, headers=_h())
    assert refused.status_code == 429 and refused.json()["code"] == "STREAM_BUSY"

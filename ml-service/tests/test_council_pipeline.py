"""Phase 1b.1 (one pipeline, F-03) and 1b.2 (degraded runs are never graded, F-06).

Both endpoints run through agents.council_service.council_flow → agents.council.run_council_pipeline.
Providers are faked behind the real router; persistence and usage run on mongomock-motor.
"""
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
from tests.council_fakes import FEE, HTTPError, LIQUIDITY, SYNTHESIS, make_packets, make_router

client = TestClient(main.app)
USER = "acct-real-1"


def _token(user=USER):
    return jwt.encode({"exp": int(time.time()) + 300, "userId": user, "typ": "access"},
                      main.JWT_ACCESS_SECRET, algorithm="HS256")


def _sse(text):
    events = []
    for block in text.strip().split("\n\n"):
        lines = block.split("\n")
        name = next((l[7:] for l in lines if l.startswith("event: ")), None)
        data = next((l[6:] for l in lines if l.startswith("data: ")), None)
        if name and data:
            events.append((name, json.loads(data)))
    return events


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    council_budget.reset()
    monkeypatch.setenv("COUNCIL_ENABLED", "true")
    monkeypatch.setenv("COUNCIL_DAILY_RUN_CAP", "100")
    monkeypatch.setenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", "100")
    yield
    council_budget.reset()


def _patched(router, db=None, packets=None, fixed_clock=False, run_id=None):
    """Patch the router, packet loader and the persistence DB for one request."""
    db = db if db is not None else AsyncMongoMockClient()["fillscore"]
    packets = packets or make_packets()

    async def load(*_a, **_k):
        return packets, []          # (packets, trades): load_run_inputs reads both at once

    stack = ExitStack()
    stack.enter_context(patch("agents.council_service._router", return_value=router))
    stack.enter_context(patch("agents.metrics.loader.load_run_inputs", load))
    stack.enter_context(patch("agents.persistence._get_db", return_value=(MagicMock(), db)))
    if fixed_clock:
        for target in ("agents.council._clock", "agents.llm_router._clock", "agents.debate._clock"):
            stack.enter_context(patch(target, lambda: 0.0))
    if run_id:
        stack.enter_context(patch("agents.persistence.uuid.uuid4", return_value=run_id))
    return stack, db


def _stream():
    return client.post("/ml/agents/council/stream", json={"symbol": "BTCUSDT"},
                       headers={"Authorization": f"Bearer {_token()}"})


def _plain():
    return client.post("/ml/agents/council", json={"symbol": "BTCUSDT"},
                       headers={"Authorization": f"Bearer {_token()}"})


# ── 1b.1 one pipeline ────────────────────────────────────────────────────────

def test_stream_complete_payload_equals_the_non_stream_result():
    router_a, _ = make_router()
    stack, _ = _patched(router_a, fixed_clock=True, run_id="run-fixed")
    with stack:
        events = _sse(_stream().text)
    router_b, _ = make_router()
    stack, _ = _patched(router_b, fixed_clock=True, run_id="run-fixed")
    with stack:
        res = _plain()

    assert res.status_code == 200
    names = [e[0] for e in events]
    assert names[-1] == "complete"
    assert names.count("agent_done") == 4 and "debate_done" in names and "synthesis_done" in names
    complete = events[-1][1]
    print("stream complete == non-stream:", complete == res.json())
    assert complete == res.json()
    assert complete["run_id"] == "run-fixed" and complete["degraded"] is False


def test_llm_numbers_never_reach_the_stream():
    # The models claim a monthly cost of 99999 and a confidence of 0.99. Neither may be shown.
    liar = dict(SYNTHESIS, estimatedMonthlyCostUSD=99999)
    answers = {"synthesis": liar, "liquidity_scout": dict(LIQUIDITY, confidence=0.99),
               "fee_optimizer": dict(FEE, confidence=0.99)}
    router, _ = make_router(answers)
    stack, _ = _patched(router, packets=make_packets(total_fee_paid_usd=328.0))
    with stack:
        res = _stream()

    assert "99999" not in res.text
    assert "0.99" not in res.text
    events = _sse(res.text)
    synth = next(d for n, d in events if n == "synthesis_done")
    assert synth["estimatedMonthlyCostUSD"] == 328.0           # fee packet total, set by code
    done = {d["agent"]: d for n, d in events if n == "agent_done"}
    # coverage confidence = valid cited keys / substantive packet keys
    # liquidity: 1 cited (avg_slippage_bps) / 18 keys = 0.0556 ; fee: 1 (maker_ratio) / 12 keys = 0.0833
    assert done["liquidity_scout"]["confidence"] == 0.0556
    assert done["fee_optimizer"]["confidence"] == 0.0833   # 2c.A2 added fee.maker_count/taker_count: 1 / 12 keys
    complete = events[-1][1]
    assert complete["synthesis"]["estimatedMonthlyCostUSD"] == 328.0
    assert complete["liquidity"]["confidence"] == 0.0556
    assert "llm_self_confidence" not in complete["liquidity"]


def test_a_streamed_run_is_persisted():
    router, _ = make_router()
    stack, db = _patched(router)
    with stack:
        events = _sse(_stream().text)
    import asyncio
    docs = asyncio.run(db["council_runs"].find({}).to_list(10))
    assert len(docs) == 1
    doc = docs[0]
    complete = events[-1][1]
    assert doc["run_id"] == complete["run_id"]
    assert doc["accountId"] == USER and doc["data_source"] == "real-user"
    assert doc["degraded"] is False and doc["n_calls_ok"] == 9 and doc["n_calls_expected"] == 9
    assert doc["overall_rating"] == "GOOD"
    assert doc["council_result"]["synthesis"]["estimatedMonthlyCostUSD"] == 328.0
    # token telemetry: 9 replies x (100 prompt + 20 completion) = 1080 tokens
    assert doc["token_usage"] == {"prompt_tokens": 900, "completion_tokens": 180, "total_tokens": 1080, "n_calls": 9}
    assert len(doc["llm_calls"]) == 9 and {c["outcome"] for c in doc["llm_calls"]} == {"ok"}
    assert set(doc["llm_self_confidence"]) == {"liquidity_scout", "alpha_architect", "risk_auditor", "fee_optimizer"}


def test_main_has_no_second_council_implementation():
    import inspect

    src = inspect.getsource(main)
    for needle in ("liquidity_scout", "run_debate", "synthesis.run", "run_gate", "grounded_complete", "verify_draft"):
        assert needle not in src


# ── 1b.2 degraded runs ───────────────────────────────────────────────────────

def test_a_failed_specialist_degrades_the_run_and_removes_the_grade():
    router, provider = make_router({"liquidity_scout": HTTPError(404)})
    stack, db = _patched(router)
    with stack:
        res = _stream()
    events = _sse(res.text)
    complete = events[-1][1]
    assert complete["degraded"] is True
    assert complete["synthesis"]["overallRating"] is None
    assert complete["n_calls_expected"] == 9 and complete["n_calls_ok"] == 3   # 3 specialists answered
    assert any(r.startswith("liquidity_scout:") for r in complete["degraded_reasons"])
    assert "API key" not in res.text
    synth = next(d for n, d in events if n == "synthesis_done")
    assert synth["overallRating"] is None and synth["degraded"] is True
    # debate and synthesis are skipped: no more calls once the run is degraded
    assert {c["agent"] for c in provider.calls} <= {"liquidity_scout", "alpha_architect", "risk_auditor", "fee_optimizer"}
    import asyncio
    doc = asyncio.run(db["council_runs"].find_one({}))
    assert doc["degraded"] is True and doc["overall_rating"] is None


def test_a_failed_debate_turn_counts_only_completed_rounds():
    # Prosecution answers in round 1 and fails in round 2 -> 1 completed round, P1 + D1 = 2 turns.
    def prosecution(kw, n):
        from tests.council_fakes import PROSECUTION
        return PROSECUTION if n == 1 else HTTPError(401)

    router, provider = make_router({"prosecution": prosecution})
    stack, _ = _patched(router)
    with stack:
        res = _plain()
    body = res.json()
    assert body["debate_transcript"]["round_count"] == 1
    assert body["debate_transcript"]["turns_ok"] == 2
    assert body["degraded"] is True and body["synthesis"]["overallRating"] is None
    assert body["n_calls_ok"] == 6                    # 4 specialists + 2 debate turns
    assert "synthesis" not in {c["agent"] for c in provider.calls}


def test_invalid_synthesis_output_degrades_the_run():
    router, _ = make_router({"synthesis": "this is not json"})
    stack, _ = _patched(router)
    with stack:
        body = _plain().json()
    assert body["degraded"] is True
    assert body["n_calls_ok"] == 8
    assert body["synthesis"]["overallRating"] is None
    assert body["synthesis"]["findings"] == [] and body["synthesis"]["observations"] == []
    assert any(r.startswith("synthesis:") for r in body["degraded_reasons"])


def test_default_synthesis_has_no_grade_and_no_key_advice():
    from agents.council import _default_synthesis

    s = _default_synthesis()
    assert s.overallRating is None
    text = json.dumps(s.model_dump())
    assert "FAIR" not in text and "API key" not in text and "network" not in text


def test_telemetry_summary_excludes_degraded_runs():
    import asyncio

    from agents.persistence import get_telemetry_summary

    db = AsyncMongoMockClient()["fillscore"]
    asyncio.run(db["council_runs"].insert_many([
        {"accountId": "a", "degraded": False, "total_latency_ms": 100.0, "avg_faithfulness_score": 1.0,
         "total_violations": 0, "overall_rating": "GOOD"},
        {"accountId": "a", "degraded": True, "total_latency_ms": 900.0, "avg_faithfulness_score": 1.0,
         "total_violations": 0, "overall_rating": None},
    ]))
    with patch("agents.persistence._get_db", return_value=(MagicMock(), db)):
        default = asyncio.run(get_telemetry_summary("a"))
        everything = asyncio.run(get_telemetry_summary("a", include_degraded=True))
    assert default["total_runs"] == 1 and default["avg_latency_ms"] == 100.0
    assert everything["total_runs"] == 2 and everything["avg_latency_ms"] == 500.0   # (100 + 900) / 2


def test_cost_report_excludes_degraded_runs():
    from eval.cost_report import aggregate_costs

    usage = {"prompt_tokens": 1000, "completion_tokens": 100, "total_tokens": 1100, "n_calls": 9}
    runs = [
        {"run_id": "ok", "token_usage": usage, "total_latency_ms": 10.0, "degraded": False},
        {"run_id": "bad", "token_usage": {**usage, "n_calls": 3}, "total_latency_ms": 30.0, "degraded": True},
    ]
    assert aggregate_costs(runs)["totals"]["n_runs"] == 1
    assert aggregate_costs(runs)["totals"]["total_tokens"] == 1100
    assert aggregate_costs(runs, include_degraded=True)["totals"]["total_tokens"] == 2200   # 1100 * 2

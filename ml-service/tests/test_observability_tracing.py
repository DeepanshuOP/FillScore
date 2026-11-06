"""B2: one trace per Council run, one span per router attempt; text only for demo accounts;
no export unless all three Langfuse env vars are set. Real fake-provider pipeline, in-memory exporter."""
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest
from mongomock_motor import AsyncMongoMockClient
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from agents.council import run_council_pipeline
from observability import tracing
from tests.council_fakes import make_packets, make_router


@pytest.fixture
def spans():
    exp = InMemorySpanExporter()
    prov = TracerProvider()
    prov.add_span_processor(SimpleSpanProcessor(exp))
    tracing.set_tracer(prov.get_tracer("t"))
    yield exp
    tracing.set_tracer(None)


def _run(account):
    router, _ = make_router()
    db = AsyncMongoMockClient()["fillscore"]
    fee, risk, liq, alpha = make_packets()
    with patch("agents.persistence._get_db", return_value=(MagicMock(), db)):
        res = asyncio.run(run_council_pipeline(account, account, "BTCUSDT", fee, risk, liq, alpha, llm=router))
    doc = asyncio.run(db["council_runs"].find({}).to_list(5))[0]
    return res, doc


def test_one_trace_id_stored_and_shared_by_all_nine_spans(spans):
    _, doc = _run("acct-real-1")
    finished = spans.get_finished_spans()
    assert len(finished) == 9                                   # 9 calls, 1 attempt each
    assert len(doc["trace_id"]) == 32
    assert {format(s.context.trace_id, "032x") for s in finished} == {doc["trace_id"]}
    a = finished[0].attributes
    assert a["fillscore.outcome"] == "ok" and a["gen_ai.usage.input_tokens"] == 100   # fake reply: 100 + 20
    assert a["gen_ai.usage.output_tokens"] == 20 and "gen_ai.request.model" in a and "fillscore.role" in a


def test_real_user_spans_carry_no_text(spans):
    _run("acct-real-1")
    for s in spans.get_finished_spans():
        assert "langfuse.observation.input" not in s.attributes
        assert "langfuse.observation.output" not in s.attributes


def test_demo_user_spans_carry_text(spans):
    _run("demo-moderate")
    for s in spans.get_finished_spans():
        assert "[system]" in s.attributes["langfuse.observation.input"]
        assert s.attributes["langfuse.observation.output"]


def test_trace_id_stored_even_without_langfuse(monkeypatch):
    tracing.set_tracer(None)
    for k in ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_HOST"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(tracing, "_tracer_resolved", False)
    _, doc = _run("acct-real-1")
    assert len(doc["trace_id"]) == 32 and tracing._get_tracer() is None


@pytest.mark.parametrize("missing", ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_HOST"])
def test_export_needs_all_three_vars(missing):
    env = {"LANGFUSE_PUBLIC_KEY": "p", "LANGFUSE_SECRET_KEY": "s", "LANGFUSE_HOST": "https://h"}
    assert tracing.langfuse_configured(env) is True
    del env[missing]
    assert tracing.langfuse_configured(env) is False

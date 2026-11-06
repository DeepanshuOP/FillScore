"""Phase 4a Q0: pytest never exports spans or starts Sentry, and a run's root span always ends."""
from __future__ import annotations

import asyncio
import os

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from observability import tracing
from observability.sentry_init import init_sentry

LANGFUSE = {"LANGFUSE_PUBLIC_KEY": "pk", "LANGFUSE_SECRET_KEY": "sk", "LANGFUSE_HOST": "http://127.0.0.1:1"}


def test_conftest_forces_tracing_off():
    assert os.environ["FILLSCORE_TRACING"] == "0"


def test_no_exporter_is_created_even_with_langfuse_keys_in_environ(monkeypatch):
    tracing.shutdown_tracing()
    for k, v in LANGFUSE.items():
        monkeypatch.setenv(k, v)
    assert tracing.init_tracing() is False            # implicit os.environ path: the one that leaked
    assert tracing._provider is None
    assert tracing.export_status()["configured"] is False
    tracing.shutdown_tracing()


def test_kill_switch_in_code_beats_keys():
    tracing.shutdown_tracing()
    assert tracing.init_tracing(env={**LANGFUSE, "FILLSCORE_TRACING": "0"}) is False
    assert tracing._provider is None


def test_sentry_not_initialised_under_pytest(monkeypatch):
    import sentry_sdk
    monkeypatch.setenv("SENTRY_DSN", "https://k@o0.ingest.sentry.io/1")
    assert init_sentry() is False                      # kill switch from conftest
    assert not sentry_sdk.get_client().is_active()


def test_root_span_ends_when_the_pipeline_raises():
    from agents import council
    exp = InMemorySpanExporter()
    prov = TracerProvider()
    prov.add_span_processor(SimpleSpanProcessor(exp))
    tracing.set_tracer(prov.get_tracer("t"))

    async def boom(*a, **k):
        # open the root span (as a first LLM attempt would), then fail
        tracing.emit_attempt(role="fee", provider="p", model="m", attempt=1, latency_ms=1.0, prompt_tokens=1,
                             completion_tokens=1, outcome="ok")
        raise RuntimeError("graph exploded")

    orig = council._run_council_pipeline
    council._run_council_pipeline = boom
    try:
        with pytest.raises(RuntimeError):
            asyncio.run(council.run_council_pipeline("acct", "acct", "BTCUSDT", None, None, None, None))
    finally:
        council._run_council_pipeline = orig
        tracing.set_tracer(None)
    names = [s.name for s in exp.get_finished_spans()]
    assert "council-run" in names and "llm.fee" in names     # root ended, so it was exported
    root = [s for s in exp.get_finished_spans() if s.name == "council-run"][0]
    assert root.attributes["fillscore.outcome"] == "error"

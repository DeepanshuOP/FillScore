"""T1 (phase 3c): ONE init function, idempotent, flushed at exit, and a real OTLP/HTTP request that
carries the path and auth header Langfuse expects. A local HTTP server stands in for Langfuse; no LLM call."""
from __future__ import annotations

import base64
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from observability import tracing

KEYS = {"LANGFUSE_PUBLIC_KEY": "pk-test", "LANGFUSE_SECRET_KEY": "sk-test", "LANGFUSE_HOST": "http://x"}


@pytest.fixture(autouse=True)
def _reset():
    tracing.shutdown_tracing()
    yield
    tracing.shutdown_tracing()


def _emit(account="demo-moderate", role="fee"):
    tracing.start_run(account)
    tracing.emit_attempt(role=role, provider="groq", model="m", attempt=1, latency_ms=5.0, prompt_tokens=3,
                         completion_tokens=2, outcome="ok", system="SYS", user="USR", output="OUT")


def test_no_keys_means_no_provider():
    assert tracing.init_tracing(env={}) is False
    assert tracing.export_status()["configured"] is False


def test_langfuse_base_url_is_accepted_as_the_host():
    """Root cause of 'Waiting for first trace': ml-service/.env names the host LANGFUSE_BASE_URL."""
    env = {"LANGFUSE_PUBLIC_KEY": "p", "LANGFUSE_SECRET_KEY": "s", "LANGFUSE_BASE_URL": "https://cloud.langfuse.com"}
    assert tracing.langfuse_configured(env) is True
    assert tracing.langfuse_host(env) == "https://cloud.langfuse.com"


def test_init_is_idempotent():
    exp = InMemorySpanExporter()
    assert tracing.init_tracing(env=KEYS, exporter=exp) is True
    first = tracing._provider
    assert tracing.init_tracing(env=KEYS, exporter=InMemorySpanExporter()) is True
    assert tracing._provider is first            # second call built nothing


def test_spans_sit_in_batch_until_flushed_then_arrive_on_shutdown():
    exp = InMemorySpanExporter()
    tracing.init_tracing(env=KEYS, exporter=exp)
    _emit()
    assert exp.get_finished_spans() == ()        # BatchSpanProcessor: 5 s delay, nothing sent yet
    assert tracing.shutdown_tracing() is True
    assert len(exp.get_finished_spans()) == 1    # flush on shutdown delivered it


def test_shutdown_without_init_is_a_safe_noop():
    assert tracing.shutdown_tracing() is True


def test_real_user_text_never_reaches_exporter_on_the_init_path():
    exp = InMemorySpanExporter()
    tracing.init_tracing(env=KEYS, exporter=exp)
    _emit("acct-real-1")
    tracing.shutdown_tracing()
    (s,) = exp.get_finished_spans()
    assert "langfuse.observation.input" not in s.attributes and "langfuse.observation.output" not in s.attributes


def test_lazy_path_also_inits_from_env(monkeypatch):
    """emit without an explicit init (old call sites) still goes through init_tracing, never a second code path."""
    for k, v in KEYS.items():
        monkeypatch.setenv(k, v)
    calls = []
    monkeypatch.setattr(tracing, "init_tracing", lambda *a, **k: calls.append(1) or False)
    tracing._get_tracer()
    assert calls == [1]


class _Handler(BaseHTTPRequestHandler):
    seen: list = []
    status = 200

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        self.rfile.read(n)
        _Handler.seen.append((self.path, self.headers.get("Authorization"), self.headers.get("Content-Type")))
        self.send_response(_Handler.status)
        self.end_headers()

    def log_message(self, *a):
        pass


@pytest.fixture
def server():
    _Handler.seen, _Handler.status = [], 200
    srv = HTTPServer(("127.0.0.1", 0), _Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{srv.server_port}", _Handler
    srv.shutdown()


def test_real_http_export_path_auth_and_status(server):
    url, h = server
    env = {**KEYS, "LANGFUSE_HOST": url + "/"}                 # trailing slash must not double up
    assert tracing.init_tracing(env=env) is True
    _emit()
    assert tracing.shutdown_tracing() is True
    # base64("pk-test:sk-test") is computed here by hand-independent encoder
    expect = "Basic " + base64.b64encode(b"pk-test:sk-test").decode()
    assert h.seen == [("/api/public/otel/v1/traces", expect, "application/x-protobuf")]
    assert tracing.export_status()["last_http_status"] == 200


def test_rejected_export_is_reported_not_swallowed(server):
    url, h = server
    h.status = 401
    tracing.init_tracing(env={**KEYS, "LANGFUSE_HOST": url})
    _emit()
    assert tracing.shutdown_tracing() is False                 # flush reported failure
    assert tracing.export_status()["last_http_status"] == 401

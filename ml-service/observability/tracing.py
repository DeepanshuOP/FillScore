"""LLM tracing: one OpenTelemetry trace per Council run, one span per router HTTP attempt.

* A trace id is always generated per run (stored on the council_runs doc as `trace_id`).
* Spans are exported (OTLP/HTTP to Langfuse) ONLY when LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY and
  LANGFUSE_HOST are all set; otherwise emit is a no-op.
* Prompt and response TEXT is attached only for demo accounts (config.demo_users.VALID_DEMO_USERS).
  Real users get metadata only: model, provider, role, latency, tokens, attempt, paced wait, outcome.
"""
from __future__ import annotations

import base64
import os
import secrets
import time
from contextvars import ContextVar

_run: ContextVar[dict | None] = ContextVar("fillscore_trace_run", default=None)
_tracer = None
_tracer_resolved = False


def is_demo_account(account_id: str | None) -> bool:
    from config.demo_users import VALID_DEMO_USERS
    return bool(account_id) and account_id in VALID_DEMO_USERS


def langfuse_host(env=None) -> str:
    """LANGFUSE_HOST, or LANGFUSE_BASE_URL (the name Langfuse's current SDK/docs use; ml-service/.env had this
    one, which is why tracing was silently off: the code only looked for LANGFUSE_HOST)."""
    env = os.environ if env is None else env
    return (env.get("LANGFUSE_HOST") or env.get("LANGFUSE_BASE_URL") or "").strip()


def langfuse_configured(env=None) -> bool:
    env = os.environ if env is None else env
    return bool(langfuse_host(env)) and all((env.get(k) or "").strip()
                                            for k in ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"))


_provider = None
_status: dict = {"configured": False, "last_http_status": None, "last_error": None}


def set_tracer(tracer) -> None:
    """Inject a tracer (tests); None resets to env-based resolution."""
    global _tracer, _tracer_resolved
    _tracer, _tracer_resolved = tracer, tracer is not None


def export_status() -> dict:
    return dict(_status)


def _record_http_status(exporter) -> None:
    """Remember each export's HTTP status so a rejected key is visible, not silent (best effort: the client
    attribute is private and may move between exporter releases)."""
    client = getattr(exporter, "_client", None)
    orig = getattr(client, "export", None)
    if orig is None:
        return

    def wrapped(*a, **k):
        res = orig(*a, **k)
        ok = bool(getattr(res, "success", False))
        _status["last_http_status"] = getattr(res, "status_code", None) or (200 if ok else None)
        err = getattr(res, "error", None)
        _status["last_error"] = None if ok else (type(err).__name__ if err else "ExportFailed")
        return res
    client.export = wrapped


def init_tracing(env=None, exporter=None) -> bool:
    """THE one tracing initialiser: FastAPI startup, eval/generation scripts and the smoke script all call it.
    Idempotent. True when spans will be exported (all three Langfuse vars set, or an exporter injected)."""
    global _provider, _tracer, _tracer_resolved
    if _provider is not None:
        return True
    env = os.environ if env is None else env
    if exporter is None and not langfuse_configured(env):
        _tracer, _tracer_resolved = None, True
        _status["configured"] = False
        return False
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    if exporter is None:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        auth = base64.b64encode(
            f"{env['LANGFUSE_PUBLIC_KEY'].strip()}:{env['LANGFUSE_SECRET_KEY'].strip()}".encode()).decode()
        # Langfuse OTLP/HTTP: <host>/api/public/otel/v1/traces, Basic pk:sk, HTTP/protobuf only (no gRPC).
        # x-langfuse-ingestion-version=4 makes data appear in real time (langfuse.com/integrations/native/opentelemetry)
        exporter = OTLPSpanExporter(
            endpoint=langfuse_host(env).rstrip("/") + "/api/public/otel/v1/traces",
            headers={"Authorization": f"Basic {auth}", "x-langfuse-ingestion-version": "4"})
        _record_http_status(exporter)
    _provider = TracerProvider(resource=Resource.create({"service.name": "fillscore-ml"}), shutdown_on_exit=False)
    _provider.add_span_processor(BatchSpanProcessor(exporter))
    _tracer, _tracer_resolved = _provider.get_tracer("fillscore.llm"), True
    _status.update(configured=True, last_http_status=None, last_error=None)
    import atexit
    atexit.register(shutdown_tracing)
    return True


def shutdown_tracing(timeout_ms: int = 10000) -> bool:
    """Flush then shut down. True if nothing to flush or the flush succeeded. Resets state."""
    global _provider, _tracer, _tracer_resolved
    prov, ok = _provider, True
    if prov is not None:
        try:
            ok = bool(prov.force_flush(timeout_ms)) and _status["last_error"] is None
            prov.shutdown()
        except Exception as exc:
            print(f"[tracing] shutdown failed: {type(exc).__name__}")
            ok = False
    _provider = _tracer = None
    _tracer_resolved = False
    return ok


def _get_tracer():
    if not _tracer_resolved:
        init_tracing()
    return _tracer


def start_run(account_id: str | None, name: str | None = None) -> str:
    """Begin a run trace in this context; returns the 32-hex trace id. `name` titles the root span."""
    trace_id = secrets.token_hex(16)
    _run.set({"trace_id": trace_id, "account_id": account_id, "name": name, "t0": time.time_ns()})
    return trace_id


def current_trace_id() -> str | None:
    r = _run.get()
    return r["trace_id"] if r else None


def _root_span(run: dict, tracer):
    """Lazily open the run's root span (carrying the run's trace id); children parent to it."""
    if run.get("root") is None:
        from opentelemetry import trace
        from opentelemetry.trace import NonRecordingSpan, SpanContext, TraceFlags
        seed = NonRecordingSpan(SpanContext(trace_id=int(run["trace_id"], 16), span_id=int(secrets.token_hex(8), 16) or 1,
                                            is_remote=True, trace_flags=TraceFlags(TraceFlags.SAMPLED)))
        root = tracer.start_span(run.get("name") or "council-run", context=trace.set_span_in_context(seed),
                                 start_time=run.get("t0"))   # run start, so the first (back-dated) child sits inside
        root.set_attribute("langfuse.observation.type", "span")
        run["root"] = root
    return run["root"]


def finish_run(outcome: str = "ok") -> None:
    """End the run's root span (no-op if tracing is off or no attempt was emitted)."""
    run = _run.get()
    root = run.get("root") if run else None
    if root is None:
        return
    try:
        root.set_attribute("fillscore.outcome", outcome)
        root.end()
    except Exception as exc:
        print(f"[tracing] finish failed: {type(exc).__name__}")
    run["root"] = None


def emit_attempt(*, role: str, provider: str, model: str, attempt: int, latency_ms: float,
                 prompt_tokens: int, completion_tokens: int, outcome: str, paced_wait_s: float = 0.0,
                 system: str | None = None, user: str | None = None, output: str | None = None) -> None:
    run = _run.get()
    tracer = _get_tracer()
    if run is None or tracer is None:
        return
    try:
        from opentelemetry import trace
        from opentelemetry.trace import NonRecordingSpan, SpanContext, TraceFlags, Status, StatusCode
        ctx = trace.set_span_in_context(_root_span(run, tracer))   # a REAL root: Langfuse needs one per trace
        end = time.time_ns()
        span = tracer.start_span(f"llm.{role}", context=ctx, start_time=end - int(latency_ms * 1e6))
        attrs = {
            "langfuse.observation.type": "generation",
            "gen_ai.system": provider, "gen_ai.request.model": model,
            "gen_ai.usage.input_tokens": int(prompt_tokens), "gen_ai.usage.output_tokens": int(completion_tokens),
            "fillscore.role": role, "fillscore.attempt": int(attempt), "fillscore.latency_ms": float(latency_ms),
            "fillscore.paced_wait_s": float(paced_wait_s), "fillscore.outcome": outcome,
        }
        if is_demo_account(run.get("account_id")):
            if system is not None or user is not None:
                attrs["langfuse.observation.input"] = f"[system]\n{system or ''}\n\n[user]\n{user or ''}"
            if output is not None:
                attrs["langfuse.observation.output"] = output
        span.set_attributes(attrs)
        if outcome != "ok":
            span.set_status(Status(StatusCode.ERROR, outcome))
        span.end(end_time=end)
    except Exception as exc:  # tracing must never break a Council run
        print(f"[tracing] emit failed: {type(exc).__name__}")

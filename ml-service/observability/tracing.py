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


def langfuse_configured(env=None) -> bool:
    env = os.environ if env is None else env
    return all((env.get(k) or "").strip() for k in ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_HOST"))


def set_tracer(tracer) -> None:
    """Inject a tracer (tests); None resets to env-based resolution."""
    global _tracer, _tracer_resolved
    _tracer, _tracer_resolved = tracer, tracer is not None


def _get_tracer():
    global _tracer, _tracer_resolved
    if _tracer_resolved:
        return _tracer
    _tracer_resolved = True
    if not langfuse_configured():
        return None
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    auth = base64.b64encode(
        f"{os.environ['LANGFUSE_PUBLIC_KEY'].strip()}:{os.environ['LANGFUSE_SECRET_KEY'].strip()}".encode()
    ).decode()
    exporter = OTLPSpanExporter(
        endpoint=os.environ["LANGFUSE_HOST"].strip().rstrip("/") + "/api/public/otel/v1/traces",
        headers={"Authorization": f"Basic {auth}", "x-langfuse-ingestion-version": "4"})
    provider = TracerProvider(resource=Resource.create({"service.name": "fillscore-ml"}))
    provider.add_span_processor(BatchSpanProcessor(exporter))
    _tracer = provider.get_tracer("fillscore.llm")
    return _tracer


def start_run(account_id: str | None) -> str:
    """Begin a Council run trace in this context; returns the 32-hex trace id."""
    trace_id = secrets.token_hex(16)
    _run.set({"trace_id": trace_id, "account_id": account_id})
    return trace_id


def current_trace_id() -> str | None:
    r = _run.get()
    return r["trace_id"] if r else None


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
        parent = NonRecordingSpan(SpanContext(trace_id=int(run["trace_id"], 16),
                                              span_id=int(secrets.token_hex(8), 16) or 1,
                                              is_remote=True, trace_flags=TraceFlags(TraceFlags.SAMPLED)))
        ctx = trace.set_span_in_context(parent)
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

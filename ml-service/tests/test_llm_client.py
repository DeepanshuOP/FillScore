"""Retry timing and error codes for LLM calls.

Phase 1b.4 moved model selection to config/llm_routes.yaml: the env-var model overrides, the
retired-name rewrite and the per-model client wrapper were removed (no model name may live outside
the YAML). Their replacements are tested in test_llm_router.py (per-model extra_body and
max_tokens factor; 404 falls through to the next model)."""
import asyncio

import pytest

from agents import llm_client
from agents.errors import classify_exception, safe_message


def test_retry_delay_reads_the_wait_groq_asks_for():
    assert llm_client.retry_delay_seconds(Exception("Rate limit reached. Please try again in 6.2s."), 0) == pytest.approx(6.7)
    assert llm_client.retry_delay_seconds(Exception("Please try again in 850ms."), 0) == pytest.approx(1.35)
    assert llm_client.retry_delay_seconds(Exception("try again in 1m3.4s"), 0) == 30  # capped


def test_retry_delay_falls_back_to_backoff_without_a_hint():
    first = llm_client.retry_delay_seconds(Exception("429 Too Many Requests"), 0)
    third = llm_client.retry_delay_seconds(Exception("429 Too Many Requests"), 2)
    assert 1 <= first < 2.01
    assert 4 <= third < 5.01


def test_call_with_retry_waits_the_requested_time_then_succeeds(monkeypatch):
    sleeps = []

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(llm_client.asyncio, "sleep", fake_sleep)
    attempts = {"n": 0}

    async def flaky():
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise Exception("Error code: 429 - Please try again in 4s")
        return "ok"

    assert asyncio.run(llm_client.call_with_retry(flaky)) == "ok"
    assert sleeps == [pytest.approx(4.5), pytest.approx(4.5)]


def test_call_with_retry_does_not_retry_other_errors(monkeypatch):
    async def broken():
        raise ValueError("nope")

    with pytest.raises(ValueError):
        asyncio.run(llm_client.call_with_retry(broken))


def test_missing_model_is_its_own_error_code():
    class NotFoundError(Exception):
        pass

    code = classify_exception(NotFoundError("The model does not exist or you do not have access to it"))
    assert code == "MODEL_UNAVAILABLE"
    assert "model" in safe_message(code).lower()



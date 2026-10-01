"""Model selection and retry timing for the Groq calls (Groq retired the Llama models in Aug 2026)."""
import asyncio
import importlib

import pytest

from agents import llm_client
from agents.errors import classify_exception, safe_message


def _reload(monkeypatch, **env):
    for key in ("GROQ_SPECIALIST_MODEL", "GROQ_SYNTHESIS_MODEL"):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return importlib.reload(llm_client)


def test_default_models_are_current_groq_free_models(monkeypatch):
    mod = _reload(monkeypatch)
    assert mod.SPECIALIST_MODEL == "openai/gpt-oss-120b"
    assert mod.SYNTHESIS_MODEL == "openai/gpt-oss-120b"
    _reload(monkeypatch)


def test_models_can_be_overridden_from_the_environment(monkeypatch):
    mod = _reload(monkeypatch, GROQ_SPECIALIST_MODEL="openai/gpt-oss-20b", GROQ_SYNTHESIS_MODEL="qwen/qwen3.6-27b")
    assert mod.SPECIALIST_MODEL == "openai/gpt-oss-20b"
    assert mod.SYNTHESIS_MODEL == "qwen/qwen3.6-27b"
    _reload(monkeypatch)


def test_blank_override_falls_back_to_default(monkeypatch):
    mod = _reload(monkeypatch, GROQ_SPECIALIST_MODEL="   ")
    assert mod.SPECIALIST_MODEL == "openai/gpt-oss-120b"
    _reload(monkeypatch)


def test_reasoning_effort_is_low_for_gpt_oss_only():
    assert llm_client.model_extra("openai/gpt-oss-120b") == {"reasoning_effort": "low"}
    assert llm_client.model_extra("openai/gpt-oss-20b") == {"reasoning_effort": "low"}
    assert llm_client.model_extra("qwen/qwen3.6-27b") == {}


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


class _FakeCompletions:
    def __init__(self):
        self.calls = []

    async def create(self, *args, **kwargs):
        self.calls.append(kwargs)
        return "response"


class _FakeClient:
    def __init__(self):
        self.chat = type("Chat", (), {})()
        self.chat.completions = _FakeCompletions()


def test_wrapped_client_asks_gpt_oss_for_low_reasoning_and_more_room():
    client = _FakeClient()
    llm_client.adapt_client_for_models(client)
    asyncio.run(client.chat.completions.create(model="openai/gpt-oss-120b", max_tokens=500, messages=[]))
    sent = client.chat.completions.calls[0]
    assert sent["extra_body"] == {"reasoning_effort": "low"}
    assert sent["max_tokens"] == 900


def test_wrapped_client_leaves_other_models_alone():
    client = _FakeClient()
    llm_client.adapt_client_for_models(client)
    asyncio.run(client.chat.completions.create(model="qwen/qwen3.6-27b", max_tokens=500, messages=[]))
    sent = client.chat.completions.calls[0]
    assert "extra_body" not in sent
    assert sent["max_tokens"] == 500


def test_wrapped_client_replaces_retired_model_names():
    client = _FakeClient()
    llm_client.adapt_client_for_models(client)
    asyncio.run(client.chat.completions.create(model="llama-3.3-70b-versatile", max_tokens=600, messages=[]))
    sent = client.chat.completions.calls[0]
    assert sent["model"] == llm_client.SPECIALIST_MODEL
    assert sent["extra_body"] == {"reasoning_effort": "low"}


def test_wrapped_client_keeps_a_caller_supplied_extra_body():
    client = _FakeClient()
    llm_client.adapt_client_for_models(client)
    asyncio.run(client.chat.completions.create(model="openai/gpt-oss-20b", extra_body={"foo": 1}, messages=[]))
    assert client.chat.completions.calls[0]["extra_body"] == {"reasoning_effort": "low", "foo": 1}

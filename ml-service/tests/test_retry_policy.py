"""1b.3 retry policy: retry only 429 / 5xx / timeouts, honour the provider's wait headers, at most
3 attempts, and never retry other 4xx (those go straight to the router's fallback)."""
import asyncio

import pytest

from agents import llm_client


class _Resp:
    def __init__(self, headers):
        self.headers = headers


class FakeStatusError(Exception):
    """Shaped like openai.APIStatusError: .status_code plus .response.headers."""

    def __init__(self, status, headers=None, message="provider error"):
        super().__init__(f"Error code: {status} - {message}")
        self.status_code = status
        self.response = _Resp(headers or {})


class APITimeoutError(Exception):
    pass


def _run(coro_fn, sleeps, **kw):
    async def fake_sleep(s):
        sleeps.append(s)

    return asyncio.run(llm_client.call_with_retry(coro_fn, sleep=fake_sleep, **kw))


def _failing_then_ok(errors):
    calls = {"n": 0}

    async def fn():
        calls["n"] += 1
        if calls["n"] <= len(errors):
            raise errors[calls["n"] - 1]
        return "ok"

    return fn, calls


def test_retry_after_header_is_honoured():
    fn, calls = _failing_then_ok([FakeStatusError(429, {"retry-after": "2"})])
    sleeps = []
    assert _run(fn, sleeps) == "ok"
    assert sleeps == [2.0]          # the header says 2 s, so we wait exactly 2 s
    assert calls["n"] == 2


def test_groq_reset_duration_headers_are_parsed():
    # No retry-after; reset-tokens "7.66s" (per-minute window) and reset-requests "2m59.56s" (daily
    # window) -> wait the shorter, 7.66 s; a longer daily wait would only push the call to fallback.
    fn, _ = _failing_then_ok([FakeStatusError(429, {"x-ratelimit-reset-tokens": "7.66s",
                                                   "x-ratelimit-reset-requests": "2m59.56s"})])
    sleeps = []
    _run(fn, sleeps)
    assert sleeps == [pytest.approx(7.66)]


def test_reset_duration_with_minutes_and_ms():
    assert llm_client.parse_duration_s("2m59.56s") == pytest.approx(179.56)   # 2*60 + 59.56
    assert llm_client.parse_duration_s("850ms") == pytest.approx(0.85)
    assert llm_client.parse_duration_s("1h2m3s") == pytest.approx(3723.0)    # 3600 + 120 + 3
    assert llm_client.parse_duration_s("4") == pytest.approx(4.0)
    assert llm_client.parse_duration_s("soon") is None


def test_a_server_wait_longer_than_the_cap_is_not_slept_through():
    # A 429 that says "come back in 3 minutes" goes to the next model instead of blocking the run.
    err = FakeStatusError(429, {"retry-after": "180"})
    fn, calls = _failing_then_ok([err])
    sleeps = []
    with pytest.raises(FakeStatusError):
        _run(fn, sleeps)
    assert sleeps == [] and calls["n"] == 1


@pytest.mark.parametrize("status", [500, 502, 503])
def test_5xx_is_retried(status):
    fn, calls = _failing_then_ok([FakeStatusError(status)])
    sleeps = []
    assert _run(fn, sleeps) == "ok"
    assert calls["n"] == 2 and len(sleeps) == 1


def test_timeouts_are_retried():
    fn, calls = _failing_then_ok([APITimeoutError("Request timed out."), asyncio.TimeoutError()])
    sleeps = []
    assert _run(fn, sleeps) == "ok"
    assert calls["n"] == 3 and len(sleeps) == 2


@pytest.mark.parametrize("status", [400, 401, 403, 404])
def test_other_4xx_are_never_retried(status):
    fn, calls = _failing_then_ok([FakeStatusError(status)])
    sleeps = []
    with pytest.raises(FakeStatusError):
        _run(fn, sleeps)
    assert calls["n"] == 1 and sleeps == []


def test_attempts_are_capped_at_three():
    errors = [FakeStatusError(429, {"retry-after": "1"})] * 5
    fn, calls = _failing_then_ok(errors)
    sleeps = []
    with pytest.raises(FakeStatusError):
        _run(fn, sleeps)
    assert calls["n"] == 3          # 3 attempts, then the error goes to the caller
    assert sleeps == [1.0, 1.0]     # 2 waits between 3 attempts


def test_on_error_hook_sees_every_failed_attempt():
    seen = []
    fn, _ = _failing_then_ok([FakeStatusError(503), FakeStatusError(404)])
    with pytest.raises(FakeStatusError):
        _run(fn, [], on_error=lambda exc, attempt, will_retry: seen.append((exc.status_code, attempt, will_retry)))
    assert seen == [(503, 1, True), (404, 2, False)]

"""Low-level LLM call helpers: the retry policy, JSON extraction and token roll-up.

Model names and providers live only in config/llm_routes.yaml (see agents/llm_router.py).

Retry policy (Phase 1b.3): retry only rate limits (429), server errors (5xx) and timeouts, at most
MAX_ATTEMPTS times, waiting what the provider asks for (retry-after, then x-ratelimit-reset-*).
Every other error, 404 and 401 included, is raised at once so the router can fall back to the
next model. A provider wait longer than MAX_RETRY_WAIT_S is not slept through either.
"""
import asyncio
import random
import re
from typing import Any, Callable, Coroutine

MAX_ATTEMPTS = 3
MAX_RETRY_WAIT_S = 30

_RETRY_HINT = re.compile(r"try again in (?:(\d+)m(?=\d))?(?:(\d+(?:\.\d+)?)(ms|s))?", re.IGNORECASE)
_STATUS_IN_TEXT = re.compile(r"Error code: (\d{3})")
_DURATION_PART = re.compile(r"(\d+(?:\.\d+)?)(ms|h|m|s)")


def parse_duration_s(value: str) -> float | None:
    """Parse a provider duration header: "2", "7.66s", "850ms", "2m59.56s", "1h2m3s"."""
    text = str(value).strip().lower()
    try:
        return float(text)
    except ValueError:
        pass
    parts = _DURATION_PART.findall(text)
    if not parts or "".join(a + u for a, u in parts) != text:
        return None
    scale = {"h": 3600.0, "m": 60.0, "s": 1.0, "ms": 0.001}
    return sum(float(amount) * scale[unit] for amount, unit in parts)


def status_of(exc: BaseException) -> int | None:
    status = getattr(exc, "status_code", None)
    if isinstance(status, int):
        return status
    text = str(exc)
    match = _STATUS_IN_TEXT.search(text)
    if match:
        return int(match.group(1))
    if "429" in text or "too many requests" in text.lower():
        return 429
    return None


def is_timeout(exc: BaseException) -> bool:
    return isinstance(exc, (asyncio.TimeoutError, TimeoutError)) or "Timeout" in type(exc).__name__


def is_retryable(exc: BaseException) -> bool:
    if is_timeout(exc):
        return True
    status = status_of(exc)
    return status == 429 or (status is not None and 500 <= status < 600)


def _headers_of(exc: BaseException) -> dict:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None) or getattr(exc, "headers", None) or {}
    try:
        return {str(k).lower(): v for k, v in dict(headers).items()}
    except Exception:
        return {}


def server_wait_seconds(exc: BaseException) -> float | None:
    """The wait the provider asked for in its headers, uncapped, or None if it sent none."""
    headers = _headers_of(exc)
    if "retry-after" in headers:
        wait = parse_duration_s(headers["retry-after"])
        if wait is not None:
            return wait
    resets = [parse_duration_s(v) for k, v in headers.items() if k.startswith("x-ratelimit-reset")]
    resets = [w for w in resets if w is not None]
    # Groq sends reset-requests for the daily window and reset-tokens for the minute window; the
    # shorter one is the wait worth trying (a longer daily wait goes over the cap and falls back).
    return min(resets) if resets else None


def retry_delay_seconds(exc: BaseException, attempt: int) -> float:
    """Seconds to wait before the next attempt: the provider's header, else the "try again in"
    hint in the error text (plus a little), else exponential backoff; capped."""
    header_wait = server_wait_seconds(exc)
    if header_wait is not None:
        return min(header_wait, MAX_RETRY_WAIT_S)
    match = _RETRY_HINT.search(str(exc))
    if match and (match.group(1) or match.group(2)):
        minutes = int(match.group(1) or 0)
        amount = float(match.group(2) or 0)
        seconds = amount / 1000 if (match.group(3) or "").lower() == "ms" else amount
        return min(minutes * 60 + seconds + 0.5, MAX_RETRY_WAIT_S)
    return min((2 ** attempt) + random.uniform(0, 1), MAX_RETRY_WAIT_S)


def rollup_token_usage(usages: list[dict]) -> dict:
    return {
        "prompt_tokens": sum(u.get("prompt_tokens", 0) for u in usages),
        "completion_tokens": sum(u.get("completion_tokens", 0) for u in usages),
        "total_tokens": sum(u.get("total_tokens", 0) for u in usages),
        "n_calls": len(usages)
    }


def usage_of(resp: Any) -> dict:
    usage = getattr(resp, "usage", None)
    if not usage:
        return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    prompt = getattr(usage, "prompt_tokens", 0) or 0
    completion = getattr(usage, "completion_tokens", 0) or 0
    total = getattr(usage, "total_tokens", 0) or (prompt + completion)
    return {"prompt_tokens": int(prompt), "completion_tokens": int(completion), "total_tokens": int(total)}


async def call_with_retry(
    coro_fn: Callable[[], Coroutine[Any, Any, Any]],
    max_attempts: int = MAX_ATTEMPTS,
    usage_sink: list | None = None,
    sleep: Callable[[float], Coroutine[Any, Any, Any]] | None = None,
    on_error: Callable[[BaseException, int, bool], None] | None = None,
) -> Any:
    """Run coro_fn under the retry policy. on_error(exc, attempt, will_retry) sees each failure."""
    for attempt in range(max_attempts):
        try:
            resp = await coro_fn()
        except Exception as exc:
            will_retry = is_retryable(exc) and attempt < max_attempts - 1
            if will_retry:
                asked = server_wait_seconds(exc)
                if asked is not None and asked > MAX_RETRY_WAIT_S:
                    will_retry = False
            if on_error is not None:
                on_error(exc, attempt + 1, will_retry)
            if not will_retry:
                raise
            wait = retry_delay_seconds(exc, attempt)
            print(f"[retry] {type(exc).__name__} status={status_of(exc)}, waiting {wait:.1f}s before attempt {attempt + 2}/{max_attempts}")
            await (sleep or asyncio.sleep)(wait)
            continue
        if usage_sink is not None and getattr(resp, "usage", None):
            usage_sink.append(usage_of(resp))
        return resp
    raise RuntimeError("unreachable")  # pragma: no cover


def extract_json_from_response(content) -> dict | None:
    """4-stage JSON extractor — handles fenced, bare, raw, and reasoning-model block responses.
    Ported from virattt/ai-hedge-fund utils/llm.py (battle-tested, 43 contributors).
    """
    import json as _json
    try:
        # Reasoning models (e.g. Anthropic extended thinking, DeepSeek R1) return content as
        # a list of blocks (thinking + text). Concatenate the text blocks.
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, str):
                    parts.append(block)
                elif isinstance(block, dict) and block.get("type") == "text":
                    parts.append(block.get("text", ""))
            content = "\n".join(parts)

        # Stage 1: markdown ```json fence
        json_start = content.find("```json")
        if json_start != -1:
            json_text = content[json_start + 7:]
            json_end = json_text.find("```")
            if json_end != -1:
                try:
                    return _json.loads(json_text[:json_end].strip())
                except _json.JSONDecodeError:
                    pass

        # Stage 2: bare ``` fence
        json_start = content.find("```")
        if json_start != -1:
            json_text = content[json_start + 3:]
            json_end = json_text.find("```")
            if json_end != -1:
                try:
                    return _json.loads(json_text[:json_end].strip())
                except _json.JSONDecodeError:
                    pass

        # Stage 3: whole string
        try:
            return _json.loads(content.strip())
        except _json.JSONDecodeError:
            pass

        # Stage 4: brace-depth matching — find first top-level JSON object
        brace_start = content.find("{")
        if brace_start != -1:
            depth = 0
            for i, char in enumerate(content[brace_start:], brace_start):
                if char == "{":
                    depth += 1
                elif char == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            return _json.loads(content[brace_start:i + 1])
                        except _json.JSONDecodeError:
                            break
    except Exception as e:
        print(f"[extract_json] error: {e}")
    return None

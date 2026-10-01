import asyncio
import os
import random
import re
from typing import Callable, Coroutine, Any
from openai import AsyncOpenAI
from groq import AsyncGroq

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Groq retired the Llama models on 2026-08-16; openai/gpt-oss-120b is the free-tier replacement.
# Both can be changed from the environment when Groq changes its lineup again.
DEFAULT_MODEL = "openai/gpt-oss-120b"


def _model_from_env(name: str) -> str:
    return os.getenv(name, "").strip() or DEFAULT_MODEL


SPECIALIST_MODEL = _model_from_env("GROQ_SPECIALIST_MODEL")
SYNTHESIS_MODEL = _model_from_env("GROQ_SYNTHESIS_MODEL")
SYNTHESIS_PROVIDER = "groq"

MAX_RETRIES = 4
MAX_RETRY_WAIT_S = 30


def model_extra(model: str) -> dict:
    """Extra request fields per model. gpt-oss models think before answering and the thinking
    counts against max_tokens, so ask for the lowest effort to leave room for the JSON answer."""
    if model.startswith("openai/gpt-oss"):
        return {"reasoning_effort": "low"}
    return {}


_RETRY_HINT = re.compile(r"try again in (?:(\d+)m(?=\d))?(?:(\d+(?:\.\d+)?)(ms|s))?", re.IGNORECASE)


def retry_delay_seconds(exc: BaseException, attempt: int) -> float:
    """How long to wait before retrying a rate-limited call: the wait Groq asks for (plus a
    little), capped, else exponential backoff."""
    match = _RETRY_HINT.search(str(exc))
    if match and (match.group(1) or match.group(2)):
        minutes = int(match.group(1) or 0)
        amount = float(match.group(2) or 0)
        seconds = amount / 1000 if (match.group(3) or "").lower() == "ms" else amount
        return min(minutes * 60 + seconds + 0.5, MAX_RETRY_WAIT_S)
    return (2 ** attempt) + random.uniform(0, 1)

# Model names Groq has shut down. Any call that still asks for one is sent to the current model
# instead of failing with a 404.
RETIRED_MODELS = {
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama-4-scout",
    "qwen3-32b",
}

# gpt-oss models spend part of max_tokens on thinking, so callers' answer budgets are scaled up.
REASONING_TOKEN_FACTOR = 1.8


def adapt_client_for_models(client):
    """Wrap client.chat.completions.create so every call uses a live model and the right
    request options, without each agent having to know about Groq's model lineup."""
    completions = client.chat.completions
    original = completions.create

    async def create(*args, **kwargs):
        model = kwargs.get("model", "")
        if model in RETIRED_MODELS:
            model = kwargs["model"] = SPECIALIST_MODEL
        extra = model_extra(model)
        if extra:
            kwargs["extra_body"] = {**extra, **(kwargs.get("extra_body") or {})}
            if kwargs.get("max_tokens"):
                kwargs["max_tokens"] = int(kwargs["max_tokens"] * REASONING_TOKEN_FACTOR)
        return await original(*args, **kwargs)

    completions.create = create
    return client


def get_groq_client() -> AsyncGroq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set in environment")
    return adapt_client_for_models(AsyncGroq(api_key=api_key))

def get_openrouter_client() -> AsyncOpenAI:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY not set in environment")
    return AsyncOpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=api_key,
        default_headers={
            "HTTP-Referer": "https://fillscore.io",
            "X-Title": "FillScore Agent Council"
        }
    )

def rollup_token_usage(usages: list[dict]) -> dict:
    return {
        "prompt_tokens": sum(u.get("prompt_tokens", 0) for u in usages),
        "completion_tokens": sum(u.get("completion_tokens", 0) for u in usages),
        "total_tokens": sum(u.get("total_tokens", 0) for u in usages),
        "n_calls": len(usages)
    }

async def call_with_retry(coro_fn: Callable[[], Coroutine[Any, Any, Any]], max_retries: int = MAX_RETRIES, usage_sink: list | None = None) -> Any:
    for attempt in range(max_retries):
        try:
            resp = await coro_fn()
            if usage_sink is not None and hasattr(resp, "usage") and resp.usage:
                usage_sink.append({
                    "prompt_tokens": getattr(resp.usage, "prompt_tokens", 0) or 0,
                    "completion_tokens": getattr(resp.usage, "completion_tokens", 0) or 0,
                    "total_tokens": getattr(resp.usage, "total_tokens", 0) or 0,
                })
            return resp
        except Exception as e:
            if "429" in str(e) or "Too Many Requests" in str(e):
                wait = retry_delay_seconds(e, attempt)
                print(f"[retry] 429 received, waiting {wait:.1f}s before retry {attempt+1}/{max_retries}")
                await asyncio.sleep(wait)
            else:
                raise
    raise Exception(f"Max retries exceeded after {max_retries} attempts")

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

import asyncio
import os
import random
from typing import Callable, Coroutine, Any
from openai import AsyncOpenAI
from groq import AsyncGroq

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

SPECIALIST_MODEL = "llama-3.3-70b-versatile"
SYNTHESIS_MODEL = "llama-3.3-70b-versatile"
SYNTHESIS_PROVIDER = "groq"

def get_groq_client() -> AsyncGroq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set in environment")
    return AsyncGroq(api_key=api_key)

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

async def call_with_retry(coro_fn: Callable[[], Coroutine[Any, Any, Any]], max_retries: int = 3) -> Any:
    for attempt in range(max_retries):
        try:
            return await coro_fn()
        except Exception as e:
            if "429" in str(e) or "Too Many Requests" in str(e):
                wait = (2 ** attempt) + random.uniform(0, 1)
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

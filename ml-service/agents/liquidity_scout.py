"""Liquidity Scout — specialist agent for slippage & liquidity analysis.

Uses claude-haiku-4-5 for fast structured JSON extraction.
Focuses on metrics from the LiquidityMetricsPacket.
"""

from __future__ import annotations

import asyncio
import json

from groq import AsyncGroq

from agents.schemas import LiquidityVerdict, TradeContext
from agents.metrics.liquidity_packet import LiquidityMetricsPacket
from agents.llm_client import SPECIALIST_MODEL, call_with_retry
TIMEOUT_S = 60

SYSTEM_PROMPT = (
    "You are FillScore's Liquidity Scout agent. You analyze trade execution "
    "liquidity conditions. Given a trader's context, evaluate liquidity quality "
    "based on the provided LiquidityMetricsPacket.\n\n"
    "Return ONLY valid JSON matching this schema — no prose, no markdown fences, "
    "no preamble:\n"
    "{\n"
    '  "agent": "liquidity_scout",\n'
    '  "liquidityRating": "GOOD" | "MODERATE" | "POOR" | "CRITICAL",\n'
    '  "slippageRoot": string (max 100 chars, root cause citing packet keys, no invented numbers),\n'
    '  "cited_evidence": [string] (keys from the packet that support this verdict),\n'
    '  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",\n'
    '  "confidence": float (0-1),\n'
    '  "flags": [string]\n'
    "}\n\n"
    "Rating guide:\n"
    "- GOOD: low slippage, little adverse selection\n"
    "- POOR / CRITICAL: high slippage, strong adverse selection\n"
    "- MODERATE: everything else\n"
)


async def run(context: TradeContext, client: AsyncGroq, packet: LiquidityMetricsPacket = None, usage_sink: list | None = None) -> LiquidityVerdict:
    """Execute the Liquidity Scout agent against the given trade context."""
    user_content = f"""LiquidityMetricsPacket:
{json.dumps(packet.to_prompt_dict(), indent=2)}

Regime: {context.regime}

Assign liquidityRating, write slippageRoot citing packet keys, list cited_evidence keys.
Schema: liquidityRating (GOOD/MODERATE/POOR/CRITICAL), slippageRoot (str), cited_evidence (list[str]), severity (LOW/MEDIUM/HIGH/CRITICAL), confidence (0-1), flags (list[str])"""

    async def _call():
        return await client.chat.completions.create(
            model=SPECIALIST_MODEL,
            max_tokens=500,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content}
            ],
            temperature=0.1
        )
    
    response = await asyncio.wait_for(
        call_with_retry(_call, usage_sink=usage_sink),
        timeout=TIMEOUT_S,
    )

    raw_text = response.choices[0].message.content
    import re
    cleaned = re.sub(r'^```(?:json)?\s*', '', raw_text.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r'```\s*$', '', cleaned.strip(), flags=re.MULTILINE)
    raw_text = cleaned.strip()

    from agents.llm_client import extract_json_from_response
    parsed = extract_json_from_response(raw_text)
    if parsed is None:
        raise ValueError(f"Could not extract JSON from response: {raw_text[:200]}")
    verdict = LiquidityVerdict.model_validate(parsed)
    return verdict

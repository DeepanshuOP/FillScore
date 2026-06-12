"""Alpha Architect — specialist agent for execution alpha analysis.

Uses claude-haiku-4-5 for fast structured JSON extraction.
Focuses on metrics from AlphaMetricsPacket.
"""

from __future__ import annotations

import asyncio
import json

from groq import AsyncGroq

from agents.schemas import AlphaVerdict, TradeContext
from agents.metrics.alpha_packet import AlphaMetricsPacket
from agents.llm_client import SPECIALIST_MODEL, call_with_retry
TIMEOUT_S = 60

SYSTEM_PROMPT = (
    "You are FillScore's Alpha Architect agent. You evaluate whether a trader's "
    "execution captures or leaks alpha relative to benchmarks.\n\n"
    "Return ONLY valid JSON matching this schema — no prose, no markdown fences, "
    "no preamble:\n"
    "{\n"
    '  "agent": "alpha_architect",\n'
    '  "alphaRating": "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "SEVERELY_NEGATIVE",\n'
    '  "bestAlternative": string (recommended execution alternative),\n'
    '  "cited_evidence": [string] (keys from the packet that support this verdict),\n'
    '  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",\n'
    '  "confidence": float (0-1),\n'
    '  "flags": [string]\n'
    "}\n"
)


async def run(context: TradeContext, client: AsyncGroq, packet: AlphaMetricsPacket = None) -> AlphaVerdict:
    """Execute the Alpha Architect agent against the given trade context."""
    user_content = f"""AlphaMetricsPacket:
{json.dumps(packet.to_prompt_dict(), indent=2)}

Regime: {context.regime}

Assign alphaRating, write bestAlternative, list cited_evidence keys.
Schema: alphaRating (POSITIVE/NEUTRAL/NEGATIVE/SEVERELY_NEGATIVE), bestAlternative (str), cited_evidence (list[str]), severity (LOW/MEDIUM/HIGH/CRITICAL), confidence (0-1), flags (list[str])"""

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
        call_with_retry(_call),
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
    verdict = AlphaVerdict.model_validate(parsed)
    return verdict

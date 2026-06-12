"""Fee Optimizer — specialist agent for fee efficiency analysis.

Uses claude-haiku-4-5 for fast structured JSON extraction.
Focuses on metrics from FeeMetricsPacket.
"""

from __future__ import annotations

import asyncio
import json

from groq import AsyncGroq

from agents.schemas import FeeVerdict, TradeContext
from agents.metrics.fee_packet import FeeMetricsPacket
from agents.llm_client import SPECIALIST_MODEL, call_with_retry
TIMEOUT_S = 60

SYSTEM_PROMPT = (
    "You are FillScore's Fee Optimizer agent. You evaluate fee efficiency for "
    "a crypto spot trader.\n\n"
    "Return ONLY valid JSON matching this schema — no prose, no markdown fences, "
    "no preamble:\n"
    "{\n"
    '  "agent": "fee_optimizer",\n'
    '  "feeRating": "OPTIMAL" | "MODERATE" | "WASTEFUL" | "SEVERELY_WASTEFUL",\n'
    '  "recommendedAction": string (Specific action, e.g. "Switch to limit orders on BTC"),\n'
    '  "cited_evidence": [string] (keys from the packet that support this verdict),\n'
    '  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",\n'
    '  "confidence": float (0-1),\n'
    '  "flags": [string]\n'
    "}\n"
)


async def run(context: TradeContext, client: AsyncGroq, packet: FeeMetricsPacket = None) -> FeeVerdict:
    """Execute the Fee Optimizer agent against the given trade context."""
    user_content = f"""FeeMetricsPacket:
{json.dumps(packet.to_prompt_dict(), indent=2)}

Regime: {context.regime}

Assign feeRating, write recommendedAction, list cited_evidence keys.
Schema: feeRating (OPTIMAL/MODERATE/WASTEFUL/SEVERELY_WASTEFUL), recommendedAction (str), cited_evidence (list[str]), severity (LOW/MEDIUM/HIGH/CRITICAL), confidence (0-1), flags (list[str])"""

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
    verdict = FeeVerdict.model_validate(parsed)
    return verdict

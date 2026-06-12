"""Synthesis Agent — conflict resolution & recommendation generation.

Uses claude-sonnet-4-6 for nuanced reasoning across all four specialist verdicts.
Priority in volatile regimes: Risk > Liquidity > Fee > Alpha.
Priority in stable regimes:  Liquidity > Alpha > Fee > Risk.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from openai import AsyncOpenAI

from agents.schemas import SynthesisOutput, TradeContext
from agents.metrics.fee_packet import FeeMetricsPacket
from agents.metrics.risk_packet import RiskMetricsPacket
from agents.metrics.liquidity_packet import LiquidityMetricsPacket
from agents.metrics.alpha_packet import AlphaMetricsPacket
from agents.llm_client import SYNTHESIS_MODEL, SYNTHESIS_PROVIDER, call_with_retry
TIMEOUT_S = 90

SYSTEM_PROMPT = (
    "You are FillScore's execution quality synthesis agent. You receive structured "
    "verdicts from four specialist agents and the user's trade context. Resolve any "
    "conflicts between agents using this priority:\n"
    "  - Volatile regimes: Risk > Liquidity > Fee > Alpha\n"
    "  - Stable regimes: Liquidity > Alpha > Fee > Risk\n\n"
    "Return ONLY valid JSON matching this schema — no prose, no markdown fences, "
    "no preamble:\n"
    "{\n"
    '  "headline": string (max 150 chars, one-line executive summary),\n'
    '  "narrative": string (max 600 chars, detailed analysis),\n'
    '  "topRecommendations": [string, string, string] (exactly 3, each max 120 chars),\n'
    '  "conflictLedger": [{"between": string, "rule_applied": string, "winner": string}],\n'
    '  "overallRating": "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "CRITICAL",\n'
    '  "estimatedMonthlyCostUSD": float\n'
    "}\n\n"
    "Never invent costs or scores not present in the input. Read estimatedMonthlyCostUSD directly from fee_packet.total_fee_paid_usd scaled to monthly."
)


async def run(
    context: TradeContext,
    verdicts: dict[str, Any],
    client: AsyncOpenAI,
    fee_packet: FeeMetricsPacket = None,
    risk_packet: RiskMetricsPacket = None,
    liquidity_packet: LiquidityMetricsPacket = None,
    alpha_packet: AlphaMetricsPacket = None,
    debate_dict: dict | None = None,
) -> SynthesisOutput:
    """Execute the Synthesis agent, merging all specialist verdicts."""
    debate_section = ""
    if debate_dict and debate_dict.get("claims"):
        debate_section = f"""

EXECUTION TRIAL TRANSCRIPT:
Prosecution: {debate_dict.get('prosecution_summary', 'N/A')}
Defense: {debate_dict.get('defense_summary', 'N/A')}
Key Dispute: {debate_dict.get('key_dispute', 'N/A')}
Full claims:
{json.dumps(debate_dict.get('claims', []), indent=2)}

As the judge, weigh both sides. Your verdict must address the key dispute."""

    user_content = f"""FeeMetricsPacket:
{json.dumps(fee_packet.to_prompt_dict(), indent=2)}

RiskMetricsPacket:
{json.dumps(risk_packet.to_prompt_dict(), indent=2)}

LiquidityMetricsPacket:
{json.dumps(liquidity_packet.to_prompt_dict(), indent=2)}

AlphaMetricsPacket:
{json.dumps(alpha_packet.to_prompt_dict(), indent=2)}

Specialist Verdicts:
{json.dumps(verdicts, indent=2)}

Regime: {context.regime}
{debate_section}
Generate synthesis. Read estimatedMonthlyCostUSD directly from fee_packet.total_fee_paid_usd scaled to monthly."""

    async def _call():
        return await client.chat.completions.create(
            model=SYNTHESIS_MODEL,
            max_tokens=1000,
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
    synthesis = SynthesisOutput.model_validate(parsed)
    return synthesis

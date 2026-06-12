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

SYNTHESIS_SYSTEM_PROMPT = """You are the Judge in FillScore's Agent Council — a multi-agent execution quality tribunal.

You receive:
1. Four compressed specialist verdicts (label + severity + confidence only)
2. The Execution Trial transcript (prosecution vs defense debate)
3. The four deterministic MetricsPackets (ground truth numbers)

Your job:
- Weigh the specialist verdicts and the debate transcript
- Produce a headline (max 20 words), narrative (2-3 sentences), and exactly 3 recommendations
- Resolve any conflicts using the regime priority matrix:
  STABLE regime: Fee > Risk > Liquidity > Alpha
  VOLATILE regime: Liquidity > Risk > Fee > Alpha
- Fill conflictLedger with one entry per resolved conflict
- estimatedMonthlyCostUSD: read from fee_packet.total_fee_paid_usd — do NOT estimate or extrapolate

CRITICAL — Anti-fence-sitting rule:
Commit to EXCELLENT, GOOD, POOR, or CRITICAL when the evidence warrants it.
Reserve FAIR only when specialist verdicts are genuinely split (2 good, 2 bad).
If fee is WASTEFUL and liquidity is GOOD, that is NOT balanced — the fee cost is real money.
Never default to FAIR to avoid making a judgment.

Respond ONLY with valid JSON matching the schema. No preamble."""

def _compress_verdict(verdict_dict: dict) -> dict:
    """Compress a full verdict to {label, severity, confidence} for synthesis context."""
    # Extract the rating field (different name per agent)
    rating = (
        verdict_dict.get("liquidityRating") or
        verdict_dict.get("alphaRating") or
        verdict_dict.get("riskLevel") or
        verdict_dict.get("feeRating") or
        "UNKNOWN"
    )
    return {
        "agent": verdict_dict.get("agent", "unknown"),
        "rating": rating,
        "severity": verdict_dict.get("severity", "MEDIUM"),
        "confidence": verdict_dict.get("confidence", 0.0),
        "cited_evidence_count": len(verdict_dict.get("cited_evidence", [])),
        "flags": verdict_dict.get("flags", [])[:2],  # max 2 flags
    }


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
    compressed = [_compress_verdict(v) for v in verdicts.values()]

    user_content = f"""COMPRESSED SPECIALIST SIGNALS:
{json.dumps(compressed, indent=2)}

EXECUTION TRIAL:
Prosecution: {debate_dict.get('prosecution_summary', 'N/A') if debate_dict else 'N/A'}
Defense: {debate_dict.get('defense_summary', 'N/A') if debate_dict else 'N/A'}
Key Dispute: {debate_dict.get('key_dispute', 'N/A') if debate_dict else 'N/A'}

METRICS PACKETS (ground truth — use these numbers in narrative):
Fee: {json.dumps(fee_packet.to_prompt_dict() if fee_packet else {}, indent=2)}
Risk: {json.dumps(risk_packet.to_prompt_dict() if risk_packet else {}, indent=2)}
Liquidity: {json.dumps(liquidity_packet.to_prompt_dict() if liquidity_packet else {}, indent=2)}
Alpha: {json.dumps(alpha_packet.to_prompt_dict() if alpha_packet else {}, indent=2)}

REAL MONTHLY COST (from fee_packet, do not estimate):
estimatedMonthlyCostUSD = {fee_packet.total_fee_paid_usd if fee_packet else 0.0}

Regime: {context.regime}

Produce the judge verdict. conflictLedger must have one entry if any two specialists disagreed.
Schema fields: headline, narrative, topRecommendations (exactly 3), conflictLedger (list of {{between, rule_applied, winner}}), overallRating, estimatedMonthlyCostUSD"""

    async def _call():
        return await client.chat.completions.create(
            model=SYNTHESIS_MODEL,
            max_tokens=1000,
            messages=[
                {"role": "system", "content": SYNTHESIS_SYSTEM_PROMPT},
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

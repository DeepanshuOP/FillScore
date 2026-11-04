"""Fee Optimizer — specialist agent for fee efficiency.

Audits past executions from the deterministic FeeMetricsPacket. The model is chosen by the router
(config/llm_routes.yaml, role "specialist").
"""

from __future__ import annotations

import json

from agents.metrics.fee_packet import FeeMetricsPacket
from agents.prompts import system_prompt
from agents.schemas import TradeContext, FeeVerdict

ROLE = "specialist"
MAX_TOKENS = 500

SYSTEM_PROMPT = system_prompt(
    "You are FillScore's Fee Optimizer agent. You audit the fee efficiency of a "
    "crypto spot trader's past executions.\n\n"
    "Return ONLY valid JSON matching this schema — no prose, no markdown fences, "
    "no preamble:\n"
    "{\n"
    '  "agent": "fee_optimizer",\n'
    '  "feeRating": "OPTIMAL" | "MODERATE" | "WASTEFUL" | "SEVERELY_WASTEFUL",\n'
    '  "recommendedAction": string (one past-tense finding about where the fee cost came from, citing packet keys, e.g. "Most fills were taker orders (maker_ratio)"),\n'
    '  "cited_evidence": [string] (keys from the packet that support this verdict),\n'
    '  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",\n'
    '  "confidence": float (0-1),\n'
    '  "flags": [string]\n'
    "}\n"
)


def build_user_prompt(context: TradeContext, packet: FeeMetricsPacket) -> str:
    return f"""FeeMetricsPacket:
{json.dumps(packet.to_prompt_dict(), indent=2)}

Regime: {context.regime}

Assign feeRating, write recommendedAction, list cited_evidence keys.
Schema: feeRating (OPTIMAL/MODERATE/WASTEFUL/SEVERELY_WASTEFUL), recommendedAction (str), cited_evidence (list[str]), severity (LOW/MEDIUM/HIGH/CRITICAL), confidence (0-1), flags (list[str])"""


async def run(context: TradeContext, llm, packet: FeeMetricsPacket, telemetry: list | None = None) -> FeeVerdict:
    """Run the agent through the router; raises if no model produced a valid verdict."""
    return await llm.complete(
        ROLE,
        SYSTEM_PROMPT,
        build_user_prompt(context, packet),
        FeeVerdict,
        max_tokens=MAX_TOKENS,
        temperature=0.1,
        telemetry=telemetry,
    )

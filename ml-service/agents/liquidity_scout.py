"""Liquidity Scout — specialist agent for slippage & liquidity analysis.

Audits past executions from the deterministic LiquidityMetricsPacket. The model is chosen by the router
(config/llm_routes.yaml, role "specialist").
"""

from __future__ import annotations

import json

from agents.metrics.liquidity_packet import LiquidityMetricsPacket
from agents.prompts import system_prompt
from agents.schemas import TradeContext, LiquidityVerdict

ROLE = "specialist"
MAX_TOKENS = 500

SYSTEM_PROMPT = system_prompt(
    "You are FillScore's Liquidity Scout agent. You audit the liquidity conditions of a "
    "trader's past executions using the provided LiquidityMetricsPacket.\n\n"
    "Return ONLY valid JSON matching this schema — no prose, no markdown fences, "
    "no preamble:\n"
    "{\n"
    '  "agent": "liquidity_scout",\n'
    '  "liquidityRating": "GOOD" | "MODERATE" | "POOR" | "CRITICAL",\n'
    '  "slippageRoot": string (max 100 chars, past-tense root cause citing packet keys, no invented numbers),\n'
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


def build_user_prompt(context: TradeContext, packet: LiquidityMetricsPacket) -> str:
    return f"""LiquidityMetricsPacket:
{json.dumps(packet.to_prompt_dict(), indent=2)}

Regime: {context.regime}

Assign liquidityRating, write slippageRoot citing packet keys, list cited_evidence keys.
Schema: liquidityRating (GOOD/MODERATE/POOR/CRITICAL), slippageRoot (str), cited_evidence (list[str]), severity (LOW/MEDIUM/HIGH/CRITICAL), confidence (0-1), flags (list[str])"""


async def run(context: TradeContext, llm, packet: LiquidityMetricsPacket, telemetry: list | None = None) -> LiquidityVerdict:
    """Run the agent through the router; raises if no model produced a valid verdict."""
    return await llm.complete(
        ROLE,
        SYSTEM_PROMPT,
        build_user_prompt(context, packet),
        LiquidityVerdict,
        max_tokens=MAX_TOKENS,
        temperature=0.1,
        telemetry=telemetry,
    )

"""Alpha Architect — specialist agent for benchmark-relative execution quality.

Audits past executions from the deterministic AlphaMetricsPacket. The model is chosen by the router
(config/llm_routes.yaml, role "specialist").
"""

from __future__ import annotations

import json

from agents.metrics.alpha_packet import AlphaMetricsPacket
from agents.prompts import system_prompt
from agents.schemas import TradeContext, AlphaVerdict

ROLE = "specialist"
MAX_TOKENS = 500

SYSTEM_PROMPT = system_prompt(
    "You are FillScore's Alpha Architect agent. You audit whether a trader's past "
    "executions captured or leaked value relative to the packet's benchmarks.\n\n"
    "Return ONLY valid JSON matching this schema — no prose, no markdown fences, "
    "no preamble:\n"
    "{\n"
    '  "agent": "alpha_architect",\n'
    '  "alphaRating": "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "SEVERELY_NEGATIVE",\n'
    '  "bestAlternative": string (past tense: which benchmark in the packet these executions compared best or worst against, citing packet keys),\n'
    '  "cited_evidence": [string] (keys from the packet that support this verdict),\n'
    '  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",\n'
    '  "confidence": float (0-1),\n'
    '  "flags": [string]\n'
    "}\n"
)


def build_user_prompt(context: TradeContext, packet: AlphaMetricsPacket) -> str:
    return f"""AlphaMetricsPacket:
{json.dumps(packet.to_prompt_dict(), indent=2)}

Regime: {context.regime}

Assign alphaRating, write bestAlternative, list cited_evidence keys.
Schema: alphaRating (POSITIVE/NEUTRAL/NEGATIVE/SEVERELY_NEGATIVE), bestAlternative (str), cited_evidence (list[str]), severity (LOW/MEDIUM/HIGH/CRITICAL), confidence (0-1), flags (list[str])"""


async def run(context: TradeContext, llm, packet: AlphaMetricsPacket, telemetry: list | None = None) -> AlphaVerdict:
    """Run the agent through the router; raises if no model produced a valid verdict."""
    return await llm.complete(
        ROLE,
        SYSTEM_PROMPT,
        build_user_prompt(context, packet),
        AlphaVerdict,
        max_tokens=MAX_TOKENS,
        temperature=0.1,
        telemetry=telemetry,
    )

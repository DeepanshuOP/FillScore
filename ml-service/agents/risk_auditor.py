"""Risk Auditor — specialist agent for concentration and adverse-selection risk.

Audits past executions from the deterministic RiskMetricsPacket. The model is chosen by the router
(config/llm_routes.yaml, role "specialist").
"""

from __future__ import annotations

import json

from agents.metrics.risk_packet import RiskMetricsPacket
from agents.prompts import system_prompt
from agents.schemas import TradeContext, RiskVerdict

ROLE = "specialist"
MAX_TOKENS = 500

SYSTEM_PROMPT = system_prompt(
    "You are FillScore's Risk Auditor agent. You audit the concentration risk and "
    "adverse selection exposure of a trader's past executions.\n\n"
    "Return ONLY valid JSON matching this schema — no prose, no markdown fences, "
    "no preamble:\n"
    "{\n"
    '  "agent": "risk_auditor",\n'
    '  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",\n'
    '  "cited_evidence": [string] (keys from the packet that support this verdict),\n'
    '  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",\n'
    '  "confidence": float (0-1),\n'
    '  "flags": [string]\n'
    "}\n"
)


def build_user_prompt(context: TradeContext, packet: RiskMetricsPacket) -> str:
    return f"""RiskMetricsPacket:
{json.dumps(packet.to_prompt_dict(), indent=2)}

Regime: {context.regime}

Assign riskLevel, list cited_evidence keys.
Schema: riskLevel (LOW/MEDIUM/HIGH/CRITICAL), cited_evidence (list[str]), severity (LOW/MEDIUM/HIGH/CRITICAL), confidence (0-1), flags (list[str])"""


async def run(context: TradeContext, llm, packet: RiskMetricsPacket, telemetry: list | None = None) -> RiskVerdict:
    """Run the agent through the router; raises if no model produced a valid verdict."""
    return await llm.complete(
        ROLE,
        SYSTEM_PROMPT,
        build_user_prompt(context, packet),
        RiskVerdict,
        max_tokens=MAX_TOKENS,
        temperature=0.1,
        telemetry=telemetry,
    )

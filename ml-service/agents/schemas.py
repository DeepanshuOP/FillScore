"""
Agent Council schemas — Pydantic v2.
Specialist verdicts are LABEL-ONLY: agents cite evidence keys,
never originate numeric values. All numbers come from MetricsPackets.
"""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Literal, Optional


# ── Specialist verdict schemas (label-only after AC-3 wiring) ────────────────

class LiquidityVerdict(BaseModel):
    agent: str = "liquidity_scout"
    liquidityRating: Literal["GOOD", "MODERATE", "POOR", "CRITICAL"]
    slippageRoot: str = Field(description="One-sentence root cause citing packet keys, no invented numbers")
    cited_evidence: list[str] = Field(
        default_factory=list,
        description="Keys from the liquidity packet that support this verdict (e.g. 'avg_slippage_bps', 'worst5_trade_ids')"
    )
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    confidence: float = Field(ge=0.0, le=1.0)
    flags: list[str] = Field(default_factory=list)


class AlphaVerdict(BaseModel):
    agent: str = "alpha_architect"
    alphaRating: Literal["POSITIVE", "NEUTRAL", "NEGATIVE", "SEVERELY_NEGATIVE"]
    bestAlternative: str = Field(description="Recommended execution alternative, e.g. 'VWAP or passive limit'")
    cited_evidence: list[str] = Field(
        default_factory=list,
        description="Keys from the alpha packet that support this verdict"
    )
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    confidence: float = Field(ge=0.0, le=1.0)
    flags: list[str] = Field(default_factory=list)


class RiskVerdict(BaseModel):
    agent: str = "risk_auditor"
    riskLevel: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    cited_evidence: list[str] = Field(
        default_factory=list,
        description="Keys from the risk packet that support this verdict"
    )
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    confidence: float = Field(ge=0.0, le=1.0)
    flags: list[str] = Field(default_factory=list)


class FeeVerdict(BaseModel):
    agent: str = "fee_optimizer"
    feeRating: Literal["OPTIMAL", "MODERATE", "WASTEFUL", "SEVERELY_WASTEFUL"]
    recommendedAction: str = Field(description="Specific action, e.g. 'Switch to limit orders on BTC'")
    cited_evidence: list[str] = Field(
        default_factory=list,
        description="Keys from the fee packet that support this verdict"
    )
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    confidence: float = Field(ge=0.0, le=1.0)
    flags: list[str] = Field(default_factory=list)


# ── Synthesis output ──────────────────────────────────────────────────────────

class ConflictEntry(BaseModel):
    between: str
    rule_applied: str
    winner: str


class SynthesisOutput(BaseModel):
    headline: str = Field(description="One sentence summary, max 20 words")
    narrative: str = Field(description="2-3 sentence explanation using only numbers from the injected packet data")
    topRecommendations: list[str] = Field(
        description="Exactly 3 specific, actionable recommendations",
        min_length=3,
        max_length=3,
    )
    conflictLedger: list[ConflictEntry] = Field(
        default_factory=list,
        description="Structured record of any agent conflicts resolved"
    )
    overallRating: Literal["EXCELLENT", "GOOD", "FAIR", "POOR", "CRITICAL"]
    estimatedMonthlyCostUSD: float = Field(
        description="Read directly from fee_packet.total_fee_paid_usd scaled to monthly — do not estimate"
    )


# ── Full council result ───────────────────────────────────────────────────────

class TradeContext(BaseModel):
    """Thin context passed to each agent alongside their MetricsPacket."""
    userId: str
    symbol: str
    regime: str = "STABLE"
    # packet hashes for integrity verification
    fee_packet_hash: str = ""
    risk_packet_hash: str = ""
    liquidity_packet_hash: str = ""
    alpha_packet_hash: str = ""


class CouncilResult(BaseModel):
    tradeContext: TradeContext
    liquidity: LiquidityVerdict
    alpha: AlphaVerdict
    risk: RiskVerdict
    fee: FeeVerdict
    synthesis: SynthesisOutput
    totalLatencyMs: float
    modelUsage: dict

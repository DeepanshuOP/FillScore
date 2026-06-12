"""
Verification Gate — pure Python, no LLM.
Checks every synthesis recommendation against the MetricsPackets.
Paper contribution (3): deterministic counterfactual verification.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal
import re

ACTION_TAXONOMY = {
    "increase_maker_ratio": {
        "keywords": ["limit order", "maker", "passive", "post-only"],
        "packet_key": "savings_at_080_usd",
    },
    "avoid_bad_hours": {
        "keywords": ["hour", "utc", "time", "session", "trading time"],
        "packet_key": "worst_hour_utc",
    },
    "reduce_concentration": {
        "keywords": ["diversif", "concentration", "hhi", "symbol", "spread across"],
        "packet_key": "symbol_hhi",
    },
    "avoid_whale_windows": {
        "keywords": ["whale", "adverse", "large order", "sweep"],
        "packet_key": "adverse_rate",
    },
    "use_vwap": {
        "keywords": ["vwap", "twap", "benchmark", "algorithmic", "algo"],
        "packet_key": "avg_vwap_deviation_bps",
    },
    "reduce_size": {
        "keywords": ["size", "smaller", "split", "slice", "reduce position"],
        "packet_key": "p90_trade_usd",
    },
    "general_improvement": {
        "keywords": [],
        "packet_key": None,
    },
}

CONTRADICTION_PAIRS = [
    ("increase_maker_ratio", "use_vwap"),
]


@dataclass
class RecommendationVerdict:
    recommendation_text: str
    action_type: str
    passed: bool
    failure_reasons: list[str] = field(default_factory=list)
    counterfactual_value: float = 0.0
    counterfactual_key: str = ""
    dropped: bool = False


@dataclass
class GateReport:
    total_recommendations: int
    passed_count: int
    failed_count: int
    dropped_count: int
    verdicts: list[RecommendationVerdict]
    contradiction_flags: list[str]
    gate_passed: bool


def _classify_action(text: str) -> str:
    text_lower = text.lower()
    best_match = "general_improvement"
    best_score = 0
    for action_type, config in ACTION_TAXONOMY.items():
        if action_type == "general_improvement":
            continue
        score = sum(1 for kw in config["keywords"] if kw in text_lower)
        if score > best_score:
            best_score = score
            best_match = action_type
    return best_match


def _get_counterfactual_value(
    action_type: str,
    fee_packet: dict,
    risk_packet: dict,
    liquidity_packet: dict,
    alpha_packet: dict,
) -> tuple[float, str]:
    config = ACTION_TAXONOMY.get(action_type, {})
    packet_key = config.get("packet_key")
    if packet_key is None:
        return 0.0, "none"

    packet_sources = {
        "savings_at_080_usd": fee_packet,
        "savings_at_050_usd": fee_packet,
        "worst_hour_utc": liquidity_packet,
        "symbol_hhi": risk_packet,
        "adverse_rate": risk_packet,
        "avg_vwap_deviation_bps": alpha_packet,
        "p90_trade_usd": risk_packet,
    }
    source = packet_sources.get(packet_key, {})
    value = source.get(packet_key, 0.0)
    return float(value), packet_key


def _check_contradiction(action_types: list[str]) -> list[str]:
    flags = []
    for a, b in CONTRADICTION_PAIRS:
        if a in action_types and b in action_types:
            flags.append(f"Potential conflict: '{a}' and '{b}' both recommended")
    return flags


def verify_recommendations(
    recommendations: list[str],
    fee_packet: dict,
    risk_packet: dict,
    liquidity_packet: dict,
    alpha_packet: dict,
) -> GateReport:
    verdicts = []
    action_types = []

    for rec_text in recommendations:
        action_type = _classify_action(rec_text)
        action_types.append(action_type)
        failure_reasons = []

        if not rec_text or len(rec_text.strip()) < 10:
            failure_reasons.append("Recommendation text too short or empty")

        cf_value, cf_key = _get_counterfactual_value(
            action_type, fee_packet, risk_packet, liquidity_packet, alpha_packet
        )

        config = ACTION_TAXONOMY.get(action_type, {})
        packet_key = config.get("packet_key")
        if packet_key and packet_key != "none":
            packet_sources = {
                "savings_at_080_usd": fee_packet,
                "savings_at_050_usd": fee_packet,
                "worst_hour_utc": liquidity_packet,
                "symbol_hhi": risk_packet,
                "adverse_rate": risk_packet,
                "avg_vwap_deviation_bps": alpha_packet,
                "p90_trade_usd": risk_packet,
            }
            source = packet_sources.get(packet_key, {})
            if packet_key not in source and packet_key != "worst_hour_utc":
                failure_reasons.append(
                    f"Packet key '{packet_key}' not found — recommendation may be ungrounded"
                )

        passed = len(failure_reasons) == 0
        verdicts.append(RecommendationVerdict(
            recommendation_text=rec_text,
            action_type=action_type,
            passed=passed,
            failure_reasons=failure_reasons,
            counterfactual_value=cf_value,
            counterfactual_key=cf_key,
        ))

    contradiction_flags = _check_contradiction(action_types)
    passed_count = sum(1 for v in verdicts if v.passed)
    failed_count = sum(1 for v in verdicts if not v.passed)
    dropped_count = sum(1 for v in verdicts if v.dropped)

    return GateReport(
        total_recommendations=len(recommendations),
        passed_count=passed_count,
        failed_count=failed_count,
        dropped_count=dropped_count,
        verdicts=verdicts,
        contradiction_flags=contradiction_flags,
        gate_passed=passed_count > 0,
    )


def gate_report_to_dict(report: GateReport) -> dict:
    return {
        "total_recommendations": report.total_recommendations,
        "passed_count": report.passed_count,
        "failed_count": report.failed_count,
        "dropped_count": report.dropped_count,
        "gate_passed": report.gate_passed,
        "contradiction_flags": report.contradiction_flags,
        "verdicts": [
            {
                "text": v.recommendation_text[:100],
                "action_type": v.action_type,
                "passed": v.passed,
                "failure_reasons": v.failure_reasons,
                "counterfactual_value": v.counterfactual_value,
                "counterfactual_key": v.counterfactual_key,
                "dropped": v.dropped,
            }
            for v in report.verdicts
        ],
    }

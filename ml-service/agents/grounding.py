"""
Grounding contract enforcement for FillScore Agent Council.
Implements paper metric E1: faithfulness of LLM verdicts to MetricsPackets.

Two checks:
  A) Evidence-key validation: every key in cited_evidence must exist in the packet
  B) Faithfulness check: numeric tokens in reasoning text must appear in the packet

These are the measurements that make the paper's "verified numbers" claim defensible.
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class GroundingReport:
    """Result of grounding checks on one specialist verdict."""
    agent: str
    # Evidence key validation
    cited_keys: list[str]
    valid_keys: list[str]       # cited keys that exist in packet
    invalid_keys: list[str]     # cited keys that do NOT exist in packet — violations
    key_validity_score: float   # len(valid) / len(cited) if cited else 1.0

    # Faithfulness check (numeric tokens)
    numeric_tokens_found: list[str]    # all numbers extracted from reasoning text
    grounded_tokens: list[str]         # numbers that appear in packet values
    ungrounded_tokens: list[str]       # numbers NOT in packet — potential hallucinations
    faithfulness_score: float          # len(grounded) / len(found) if found else 1.0

    # Combined
    overall_grounding_score: float     # mean of key_validity_score and faithfulness_score
    has_violations: bool               # True if any invalid key or ungrounded numeral


def _extract_numeric_tokens(text: str) -> list[str]:
    """
    Extract numeric tokens from text (integers and decimals).
    Returns them as strings to preserve exact formatting for matching.
    Filters out single-digit integers (0-9) to reduce noise from ordinals.
    """
    pattern = r'\b\d+\.?\d*\b'
    tokens = re.findall(pattern, text)
    # Filter single digits and years (4-digit numbers > 2000) to reduce noise
    filtered = []
    for t in tokens:
        try:
            val = float(t)
            is_single_digit_int = t.isdigit() and len(t) == 1
            is_year = 1900 <= val <= 2100 and t.isdigit() and len(t) == 4
            if not is_single_digit_int and not is_year:
                filtered.append(t)
        except ValueError:
            pass
    return filtered


def _packet_numeric_values(packet_dict: dict[str, Any]) -> set[str]:
    """
    Extract all numeric values from a packet dict as strings.
    Handles nested dicts and lists.
    """
    values = set()

    def _recurse(obj):
        if isinstance(obj, (int, float)):
            # Add both the raw value and rounded versions
            values.add(str(obj))
            values.add(str(round(obj, 1)))
            values.add(str(round(obj, 2)))
            values.add(str(round(obj, 4)))
            values.add(str(int(obj)) if obj == int(obj) else str(obj))
        elif isinstance(obj, dict):
            for v in obj.values():
                _recurse(v)
        elif isinstance(obj, list):
            for item in obj:
                _recurse(item)

    _recurse(packet_dict)
    return values


def check_grounding(
    agent_name: str,
    cited_evidence: list[str],
    reasoning_text: str,
    packet_dict: dict[str, Any],
) -> GroundingReport:
    """
    Check whether a specialist verdict is grounded in its MetricsPacket.

    Args:
        agent_name: name of the specialist (for reporting)
        cited_evidence: list of packet keys the agent cited
        reasoning_text: the agent's reasoning string (slippageRoot, recommendedAction, etc.)
        packet_dict: the to_prompt_dict() output for this agent's packet

    Returns:
        GroundingReport with validity and faithfulness scores
    """
    packet_keys = set(packet_dict.keys())

    # ── A: evidence key validation ────────────────────────────────────────────
    valid_keys = [k for k in cited_evidence if k in packet_keys]
    invalid_keys = [k for k in cited_evidence if k not in packet_keys]
    key_score = len(valid_keys) / len(cited_evidence) if cited_evidence else 1.0

    # ── B: faithfulness check ────────────────────────────────────────────────
    numeric_tokens = _extract_numeric_tokens(reasoning_text)
    packet_values = _packet_numeric_values(packet_dict)

    grounded = [t for t in numeric_tokens if t in packet_values]
    ungrounded = [t for t in numeric_tokens if t not in packet_values]
    faith_score = len(grounded) / len(numeric_tokens) if numeric_tokens else 1.0

    overall = (key_score + faith_score) / 2.0
    has_violations = len(invalid_keys) > 0 or len(ungrounded) > 0

    return GroundingReport(
        agent=agent_name,
        cited_keys=cited_evidence,
        valid_keys=valid_keys,
        invalid_keys=invalid_keys,
        key_validity_score=round(key_score, 4),
        numeric_tokens_found=numeric_tokens,
        grounded_tokens=grounded,
        ungrounded_tokens=ungrounded,
        faithfulness_score=round(faith_score, 4),
        overall_grounding_score=round(overall, 4),
        has_violations=has_violations,
    )


def check_all_verdicts(
    liquidity_cited: list[str],
    liquidity_reasoning: str,
    liquidity_packet: dict,
    alpha_cited: list[str],
    alpha_reasoning: str,
    alpha_packet: dict,
    risk_cited: list[str],
    risk_reasoning: str,
    risk_packet: dict,
    fee_cited: list[str],
    fee_reasoning: str,
    fee_packet: dict,
) -> dict[str, GroundingReport]:
    """Run grounding checks on all four specialist verdicts. Returns dict keyed by agent name."""
    return {
        "liquidity_scout": check_grounding(
            "liquidity_scout", liquidity_cited, liquidity_reasoning, liquidity_packet
        ),
        "alpha_architect": check_grounding(
            "alpha_architect", alpha_cited, alpha_reasoning, alpha_packet
        ),
        "risk_auditor": check_grounding(
            "risk_auditor", risk_cited, risk_reasoning, risk_packet
        ),
        "fee_optimizer": check_grounding(
            "fee_optimizer", fee_cited, fee_reasoning, fee_packet
        ),
    }


def summarise_grounding(reports: dict[str, GroundingReport]) -> dict:
    """
    Aggregate grounding reports into a summary suitable for logging
    and for the paper's E1 table.
    """
    if not reports:
        return {}

    avg_faith = sum(r.faithfulness_score for r in reports.values()) / len(reports)
    avg_key = sum(r.key_validity_score for r in reports.values()) / len(reports)
    total_violations = sum(
        len(r.invalid_keys) + len(r.ungrounded_tokens) for r in reports.values()
    )
    any_violations = any(r.has_violations for r in reports.values())

    return {
        "avg_faithfulness_score": round(avg_faith, 4),
        "avg_key_validity_score": round(avg_key, 4),
        "total_violations": total_violations,
        "any_violations": any_violations,
        "per_agent": {
            name: {
                "faithfulness_score": r.faithfulness_score,
                "key_validity_score": r.key_validity_score,
                "invalid_keys": r.invalid_keys,
                "ungrounded_tokens": r.ungrounded_tokens,
                "overall_grounding_score": r.overall_grounding_score,
            }
            for name, r in reports.items()
        },
    }

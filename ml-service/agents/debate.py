"""
Execution Trial Debate — Prosecution vs Defense.
Paper contribution (2): adversarial execution-attribution debate.

Question: "Was this user's execution negligent or reasonable given
the market they actually faced?"

Prosecutor: argues costs were avoidable (worst trades, taker streaks,
  bad-hour clusters, high maker-ratio opportunity cost).
Defense: argues mitigation (whale adversity was exogenous per
  Cont-Kukanov-Stoikov order-flow theory, negative-slippage fills,
  regime constraints, market conditions).

Bounded at MAX_ROUNDS=2. Each side emits structured claims with
evidence keys — no free-form essays.
"""
from __future__ import annotations
import json, time
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from agents.prompts import UNTRUSTED_NOTE, system_prompt, untrusted


MAX_ROUNDS = 2   # each side speaks at most MAX_ROUNDS times
_clock = time.perf_counter


@dataclass
class DebateClaim:
    """One structured claim from Prosecutor or Defense."""
    side: Literal["prosecution", "defense"]
    claim_id: str                      # "P1", "P2", "D1", "D2"
    claim_text: str                    # one sentence, max 40 words
    evidence_keys: list[str]           # packet keys that support this claim
    rebuts: str | None = None          # claim_id this rebuts, or None


@dataclass
class DebateState:
    """First-class typed state (TradingAgents pattern, adapted for TCA)."""
    prosecution_claims: list[DebateClaim] = field(default_factory=list)
    defense_claims: list[DebateClaim] = field(default_factory=list)
    all_claims: list[DebateClaim] = field(default_factory=list)
    round_count: int = 0
    latest_speaker: Literal["prosecution", "defense", "none"] = "none"
    judge_summary: str = ""            # filled after debate ends


@dataclass
class DebateTranscript:
    """Full debate result passed to synthesis."""
    claims: list[DebateClaim]
    round_count: int
    prosecution_summary: str           # 1-2 sentence summary of prosecution case
    defense_summary: str               # 1-2 sentence summary of defense case
    key_dispute: str                   # the core disagreement in one sentence
    debate_latency_ms: float
    turns_expected: int = 2 * MAX_ROUNDS
    turns_ok: int = 0
    failed_turns: list[str] = field(default_factory=list)   # e.g. ["prosecution round 1"]


class _ClaimOut(BaseModel):
    claim_id: str = ""
    claim_text: str
    evidence_keys: list[str] = Field(default_factory=list)
    rebuts: Optional[str] = None


class ProsecutionTurn(BaseModel):
    claims: list[_ClaimOut] = Field(min_length=1)
    prosecution_summary: str


class DefenseTurn(BaseModel):
    claims: list[_ClaimOut] = Field(min_length=1)
    defense_summary: str


PROSECUTION_SYSTEM = system_prompt("You are the prosecution in an execution quality audit. " + UNTRUSTED_NOTE + " Respond only with valid JSON.")
DEFENSE_SYSTEM = system_prompt("You are the defense in an execution quality audit. " + UNTRUSTED_NOTE + " Respond only with valid JSON.")
ROLE = "debate"
MAX_TOKENS = 600


def _claims_block(claims: list["DebateClaim"], source: str) -> str:
    """Claims from the other side, wrapped as untrusted data (F-28)."""
    return untrusted(
        "\n".join(f"[{c.claim_id}] {c.claim_text} (evidence: {c.evidence_keys})" for c in claims),
        source,
    )


def _prosecution_prompt(
    liquidity_packet: dict,
    risk_packet: dict,
    fee_packet: dict,
    alpha_packet: dict,
    defense_claims: list[DebateClaim],
    round_num: int,
) -> str:
    defense_text = ""
    if defense_claims:
        defense_text = "\n\nDefense claims to rebut:\n" + _claims_block(defense_claims, "defense")

    return f"""You are the PROSECUTION in an audit of past executions.
Question: Were this trader's past execution costs avoidable, given the packets below?

Your job: Build the strongest case that costs were avoidable, citing specific packet values.

Evidence available:
FEE PACKET: {json.dumps(fee_packet, indent=2)}
RISK PACKET: {json.dumps(risk_packet, indent=2)}
LIQUIDITY PACKET: {json.dumps(liquidity_packet, indent=2)}
ALPHA PACKET: {json.dumps(alpha_packet, indent=2)}
{defense_text}

Round {round_num} of {MAX_ROUNDS}. You must respond with EXACTLY this JSON structure and nothing else:
{{
  "claims": [
    {{
      "claim_id": "P{round_num}a",
      "claim_text": "One sentence, max 40 words, citing a specific packet value",
      "evidence_keys": ["packet_key_1", "packet_key_2"],
      "rebuts": null
    }}
  ],
  "prosecution_summary": "1-2 sentences summarising your strongest arguments"
}}

Rules:
- Each claim must cite at least one evidence_key from the packets above
- claim_text must reference specific numbers from the packets (e.g. "maker_ratio of 0.22")
- Maximum 2 claims per round
- rebuts should be a Defense claim_id (e.g. "D1") if you are rebutting, else null
- Respond ONLY with valid JSON. No preamble."""


def _defense_prompt(
    liquidity_packet: dict,
    risk_packet: dict,
    fee_packet: dict,
    alpha_packet: dict,
    prosecution_claims: list[DebateClaim],
    round_num: int,
) -> str:
    prosecution_text = "\n\nProsecution claims to rebut:\n" + _claims_block(prosecution_claims, "prosecution")

    return f"""You are the DEFENSE in an audit of past executions.
Question: Were this trader's past executions reasonable given the market they actually faced?

Your job: Build the strongest mitigating case. Key defense arguments:
1. Whale adversity was exogenous (Cont-Kukanov-Stoikov: large order flow causes unavoidable adverse selection)
2. Negative slippage fills show the trader sometimes got BETTER than arrival price
3. Regime constraints (STABLE regime means different benchmarks apply)
4. Some costs are market-structure costs, not execution errors

Evidence available:
FEE PACKET: {json.dumps(fee_packet, indent=2)}
RISK PACKET: {json.dumps(risk_packet, indent=2)}
LIQUIDITY PACKET: {json.dumps(liquidity_packet, indent=2)}
ALPHA PACKET: {json.dumps(alpha_packet, indent=2)}
{prosecution_text}

Round {round_num} of {MAX_ROUNDS}. You must respond with EXACTLY this JSON structure and nothing else:
{{
  "claims": [
    {{
      "claim_id": "D{round_num}a",
      "claim_text": "One sentence, max 40 words, citing a specific packet value",
      "evidence_keys": ["packet_key_1", "packet_key_2"],
      "rebuts": "P1a"
    }}
  ],
  "defense_summary": "1-2 sentences summarising your strongest mitigating arguments"
}}

Rules:
- Each claim must cite at least one evidence_key from the packets
- rebuts must be a valid prosecution claim_id (e.g. "P1a") whenever you are directly countering
- Maximum 2 claims per round
- Respond ONLY with valid JSON. No preamble."""


def _parse_claims(raw: dict, side: Literal["prosecution", "defense"]) -> list[DebateClaim]:
    """Parse LLM output into DebateClaims. Gracefully handles missing fields."""
    claims = []
    for item in raw.get("claims", []):
        try:
            claims.append(DebateClaim(
                side=side,
                claim_id=str(item.get("claim_id", f"{side[0].upper()}?")),
                claim_text=str(item.get("claim_text", ""))[:200],
                evidence_keys=[str(k) for k in item.get("evidence_keys", [])],
                rebuts=item.get("rebuts"),
            ))
        except Exception:
            continue
    return claims


async def run_debate(
    liquidity_packet: dict,
    risk_packet: dict,
    fee_packet: dict,
    alpha_packet: dict,
    llm,
    telemetry: list | None = None,
) -> DebateTranscript:
    """
    Run the Execution Trial debate through the router (role "debate").
    Never raises. Stops at the first failed turn, because a run with a failed turn is degraded
    and further calls would be wasted. round_count counts only rounds where both sides answered.
    """
    start = _clock()
    state = DebateState()
    prosecution_summary = "Prosecution unavailable"
    defense_summary = "Defense unavailable"
    turns_ok = 0
    failed: list[str] = []

    for round_num in range(1, MAX_ROUNDS + 1):
        try:
            p_prompt = _prosecution_prompt(
                liquidity_packet, risk_packet, fee_packet, alpha_packet,
                state.defense_claims, round_num
            )
            p_out = await llm.complete(ROLE, PROSECUTION_SYSTEM, p_prompt, ProsecutionTurn,
                                       max_tokens=MAX_TOKENS, temperature=0.3, telemetry=telemetry)
            new_claims = _parse_claims(p_out.model_dump(), "prosecution")
            state.prosecution_claims.extend(new_claims)
            state.all_claims.extend(new_claims)
            prosecution_summary = p_out.prosecution_summary
            state.latest_speaker = "prosecution"
            turns_ok += 1
        except Exception as e:
            print(f"[debate] Prosecution round {round_num} failed: {type(e).__name__}")
            failed.append(f"prosecution round {round_num}")
            break

        try:
            d_prompt = _defense_prompt(
                liquidity_packet, risk_packet, fee_packet, alpha_packet,
                state.prosecution_claims, round_num
            )
            d_out = await llm.complete(ROLE, DEFENSE_SYSTEM, d_prompt, DefenseTurn,
                                       max_tokens=MAX_TOKENS, temperature=0.3, telemetry=telemetry)
            new_claims = _parse_claims(d_out.model_dump(), "defense")
            state.defense_claims.extend(new_claims)
            state.all_claims.extend(new_claims)
            defense_summary = d_out.defense_summary
            state.latest_speaker = "defense"
            turns_ok += 1
        except Exception as e:
            print(f"[debate] Defense round {round_num} failed: {type(e).__name__}")
            failed.append(f"defense round {round_num}")
            break

        state.round_count = round_num

    # ── Derive key dispute ─────────────────────────────────────────────────
    if state.prosecution_claims and state.defense_claims:
        key_dispute = (
            f"Prosecution argues {state.prosecution_claims[0].claim_text[:60]}… "
            f"Defense counters {state.defense_claims[0].claim_text[:60]}…"
        )
    else:
        key_dispute = "Debate inconclusive — insufficient evidence from both sides"

    latency = (_clock() - start) * 1000
    return DebateTranscript(
        claims=state.all_claims,
        round_count=state.round_count,
        prosecution_summary=prosecution_summary,
        defense_summary=defense_summary,
        key_dispute=key_dispute,
        debate_latency_ms=round(latency, 2),
        turns_expected=2 * MAX_ROUNDS,
        turns_ok=turns_ok,
        failed_turns=failed,
    )


def transcript_to_dict(transcript: DebateTranscript) -> dict:
    """Serialise DebateTranscript for logging, API response, and paper artifacts."""
    return {
        "round_count": transcript.round_count,
        "prosecution_summary": transcript.prosecution_summary,
        "defense_summary": transcript.defense_summary,
        "key_dispute": transcript.key_dispute,
        "debate_latency_ms": transcript.debate_latency_ms,
        "turns_expected": transcript.turns_expected,
        "turns_ok": transcript.turns_ok,
        "failed_turns": list(transcript.failed_turns),
        "claims": [
            {
                "side": c.side,
                "claim_id": c.claim_id,
                "claim_text": c.claim_text,
                "evidence_keys": c.evidence_keys,
                "rebuts": c.rebuts,
            }
            for c in transcript.claims
        ],
    }

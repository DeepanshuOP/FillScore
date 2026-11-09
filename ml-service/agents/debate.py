"""
Execution Trial Debate — Prosecution vs Defense.
Paper contribution (2): adversarial execution-attribution debate.

Question: "Was this user's execution negligent or reasonable given
the market they actually faced?"

Prosecutor: argues costs were avoidable (worst trades, taker streaks,
  bad-hour clusters, high maker-ratio opportunity cost).
Defense: argues mitigation (whale adversity was exogenous per
  Cont-Kukanov-Stoikov order-flow theory, negative-slippage fills,
  market conditions).

Bounded at MAX_ROUNDS=2. Each side emits structured claims with
evidence keys — no free-form essays. Values appear only as {{ns.key}} placeholders; every claim and
summary is grounded (agents.grounded_call) and the other side sees the rendered text (Phase 1c.3).
"""
from __future__ import annotations
import time
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from agents.grounded_call import finalized, grounded_model
from agents.grounding import GroundingFailed, GroundingLedger, check
from agents.prompts import UNTRUSTED_NOTE, packet_values, system_prompt, untrusted


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


NAMESPACES = ["fee", "risk", "liquidity", "alpha"]


def _ctx(liquidity_packet: dict, risk_packet: dict, fee_packet: dict, alpha_packet: dict) -> dict:
    return {"fee": fee_packet, "risk": risk_packet, "liquidity": liquidity_packet, "alpha": alpha_packet}


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

Your job: Build the strongest case that costs were avoidable, citing packet values by placeholder.

Evidence available:
{packet_values(_ctx(liquidity_packet, risk_packet, fee_packet, alpha_packet), NAMESPACES)}
{defense_text}

Round {round_num} of {MAX_ROUNDS}. You must respond with EXACTLY this JSON structure and nothing else:
{{
  "claims": [
    {{
      "claim_id": "P{round_num}a",
      "claim_text": "One sentence, max 40 words, citing a packet value by its placeholder",
      "evidence_keys": ["packet_key_1", "packet_key_2"],
      "rebuts": null
    }}
  ],
  "prosecution_summary": "1-2 sentences summarising your strongest arguments"
}}

Rules:
- Each claim must cite at least one evidence_key from the packets above
- claim_text must cite packet values by placeholder (e.g. "a maker ratio of {{{{fee.maker_ratio}}}}"), never as digits
- Write counts as "{{{{fee.taker_count}}}} market orders", never "68 market orders"
- Never write a value next to its placeholder: "{{{{fee.fee_drag_bps}}}}", not "10.0 bps {{{{fee.fee_drag_bps}}}}"
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
3. Some costs are market-structure costs, not execution errors

Evidence available:
{packet_values(_ctx(liquidity_packet, risk_packet, fee_packet, alpha_packet), NAMESPACES)}
{prosecution_text}

Round {round_num} of {MAX_ROUNDS}. You must respond with EXACTLY this JSON structure and nothing else:
{{
  "claims": [
    {{
      "claim_id": "D{round_num}a",
      "claim_text": "One sentence, max 40 words, citing a packet value by its placeholder",
      "evidence_keys": ["packet_key_1", "packet_key_2"],
      "rebuts": "P1a"
    }}
  ],
  "defense_summary": "1-2 sentences summarising your strongest mitigating arguments"
}}

Rules:
- Each claim must cite at least one evidence_key from the packets
- claim_text must cite packet values by placeholder (e.g. "an adverse rate of {{{{risk.adverse_rate}}}}"), never as digits
- Write counts as "{{{{fee.taker_count}}}} market orders", never "68 market orders"
- Never write a value next to its placeholder: "{{{{fee.fee_drag_bps}}}}", not "10.0 bps {{{{fee.fee_drag_bps}}}}"
- rebuts must be a valid prosecution claim_id (e.g. "P1a") whenever you are directly countering
- Maximum 2 claims per round
- Respond ONLY with valid JSON. No preamble."""


def _parse_claims(raw: dict, side: Literal["prosecution", "defense"], max_len: int | None = 200) -> list[DebateClaim]:
    """Parse LLM output into DebateClaims. Gracefully handles missing fields. Rendered text is parsed
    with max_len=None: cutting it could cut a rendered number in half."""
    claims = []
    for item in raw.get("claims", []):
        try:
            claims.append(DebateClaim(
                side=side,
                claim_id=str(item.get("claim_id", f"{side[0].upper()}?")),
                claim_text=str(item.get("claim_text", ""))[:max_len],
                evidence_keys=[str(k) for k in item.get("evidence_keys", [])],
                rebuts=item.get("rebuts"),
            ))
        except Exception:
            continue
    return claims


def _letters(i: int) -> str:
    """0 -> a, 1 -> b, ... 25 -> z, 26 -> aa."""
    out = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        out = chr(97 + r) + out
    return out


# Code-built neutral sentences for a debate field emptied by redaction (2c.A3). Placeholders only, no digits,
# no cause, no counterfactual. Tried in order; the first whose placeholders all exist and render is used.
_FALLBACKS = {
    "prosecution": [
        ("Taker orders were {{fee.taker_count}} of {{fee.trade_count}} trades.",
         ["taker_count", "trade_count"]),
        ("Fee drag was {{fee.fee_drag_bps}}.", ["fee_drag_bps"]),
        ("Market orders numbered {{liquidity.market_order_count}}.", ["market_order_count"]),
    ],
    "defense": [
        ("Maker orders were {{fee.maker_count}} of {{fee.trade_count}} trades.",
         ["maker_count", "trade_count"]),
        ("Negative slippage appeared in {{liquidity.pct_negative_slippage}} of market orders.",
         ["pct_negative_slippage"]),
        ("Average slippage was {{liquidity.avg_slippage_bps}}.", ["avg_slippage_bps"]),
    ],
}


def fallback_text(side: str, ctx: dict) -> tuple[str, list[str]]:
    """The first fallback sentence for `side` that renders against ctx, with its evidence keys.
    GroundingFailed if none does."""
    for tpl, keys in _FALLBACKS[side]:
        c = check(tpl, ctx)
        if not c.violations:
            return c.rendered, keys
    raise GroundingFailed(side, "fallback")


async def _grounded_turn(llm, side: Literal["prosecution", "defense"], system: str, prompt: str, schema,
                         ctx: dict, ledger: GroundingLedger, telemetry, round_num: int = 1,
                         other_ids: frozenset[str] = frozenset()) -> tuple[list[DebateClaim], str]:
    """One debate turn: grounded, rendered, emptied claims dropped. Raises (a failed turn) if the
    call failed or if redaction left no claim or no summary. The model's claim_id is discarded: code
    assigns P{round}a, P{round}b... / D{round}a... by position (after empty claims are dropped).
    evidence_keys keep only keys found in a packet; rebuts only an id that exists on the other side."""
    summary_key = f"{side}_summary"
    patterns = ["claims.*.claim_text", summary_key]
    out = await grounded_model(llm, ROLE, system, prompt, schema, agent=side, patterns=patterns,
                               ctx_for=lambda _p: ctx, ledger=ledger, telemetry=telemetry,
                               max_tokens=MAX_TOKENS, temperature=0.3)
    data = finalized(out, patterns, lambda _p: ctx, side, ledger)
    data["claims"] = [c for c in data["claims"] if c["claim_text"].strip()]
    if not data["claims"]:
        text, keys = fallback_text(side, ctx)   # GroundingFailed only if even the fallback cannot render
        data["claims"] = [{"claim_id": "", "claim_text": text, "evidence_keys": keys, "rebuts": None}]
        ledger.add_fallback(side, "claims")
    if not data[summary_key].strip():
        data[summary_key] = fallback_text(side, ctx)[0]
        ledger.add_fallback(side, summary_key)
    known = {k for packet in ctx.values() for k in packet}
    prefix = side[0].upper()
    for i, c in enumerate(data["claims"]):
        c["claim_id"] = f"{prefix}{round_num}{_letters(i)}"
        c["evidence_keys"] = list(dict.fromkeys(k for k in c.get("evidence_keys", []) if k in known))
        c["rebuts"] = c.get("rebuts") if c.get("rebuts") in other_ids else None
    return _parse_claims(data, side, max_len=None), data[summary_key]


async def run_debate(
    liquidity_packet: dict,
    risk_packet: dict,
    fee_packet: dict,
    alpha_packet: dict,
    llm,
    telemetry: list | None = None,
    ledger: GroundingLedger | None = None,
) -> DebateTranscript:
    """
    Run the Execution Trial debate through the router (role "debate").
    Never raises. Stops at the first failed turn (a failed call, or a turn whose claims or summary
    were emptied by the number check), because a run with a failed turn is degraded and further
    calls would be wasted. round_count counts only rounds where both sides answered.
    """
    start = _clock()
    ctx = _ctx(liquidity_packet, risk_packet, fee_packet, alpha_packet)
    ledger = ledger if ledger is not None else GroundingLedger()
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
            new_claims, prosecution_summary = await _grounded_turn(
                llm, "prosecution", PROSECUTION_SYSTEM, p_prompt, ProsecutionTurn, ctx, ledger, telemetry,
                round_num, frozenset(c.claim_id for c in state.defense_claims))
            state.prosecution_claims.extend(new_claims)
            state.all_claims.extend(new_claims)
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
            new_claims, defense_summary = await _grounded_turn(
                llm, "defense", DEFENSE_SYSTEM, d_prompt, DefenseTurn, ctx, ledger, telemetry,
                round_num, frozenset(c.claim_id for c in state.prosecution_claims))
            state.defense_claims.extend(new_claims)
            state.all_claims.extend(new_claims)
            state.latest_speaker = "defense"
            turns_ok += 1
        except Exception as e:
            print(f"[debate] Defense round {round_num} failed: {type(e).__name__}")
            failed.append(f"defense round {round_num}")
            break

        state.round_count = round_num

    # ── Derive key dispute (whole rendered claims: truncating could cut a number in half) ──
    if state.prosecution_claims and state.defense_claims:
        key_dispute = (
            f"Prosecution argues: {state.prosecution_claims[0].claim_text} "
            f"Defense counters: {state.defense_claims[0].claim_text}"
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

"""Test doubles for Council pipeline tests: a real LLMRouter over fake providers.

The fake provider answers by reading the system prompt (which agent is asking), so the whole
pipeline runs for real: router, retry policy, JSON extraction, Pydantic validation, coverage
confidence, grounding, debate, synthesis, verifier, overrides. Usage goes to mongomock-motor.
No network, no Atlas.
"""
from __future__ import annotations

import json

from mongomock_motor import AsyncMongoMockClient

from agents.llm_router import LLMRouter, MongoUsageStore, RouteConfig
from agents.metrics.alpha_packet import AlphaMetricsPacket
from agents.metrics.fee_packet import FeeMetricsPacket
from agents.metrics.liquidity_packet import LiquidityMetricsPacket
from agents.metrics.risk_packet import RiskMetricsPacket

DAY = "2026-11-04"

LIQUIDITY = {"agent": "liquidity_scout", "liquidityRating": "GOOD", "slippageRoot": "Normal spread conditions",
             "cited_evidence": ["avg_slippage_bps"], "severity": "LOW", "confidence": 0.85, "flags": []}
ALPHA = {"agent": "alpha_architect", "alphaRating": "NEUTRAL", "bestAlternative": "Fills tracked the VWAP benchmark",
         "cited_evidence": ["avg_vwap_deviation_bps"], "severity": "LOW", "confidence": 0.78, "flags": []}
RISK = {"agent": "risk_auditor", "riskLevel": "LOW", "cited_evidence": ["adverseSelectionRisk", "concentrationScore"],
        "severity": "LOW", "confidence": 0.90, "flags": []}
FEE = {"agent": "fee_optimizer", "feeRating": "OPTIMAL", "recommendedAction": "Most fills were maker orders",
       "cited_evidence": ["maker_ratio"], "severity": "LOW", "confidence": 0.92, "flags": []}
PROSECUTION = {"claims": [{"claim_id": "P1a", "claim_text": "maker_ratio was low", "evidence_keys": ["maker_ratio"],
                           "rebuts": None}], "prosecution_summary": "Fees were avoidable."}
DEFENSE = {"claims": [{"claim_id": "D1a", "claim_text": "slippage was small", "evidence_keys": ["avg_slippage_bps"],
                       "rebuts": "P1a"}], "defense_summary": "Costs reflected the market."}
# Observations only (no effect to replay), so a default run makes exactly 9 calls and no re-reason.
SYNTHESIS = {"headline": "Execution quality was solid", "narrative": "Fills were mostly maker orders.",
             "recommendations": [
                 {"action_type": "general", "params": {}, "rationale_text": "Most fills were maker orders."},
                 {"action_type": "none", "params": {}, "rationale_text": "Slippage stayed small."},
                 {"action_type": "general", "params": {}, "rationale_text": "Fills tracked VWAP."}],
             "conflictLedger": [], "overallRating": "GOOD", "estimatedMonthlyCostUSD": 33.0}


class _Obj:
    def __init__(self, **kw):
        self.__dict__.update(kw)


def reply(payload, prompt_tokens=100, completion_tokens=20):
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return _Obj(
        choices=[_Obj(message=_Obj(content=text))],
        usage=_Obj(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
                   total_tokens=prompt_tokens + completion_tokens),
    )


class HTTPError(Exception):
    def __init__(self, status, headers=None):
        super().__init__(f"Error code: {status}")
        self.status_code = status
        self.response = _Obj(headers=headers or {})


def agent_of(kwargs) -> str:
    system = kwargs["messages"][0]["content"].lower()
    for marker, name in (("judge", "synthesis"), ("you are the prosecution", "prosecution"),
                         ("you are the defense", "defense"), ("liquidity scout", "liquidity_scout"),
                         ("alpha architect", "alpha_architect"), ("risk auditor", "risk_auditor"),
                         ("fee optimizer", "fee_optimizer"),
                         ("single-pass audit", "synthesis")):   # the single-call ablation arm's prompt
        if marker in system:
            return name
    raise AssertionError("unknown agent prompt")


DEFAULT_ANSWERS = {
    "liquidity_scout": LIQUIDITY, "alpha_architect": ALPHA, "risk_auditor": RISK, "fee_optimizer": FEE,
    "prosecution": PROSECUTION, "defense": DEFENSE, "synthesis": SYNTHESIS,
}


class FakeProvider:
    """client_factory for LLMRouter. `answers[agent]` is a payload dict/str, an Exception, or a
    callable(kwargs, n) returning either (n = how many times this agent has been asked)."""

    def __init__(self, answers=None):
        self.answers = {**DEFAULT_ANSWERS, **(answers or {})}
        self.calls: list[dict] = []
        self.count: dict[str, int] = {}

    def __call__(self, provider, api_key):
        outer = self

        class _Completions:
            async def create(self, **kw):
                agent = agent_of(kw)
                outer.count[agent] = outer.count.get(agent, 0) + 1
                outer.calls.append({"agent": agent, **kw})
                answer = outer.answers[agent]
                if callable(answer) and not isinstance(answer, type):
                    answer = answer(kw, outer.count[agent])
                if isinstance(answer, Exception):
                    raise answer
                return answer if isinstance(answer, _Obj) else reply(answer)

        return _Obj(chat=_Obj(completions=_Completions()))

    def prompts(self) -> list[str]:
        return [m["content"] for c in self.calls for m in c["messages"]]


ROUTES = {
    "version": 1,
    "defaults": {"daily_requests": 1000, "daily_tokens": 1_000_000},
    "providers": {"fake": {"base_url": "https://fake.invalid/v1", "key_env": "FAKE_KEY"}},
    "models": {"m1": {"provider": "fake", "model": "fake-small"}, "m2": {"provider": "fake", "model": "fake-big"}},
    "roles": {"specialist": ["m1"], "debate": ["m1"], "synthesis": ["m2"]},
    "run_estimate": {"specialist": {"calls": 4, "tokens_per_call": 10},
                     "debate": {"calls": 4, "tokens_per_call": 10},
                     "synthesis": {"calls": 1, "tokens_per_call": 10}},
}


def make_router(answers=None, routes=None, db=None, env=None):
    provider = FakeProvider(answers)
    db = db if db is not None else AsyncMongoMockClient()["usage"]

    async def no_sleep(_s):
        return None

    router = LLMRouter(
        RouteConfig.from_dict(routes or ROUTES),
        usage_store=MongoUsageStore(db),
        client_factory=provider,
        env=env if env is not None else {"FAKE_KEY": "k"},
        sleep=no_sleep,
        day_fn=lambda: DAY,
    )
    return router, provider


def make_packets(total_fee_paid_usd: float = 328.0, trade_count: int = 10):
    fee = FeeMetricsPacket("u", "BTCUSDT", "binance", "2026-11-01T00:00:00Z",
                           total_fee_paid_usd=total_fee_paid_usd, trade_count=trade_count)
    packets = (fee, RiskMetricsPacket("u", "BTCUSDT", "2026-11-01T00:00:00Z"),
               LiquidityMetricsPacket("u", "BTCUSDT", "2026-11-01T00:00:00Z"),
               AlphaMetricsPacket("u", "BTCUSDT", "2026-11-01T00:00:00Z"))
    for p in packets:
        p.content_hash = p.compute_hash()
    return packets

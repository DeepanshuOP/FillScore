"""1d.5 token-bucket pacer: hand-computed fixtures, router hook, YAML resolution."""
from __future__ import annotations

import asyncio
import json

import pytest
from mongomock_motor import AsyncMongoMockClient

from agents import llm_router
from agents.llm_router import LLMRouter, MongoUsageStore, RouteConfig, TokenBucketPacer
from tests.test_llm_router import DAY, GOOD, FakeProviders, Verdict, reply, run


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


# Bucket A: tpm 8000 -> 8000/60 = 133.333/s ; rpm 30 -> 0.5/s ; max_wait 20.
def test_token_bucket_sequence():
    clk = Clock()
    p = TokenBucketPacer(clk)
    key = ("groq", "m")
    waits = []
    for _ in range(7):
        # calls 1-5 drain 8000 -> 500 (5 x 1500 = 7500) with wait 0
        # call 6: (1500-500)/133.333 = 7.5 ; call 7: level 0 at t=7.5 -> 1500/133.333 = 11.25
        w = p.reserve(key, 8000, 30, 1500, 20)
        waits.append(w)
        clk.t += w
    assert waits == pytest.approx([0, 0, 0, 0, 0, 7.5, 11.25], abs=1e-9)
    assert clk.t == pytest.approx(18.75)
    # call 8: need 3000 -> 3000/133.333 = 22.5 > 20 -> None, nothing changed
    before = dict(p._state[key])
    assert p.reserve(key, 8000, 30, 3000, 20) is None
    assert p._state[key] == before


def test_request_bound_fixture():
    # rpm 6 -> 0.1/s ; calls 1-6 free (6 -> 0); call 7 waits (1-0)/0.1 = 10 ; call 8 waits 10
    clk = Clock()
    p = TokenBucketPacer(clk)
    waits = []
    for _ in range(8):
        w = p.reserve(("x", "y"), 1_000_000, 6, 10, 20)
        waits.append(w)
        clk.t += w
    assert waits == pytest.approx([0] * 6 + [10.0, 10.0], abs=1e-9)
    assert clk.t == pytest.approx(20.0)


def test_never_fits_returns_none():
    assert TokenBucketPacer(Clock()).reserve(("a", "b"), 8000, 30, 8001, 1000) is None


# ── router level ─────────────────────────────────────────────────────────────

def cfg(**model_extra):
    return RouteConfig.from_dict({
        "version": 1,
        "defaults": {"daily_requests": 1000, "daily_tokens": 10_000_000, "tpm": 8000, "rpm": 30,
                     "pace_max_wait_s": 20},
        "providers": {"p1": {"base_url": "https://p1.invalid/v1", "key_env": "P1_KEY"},
                      "p2": {"base_url": "https://p2.invalid/v1", "key_env": "P2_KEY"}},
        "models": {"x": {"provider": "p1", "model": "model-x"}, "y": {"provider": "p2", "model": "model-y"}},
        "roles": {"r": ["x", "y"]},
        "run_estimate": {"r": {"calls": 1, "tokens_per_call": 10}},
    })


def paced_router(script, config=None):
    clk = Clock()
    sleeps = []

    async def sleep(s):
        sleeps.append(s)
        clk.t += s

    fake = FakeProviders(script)
    router = LLMRouter(config or cfg(), usage_store=MongoUsageStore(AsyncMongoMockClient()["t"]),
                       client_factory=fake, env={"P1_KEY": "k", "P2_KEY": "k"}, sleep=sleep,
                       day_fn=lambda: DAY, pace_clock=clk)
    return router, fake, sleeps, clk


SYS, USER = "s" * 2000, "u" * 2000   # 4000 chars -> 1000 ; + max_tokens 500 -> need 1500


def test_estimate_fixture():
    # 400 + 3603 = 4003 // 4 = 1000 ; 500 * 1.8 = 900 -> need 1900
    config = RouteConfig.from_dict({
        "defaults": {"tpm": 1900, "rpm": 30, "pace_max_wait_s": 20},
        "providers": {"p1": {"base_url": "https://p1.invalid/v1", "key_env": "P1_KEY"}},
        "models": {"x": {"provider": "p1", "model": "model-x", "max_tokens_factor": 1.8}},
        "roles": {"r": ["x"]}, "run_estimate": {},
    })
    router, fake, sleeps, clk = paced_router({"model-x": [reply(GOOD), reply(GOOD)]}, config)
    run(router.complete("r", "s" * 400, "u" * 3603, Verdict, max_tokens=500))
    assert router.pacer._state[("p1", "model-x")]["tok"] == pytest.approx(0)   # 1900 - 1900
    assert sleeps == []


def test_six_sequential_calls_sleep_once_for_7_5():
    router, fake, sleeps, clk = paced_router({"model-x": [reply(GOOD)] * 6})
    for _ in range(6):
        run(router.complete("r", SYS, USER, Verdict, max_tokens=500))
    assert sleeps == pytest.approx([7.5])
    assert router.paced_wait_s == pytest.approx(7.5)


def test_concurrent_calls_queue_with_one_waiter():
    router, fake, sleeps, clk = paced_router({"model-x": [reply(GOOD)] * 6})

    async def go():
        await asyncio.gather(*[router.complete("r", SYS, USER, Verdict, max_tokens=500) for _ in range(6)])

    run(go())
    assert sum(sleeps) == pytest.approx(7.5) and len(sleeps) == 1


def test_paced_skip_moves_to_next_candidate():
    router, fake, sleeps, clk = paced_router({"model-x": [reply(GOOD)], "model-y": [reply(GOOD)]})
    # drain X: level 0 at t=0 (after reserve 8000), next need 3000 -> 22.5s > 20
    assert router.pacer.reserve(("p1", "model-x"), 8000, 30, 8000, 20) == 0
    telemetry = []
    big = "s" * 4000, "u" * 8000   # 12000 chars -> 3000 ; + 0 max_tokens... use max_tokens 0
    run(router.complete("r", big[0], big[1], Verdict, max_tokens=0, telemetry=telemetry))
    assert [(t["model"], t["outcome"]) for t in telemetry] == [("model-x", "paced_skip"), ("model-y", "ok")]
    assert telemetry[0]["tokens"] == 0 and telemetry[0]["latency_ms"] == 0
    assert router.http_attempts == 1
    assert [m for _, m, _ in fake.calls] == ["model-y"]


def test_yaml_resolution():
    cfg_ = llm_router.load_routes()
    by = lambda m: (cfg_.models[m].tpm, cfg_.models[m].rpm)
    assert by("groq-qwen3.8-27b") == (8000, 30)
    assert by("gemini-3.8-flash") == (250000, 10)
    assert cfg_.pace_max_wait_s == 20
    over = RouteConfig.from_dict({
        "defaults": {"tpm": 8000, "rpm": 10},
        "providers": {"p1": {"base_url": "u", "key_env": "K", "tpm": 7000, "rpm": 30}},
        "models": {"m": {"provider": "p1", "model": "m", "tpm": 5000}, "n": {"provider": "p1", "model": "n"}},
        "roles": {}, "run_estimate": {},
    })
    assert (over.models["m"].tpm, over.models["m"].rpm) == (5000, 30)
    assert (over.models["n"].tpm, over.models["n"].rpm) == (7000, 30)


# ── Phase 2a.1: routing keeps qwen headroom for synthesis (real YAML) ─────────────────────────
# need = (len(system)+len(user))//4 + int(max_tokens * 1.8)
#   specialist: 4000//4 + int(500*1.8)  = 1000 +  900 = 1900
#   debate:     5600//4 + int(600*1.8)  = 1400 + 1080 = 2480
#   synthesis:  6000//4 + int(1000*1.8) = 1500 + 1800 = 3300
# qwen bucket: tpm 8000 -> 133.333/s, starts full at 8000.
SPEC_NEED, DEBATE_NEED, SYNTH_NEED = 1900, 2480, 3300
QWEN = ("groq", "qwen/qwen3.8-27b")
GPT20 = ("groq", "openai/gpt-oss-20b")


def _real_router(script, raw_edit=None):
    import yaml
    with open(llm_router.ROUTES_PATH, encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    if raw_edit:
        raw_edit(raw)
    clk = Clock()
    sleeps = []

    async def sleep(s):          # records only; the clock moves only when the test advances it
        sleeps.append(s)

    fake = FakeProviders(script)
    router = LLMRouter(RouteConfig.from_dict(raw), usage_store=MongoUsageStore(AsyncMongoMockClient()["t"]),
                       client_factory=fake, env={"GROQ_API_KEY": "k"}, sleep=sleep,
                       day_fn=lambda: DAY, pace_clock=clk)
    return router, fake, sleeps, clk


def _specialists_then_debate(router, debate_calls=4):
    for _ in range(4):   # qwen: 8000 - 4*1900 = 400
        run(router.complete("specialist", "s" * 2000, "u" * 2000, Verdict, max_tokens=500))
    for _ in range(debate_calls):
        run(router.complete("debate", "s" * 2800, "u" * 2800, Verdict, max_tokens=600))


def _synthesis(router, telemetry):
    return run(router.complete("synthesis", "s" * 3000, "u" * 3000, Verdict, max_tokens=1000,
                               telemetry=telemetry))


def test_synthesis_keeps_qwen_headroom_under_2a_routing():
    n = 4 + 1
    router, fake, sleeps, clk = _real_router({
        "qwen/qwen3.8-27b": [reply(GOOD)] * n, "openai/gpt-oss-20b": [reply(GOOD)] * 4})
    _specialists_then_debate(router)
    # 20b: 8000 - 4*2480 = -1920; call 4 waits (2480 - 560)/133.333 = 14.4 <= 20, so all 4 on 20b
    models = [m for _, m, _ in fake.calls]
    assert models.count("openai/gpt-oss-20b") == 4 and models[4:] == ["openai/gpt-oss-20b"] * 4
    assert router.pacer._state[QWEN]["tok"] == pytest.approx(400)
    clk.t = 6.0
    # qwen at synthesis start = min(8000, 400 + 133.333*6) = 1200 ; wait (3300-1200)/133.333 = 15.75
    sleeps.clear()
    tele = []
    _synthesis(router, tele)
    assert [t["outcome"] for t in tele] == ["ok"] and tele[0]["model"] == "qwen/qwen3.8-27b"
    assert sleeps == pytest.approx([15.75])
    assert router.pacer._state[QWEN]["tok"] == pytest.approx(1200 - 3300)


def test_synthesis_backstop_45s():
    router, fake, sleeps, clk = _real_router({
        "qwen/qwen3.8-27b": [reply(GOOD)] * 5, "openai/gpt-oss-20b": [reply(GOOD)] * 4})
    _specialists_then_debate(router)
    sleeps.clear()
    tele = []
    _synthesis(router, tele)   # t = 0: wait (3300-400)/133.333 = 21.75 > 20 but <= 45
    assert [t["outcome"] for t in tele] == ["ok"] and tele[0]["model"] == "qwen/qwen3.8-27b"
    assert sleeps == pytest.approx([21.75])
    # the same state under the 20 s limit (specialist/debate) is skipped
    p = TokenBucketPacer(Clock())
    assert p.reserve(("g", "q"), 8000, 30, 7600, 20) == 0     # 8000 - 7600 = 400
    assert p.reserve(("g", "q"), 8000, 30, 3300, 20) is None  # 21.75 s > 20


def test_old_debate_order_drains_qwen():
    def old_order(raw):
        raw["roles"]["debate"] = ["groq-qwen3.8-27b", "groq-gpt-oss-20b", "groq-gpt-oss-120b",
                                  "gemini-3.5-flash-lite", "gemini-3.8-flash"]
    router, fake, sleeps, clk = _real_router({"qwen/qwen3.8-27b": [reply(GOOD)] * 6}, old_order)
    _specialists_then_debate(router, debate_calls=1)
    # debate on qwen at t=0 waits (2480-400)/133.333 = 15.6 s <= 20 ; level 400 - 2480 = -2080
    assert sleeps[-1] == pytest.approx(15.6)
    assert router.pacer._state[QWEN]["tok"] == pytest.approx(-2080)
    clk.t = 6.0
    sleeps.clear()
    tele = []
    _synthesis(router, tele)   # (3300 - (-2080 + 800))/133.333 = 4580/133.333 = 34.35 s <= 45
    assert [t["outcome"] for t in tele] == ["ok"]
    assert sleeps == pytest.approx([34.35])

"""1b.4 free-model router: fallback chain, key-less providers, persisted daily budgets, telemetry.

Providers are faked (no network). Usage persistence runs against mongomock-motor, the in-memory
Mongo double, so the $inc / upsert maths is the real query, not a hand-rolled dict.
"""
from __future__ import annotations

import asyncio
import json
import pathlib
import re

import pytest
from mongomock_motor import AsyncMongoMockClient
from pydantic import BaseModel

from agents import llm_router
from agents.llm_router import LLMRouter, MongoUsageStore, RouteConfig, RouterExhausted

DAY = "2026-11-04"


class Verdict(BaseModel):
    rating: str


# ── fakes ────────────────────────────────────────────────────────────────────

class _Obj:
    def __init__(self, **kw):
        self.__dict__.update(kw)


def reply(text, prompt=100, completion=50):
    return _Obj(
        choices=[_Obj(message=_Obj(content=text))],
        usage=_Obj(prompt_tokens=prompt, completion_tokens=completion, total_tokens=prompt + completion),
    )


class HTTPError(Exception):
    def __init__(self, status, headers=None):
        super().__init__(f"Error code: {status}")
        self.status_code = status
        self.response = _Obj(headers=headers or {})


class FakeProviders:
    """client_factory: one fake client per provider; each model has a queue of scripted outcomes."""

    def __init__(self, script):
        self.script = {k: list(v) for k, v in script.items()}
        self.calls = []

    def __call__(self, provider, api_key):
        outer = self

        class _Completions:
            async def create(self, **kw):
                outer.calls.append((provider.name, kw["model"], kw))
                queue = outer.script.get(kw["model"], [])
                item = queue.pop(0) if queue else HTTPError(500)
                if isinstance(item, Exception):
                    raise item
                return item

        return _Obj(chat=_Obj(completions=_Completions()))


def config(roles=None, models=None):
    return RouteConfig.from_dict({
        "version": 1,
        "defaults": {"daily_requests": 100, "daily_tokens": 100000},
        "providers": {
            "p1": {"base_url": "https://p1.invalid/v1", "key_env": "P1_KEY"},
            "p2": {"base_url": "https://p2.invalid/v1", "key_env": "P2_KEY"},
        },
        "models": models or {
            "a": {"provider": "p1", "model": "model-a"},
            "b": {"provider": "p1", "model": "model-b"},
            "c": {"provider": "p2", "model": "model-c"},
        },
        "roles": roles or {"specialist": ["a", "b", "c"], "synthesis": ["c", "a"]},
        "run_estimate": {"specialist": {"calls": 2, "tokens_per_call": 100},
                         "synthesis": {"calls": 1, "tokens_per_call": 100}},
    })


def make_router(script, env=None, cfg=None, db=None):
    db = db if db is not None else AsyncMongoMockClient()["test"]
    fake = FakeProviders(script)
    sleeps = []

    async def no_sleep(s):
        sleeps.append(s)

    router = LLMRouter(
        cfg or config(),
        usage_store=MongoUsageStore(db),
        client_factory=fake,
        env=env if env is not None else {"P1_KEY": "k1", "P2_KEY": "k2"},
        sleep=no_sleep,
        day_fn=lambda: DAY,
    )
    return router, fake, db, sleeps


def run(coro):
    return asyncio.run(coro)


GOOD = json.dumps({"rating": "GOOD"})


# ── tests ────────────────────────────────────────────────────────────────────

def test_404_falls_through_to_the_next_model():
    router, fake, _, sleeps = make_router({"model-a": [HTTPError(404)], "model-b": [reply(GOOD)]})
    telemetry = []
    out = run(router.complete("specialist", "sys", "user", Verdict, max_tokens=100, telemetry=telemetry))
    assert out.rating == "GOOD"
    assert [m for _, m, _ in fake.calls] == ["model-a", "model-b"]
    assert sleeps == []                        # a 404 is never retried
    assert [(t["model"], t["outcome"]) for t in telemetry] == [("model-a", "http_404"), ("model-b", "ok")]


@pytest.mark.parametrize("status", [401, 403])
def test_auth_errors_fall_through(status):
    router, fake, _, _ = make_router({"model-a": [HTTPError(status)], "model-b": [reply(GOOD)]})
    assert run(router.complete("specialist", "s", "u", Verdict, max_tokens=10)).rating == "GOOD"


def test_429_is_retried_then_falls_through_after_three_attempts():
    errs = [HTTPError(429, {"retry-after": "1"})] * 3
    router, fake, _, sleeps = make_router({"model-a": errs, "model-b": [reply(GOOD)]})
    run(router.complete("specialist", "s", "u", Verdict, max_tokens=10))
    assert [m for _, m, _ in fake.calls] == ["model-a"] * 3 + ["model-b"]
    assert sleeps == [1.0, 1.0]


def test_invalid_json_twice_moves_to_the_next_model():
    router, fake, _, _ = make_router({
        "model-a": [reply("not json at all"), reply(json.dumps({"wrong": 1}))],
        "model-b": [reply(GOOD)],
    })
    telemetry = []
    out = run(router.complete("specialist", "s", "u", Verdict, max_tokens=10, telemetry=telemetry))
    assert out.rating == "GOOD"
    assert [(t["model"], t["attempt"], t["outcome"]) for t in telemetry] == [
        ("model-a", 1, "invalid_json"), ("model-a", 2, "invalid_json"), ("model-b", 1, "ok")]


def test_invalid_json_once_is_retried_on_the_same_model():
    router, fake, _, _ = make_router({"model-a": [reply("{oops"), reply(GOOD)]})
    run(router.complete("specialist", "s", "u", Verdict, max_tokens=10))
    assert [m for _, m, _ in fake.calls] == ["model-a", "model-a"]


def test_empty_completion_moves_to_the_next_model():
    router, fake, _, _ = make_router({"model-a": [reply("")], "model-b": [reply(GOOD)]})
    telemetry = []
    run(router.complete("specialist", "s", "u", Verdict, max_tokens=10, telemetry=telemetry))
    assert telemetry[0]["outcome"] == "empty"


def test_a_provider_without_a_key_is_skipped_silently():
    # P1_KEY missing (and P2_KEY blank-padded counts as present) -> only model-c is tried
    router, fake, _, _ = make_router({"model-c": [reply(GOOD)]}, env={"P1_KEY": "   ", "P2_KEY": "k2"})
    telemetry = []
    run(router.complete("specialist", "s", "u", Verdict, max_tokens=10, telemetry=telemetry))
    assert [m for _, m, _ in fake.calls] == ["model-c"]
    assert [t["model"] for t in telemetry] == ["model-c"]


def test_no_key_at_all_raises_router_exhausted_without_calls():
    router, fake, _, _ = make_router({}, env={})
    with pytest.raises(RouterExhausted) as info:
        run(router.complete("specialist", "s", "u", Verdict, max_tokens=10))
    assert info.value.reason == "no_provider"
    assert fake.calls == []


def test_an_exhausted_budget_skips_the_model():
    cfg = config(models={
        "a": {"provider": "p1", "model": "model-a", "daily_requests": 2, "daily_tokens": 100000},
        "b": {"provider": "p1", "model": "model-b"},
        "c": {"provider": "p2", "model": "model-c"},
    })
    db = AsyncMongoMockClient()["test"]
    # model-a already made 2 requests today: at its limit of 2
    run(db["llm_usage"].insert_one({"provider": "p1", "model": "model-a", "day_utc": DAY, "requests": 2, "tokens": 300}))
    router, fake, _, _ = make_router({"model-b": [reply(GOOD)]}, cfg=cfg, db=db)
    run(router.complete("specialist", "s", "u", Verdict, max_tokens=10))
    assert [m for _, m, _ in fake.calls] == ["model-b"]


def test_an_exhausted_token_budget_skips_the_model():
    cfg = config(models={
        "a": {"provider": "p1", "model": "model-a", "daily_requests": 100, "daily_tokens": 1000},
        "b": {"provider": "p1", "model": "model-b"},
        "c": {"provider": "p2", "model": "model-c"},
    })
    db = AsyncMongoMockClient()["test"]
    run(db["llm_usage"].insert_one({"provider": "p1", "model": "model-a", "day_utc": DAY, "requests": 3, "tokens": 1000}))
    router, fake, _, _ = make_router({"model-b": [reply(GOOD)]}, cfg=cfg, db=db)
    run(router.complete("specialist", "s", "u", Verdict, max_tokens=10))
    assert [m for _, m, _ in fake.calls] == ["model-b"]


def test_all_budgets_exhausted_raises_budget_reason():
    cfg = config(models={
        "a": {"provider": "p1", "model": "model-a", "daily_requests": 1},
        "b": {"provider": "p1", "model": "model-b", "daily_requests": 1},
        "c": {"provider": "p2", "model": "model-c", "daily_requests": 1},
    })
    db = AsyncMongoMockClient()["test"]
    for p, m in [("p1", "model-a"), ("p1", "model-b"), ("p2", "model-c")]:
        run(db["llm_usage"].insert_one({"provider": p, "model": m, "day_utc": DAY, "requests": 1, "tokens": 0}))
    router, fake, _, _ = make_router({}, cfg=cfg, db=db)
    with pytest.raises(RouterExhausted) as info:
        run(router.complete("specialist", "s", "u", Verdict, max_tokens=10))
    assert info.value.reason == "budget"
    assert fake.calls == []
    assert run(router.has_capacity()) is False


def test_usage_is_persisted_and_summed():
    # Two successful calls on model-a (100+50 and 200+50 tokens) and one on model-c (300+100).
    router, fake, db, _ = make_router({
        "model-a": [reply(GOOD, 100, 50), reply(GOOD, 200, 50)],
        "model-c": [reply(GOOD, 300, 100)],
    })
    run(router.complete("specialist", "s", "u", Verdict, max_tokens=10))
    run(router.complete("specialist", "s", "u", Verdict, max_tokens=10))
    run(router.complete("synthesis", "s", "u", Verdict, max_tokens=10))

    docs = run(db["llm_usage"].find({}, {"_id": 0}).sort("model", 1).to_list(10))
    # model-a: requests 1 + 1 = 2; tokens (100+50) + (200+50) = 400
    # model-c: requests 1;          tokens 300 + 100           = 400
    assert docs == [
        {"provider": "p1", "model": "model-a", "day_utc": DAY, "requests": 2, "tokens": 400},
        {"provider": "p2", "model": "model-c", "day_utc": DAY, "requests": 1, "tokens": 400},
    ]
    assert run(router.usage_today("p1", "model-a")) == {"requests": 2, "tokens": 400}


def test_failed_requests_without_a_response_do_not_count_against_the_budget():
    router, fake, db, _ = make_router({"model-a": [HTTPError(404)], "model-b": [reply(GOOD, 10, 5)]})
    run(router.complete("specialist", "s", "u", Verdict, max_tokens=10))
    docs = run(db["llm_usage"].find({}, {"_id": 0}).to_list(10))
    assert docs == [{"provider": "p1", "model": "model-b", "day_utc": DAY, "requests": 1, "tokens": 15}]


def test_telemetry_record_shape():
    router, _, _, _ = make_router({"model-a": [reply(GOOD, 120, 30)]})
    telemetry = []
    run(router.complete("specialist", "s", "u", Verdict, max_tokens=10, telemetry=telemetry))
    rec = telemetry[0]
    assert {"provider", "model", "attempt", "latency_ms", "tokens", "outcome", "role"} <= set(rec)
    assert (rec["provider"], rec["model"], rec["attempt"], rec["tokens"], rec["outcome"]) == ("p1", "model-a", 1, 150, "ok")


def test_model_options_from_yaml_are_sent():
    cfg = config(models={
        "a": {"provider": "p1", "model": "model-a", "extra_body": {"reasoning_effort": "low"}, "max_tokens_factor": 1.8},
        "b": {"provider": "p1", "model": "model-b"},
        "c": {"provider": "p2", "model": "model-c"},
    })
    router, fake, _, _ = make_router({"model-a": [reply(GOOD)]}, cfg=cfg)
    run(router.complete("specialist", "s", "u", Verdict, max_tokens=500))
    sent = fake.calls[0][2]
    assert sent["extra_body"] == {"reasoning_effort": "low"}
    assert sent["max_tokens"] == 900   # 500 * 1.8


def test_routing_order_per_role():
    router, fake, _, _ = make_router({"model-c": [reply(GOOD)]})
    assert [c.model for c in router.candidates("specialist")] == ["model-a", "model-b", "model-c"]
    assert [c.model for c in router.candidates("synthesis")] == ["model-c", "model-a"]
    run(router.complete("synthesis", "s", "u", Verdict, max_tokens=10))
    assert fake.calls[0][1] == "model-c"     # synthesis starts with its own first choice


def test_committed_yaml_follows_the_probe_order():
    # .work/probe_results.md (1b.7): order = valid JSON, then grounding, then latency.
    cfg = llm_router.load_routes()
    assert set(cfg.roles) >= {"specialist", "debate", "synthesis"}
    models = lambda role: [cfg.models[i].model for i in cfg.roles[role]]
    # specialist: all valid and grounded; latency 808 < 1116 < 1404 ms
    assert models("specialist")[:3] == ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"]
    # synthesis: qwen 851 ms and 120b 1811 ms valid; 20b failed validation -> last
    assert models("synthesis")[:2] == ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"]
    assert models("synthesis")[-1] == "openai/gpt-oss-20b"
    for role in cfg.roles.values():
        for model_id in role:
            assert model_id in cfg.models
    # keys come from env var names, never values
    for p in cfg.providers.values():
        assert re.fullmatch(r"[A-Z_]+", p.key_env)


def test_route_config_hash_is_stable_and_changes_with_the_routes():
    h1 = config().hash
    assert h1 == config().hash and len(h1) == 16
    assert config(roles={"specialist": ["b", "a"], "synthesis": ["c"]}).hash != h1


def test_no_model_name_is_hard_coded_outside_the_yaml():
    root = pathlib.Path(__file__).resolve().parents[1]
    files = list((root / "agents").rglob("*.py")) + [root / "main.py"] + list((root / "eval").glob("*.py"))
    pattern = re.compile(r"gpt-oss|llama-|qwen|gemini-|deepseek|claude-")
    offenders = [f"{f.relative_to(root)}:{i}" for f in files
                 for i, line in enumerate(f.read_text().splitlines(), 1) if pattern.search(line)]
    assert offenders == []


# ── review follow-ups (1b.8) ────────────────────────────────────────────────

def test_capacity_counts_all_roles_against_a_shared_model():
    # One model serves every role. It has 5 requests left; a run needs 2 specialist + 1 synthesis
    # = 3 here, so it fits; with 2 left it does not, even though each role alone (2, 1) would.
    cfg = RouteConfig.from_dict({
        "providers": {"p1": {"base_url": "https://p1.invalid/v1", "key_env": "P1_KEY"}},
        "models": {"a": {"provider": "p1", "model": "model-a", "daily_requests": 10, "daily_tokens": 100000}},
        "roles": {"specialist": ["a"], "synthesis": ["a"]},
        "run_estimate": {"specialist": {"calls": 2, "tokens_per_call": 100},
                         "synthesis": {"calls": 1, "tokens_per_call": 100}},
    })
    for used, expected in [(7, True), (8, False)]:   # 10 - 7 = 3 >= 2 + 1 ; 10 - 8 = 2 < 3
        db = AsyncMongoMockClient()["test"]
        run(db["llm_usage"].insert_one({"provider": "p1", "model": "model-a", "day_utc": DAY, "requests": used, "tokens": 0}))
        router, _, _, _ = make_router({}, cfg=cfg, db=db)
        assert run(router.has_capacity()) is expected, used


def test_capacity_problem_names_a_missing_key_separately_from_a_spent_budget():
    router, _, _, _ = make_router({}, env={})
    assert run(router.capacity_problem()) == "no_provider"
    router, _, _, _ = make_router({})
    assert run(router.capacity_problem()) is None


def test_a_usage_write_failure_does_not_throw_away_a_valid_reply():
    class FlakyStore(MongoUsageStore):
        async def add(self, *a, **k):
            raise RuntimeError("mongo blip")

    router, fake, db, _ = make_router({"model-a": [reply(GOOD)]})
    router.usage_store = FlakyStore(db)
    assert run(router.complete("specialist", "s", "u", Verdict, max_tokens=10)).rating == "GOOD"

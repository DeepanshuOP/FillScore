"""E2E no-LLM guard: with FILLSCORE_E2E_NO_LLM=1 the router refuses to build a provider client, so no
outbound LLM call can be made even when (dummy) provider keys are present. Without the flag nothing changes."""
from __future__ import annotations

import pytest

from agents import llm_router
from agents.llm_router import LLMCallBlocked, Provider

PROVIDER = Provider(name="groq", base_url="https://example.invalid/v1", key_env="GROQ_API_KEY")


def test_flag_set_blocks_client_creation(monkeypatch):
    monkeypatch.setenv("FILLSCORE_E2E_NO_LLM", "1")
    with pytest.raises(LLMCallBlocked):
        llm_router._openai_client_factory(PROVIDER, "bogus")


@pytest.mark.parametrize("value", ["", "0", "true", "yes"])
def test_only_the_exact_value_one_activates_it(monkeypatch, value):
    monkeypatch.setenv("FILLSCORE_E2E_NO_LLM", value)
    client = llm_router._openai_client_factory(PROVIDER, "bogus")  # built, but never called
    assert client is not None


def test_flag_unset_builds_a_client(monkeypatch):
    monkeypatch.delenv("FILLSCORE_E2E_NO_LLM", raising=False)
    assert llm_router._openai_client_factory(PROVIDER, "bogus") is not None


def test_a_blocked_router_complete_raises_instead_of_calling(monkeypatch):
    """Full path: a keyed router using the real factory raises LLMCallBlocked from complete()."""
    import asyncio
    from pydantic import BaseModel
    from mongomock_motor import AsyncMongoMockClient
    from agents.llm_router import LLMRouter, MongoUsageStore, load_routes

    class S(BaseModel):
        x: int

    monkeypatch.setenv("FILLSCORE_E2E_NO_LLM", "1")
    cfg = load_routes()
    role = next(iter(cfg.roles))
    env = {p.key_env: "bogus" for p in cfg.providers.values()}
    router = LLMRouter(cfg, MongoUsageStore(AsyncMongoMockClient()["t"]), env=env)
    with pytest.raises(LLMCallBlocked):
        asyncio.run(router.complete(role, "s", "u", S, 10))

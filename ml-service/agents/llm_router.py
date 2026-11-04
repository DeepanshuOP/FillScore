"""Free-model router for the Agent Council (Phase 1b.4).

One OpenAI-compatible interface over an ordered list of (provider, model) candidates per role,
loaded from config/llm_routes.yaml (the only place model names live).

For each call the router walks the role's candidates in order and:
  - skips a provider whose key env var is missing or empty (silently);
  - skips a model whose persisted usage for today has reached its daily request or token limit;
  - calls it under the retry policy in llm_client (429/5xx/timeouts only, max 3 attempts);
  - moves to the next candidate on 404, 401/403, other 4xx, 429 or 5xx after retries, an empty
    completion, or a reply that fails JSON extraction + Pydantic validation twice.
Usage ({provider, model, day_utc, requests, tokens}) is persisted in Mongo `llm_usage` from the
provider's `usage` field. Every HTTP attempt is recorded into the run's telemetry list as
{role, provider, model, attempt, latency_ms, tokens, outcome}.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import pathlib
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Mapping

import yaml
from pydantic import BaseModel, ValidationError

from agents.llm_client import call_with_retry, extract_json_from_response, is_timeout, status_of, usage_of

ROUTES_PATH = pathlib.Path(__file__).resolve().parents[1] / "config" / "llm_routes.yaml"
USAGE_COLLECTION = "llm_usage"
MAX_INVALID_REPLIES = 2

_clock = time.perf_counter


class RouterExhausted(Exception):
    """No candidate could answer. reason: "no_provider" | "budget" | "failed"."""

    def __init__(self, role: str, reason: str):
        super().__init__(f"no model could answer role={role} ({reason})")
        self.role = role
        self.reason = reason


@dataclass(frozen=True)
class Provider:
    name: str
    base_url: str
    key_env: str
    timeout_s: float = 60.0
    headers: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Candidate:
    id: str
    provider: str
    model: str
    daily_requests: int
    daily_tokens: int
    extra_body: dict = field(default_factory=dict)
    max_tokens_factor: float = 1.0

    @property
    def label(self) -> str:
        return f"{self.provider}/{self.model}"


@dataclass
class RouteConfig:
    providers: dict[str, Provider]
    models: dict[str, Candidate]
    roles: dict[str, list[str]]
    run_estimate: dict[str, dict]
    hash: str

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any]) -> "RouteConfig":
        defaults = raw.get("defaults") or {}
        providers = {
            name: Provider(
                name=name,
                base_url=p["base_url"],
                key_env=p["key_env"],
                timeout_s=float(p.get("timeout_s", 60)),
                headers=dict(p.get("headers") or {}),
            )
            for name, p in (raw.get("providers") or {}).items()
        }
        models = {}
        for model_id, m in (raw.get("models") or {}).items():
            if m["provider"] not in providers:
                raise ValueError(f"llm_routes: model {model_id} names unknown provider {m['provider']}")
            models[model_id] = Candidate(
                id=model_id,
                provider=m["provider"],
                model=m["model"],
                daily_requests=int(m.get("daily_requests", defaults.get("daily_requests", 100))),
                daily_tokens=int(m.get("daily_tokens", defaults.get("daily_tokens", 100000))),
                extra_body=dict(m.get("extra_body") or {}),
                max_tokens_factor=float(m.get("max_tokens_factor", defaults.get("max_tokens_factor", 1.0))),
            )
        roles = {role: list(ids) for role, ids in (raw.get("roles") or {}).items()}
        for role, ids in roles.items():
            for model_id in ids:
                if model_id not in models:
                    raise ValueError(f"llm_routes: role {role} names unknown model {model_id}")
        canonical = json.dumps(raw, sort_keys=True, default=str)
        return cls(
            providers=providers,
            models=models,
            roles=roles,
            run_estimate=dict(raw.get("run_estimate") or {}),
            hash=hashlib.sha256(canonical.encode()).hexdigest()[:16],
        )


def load_routes(path: str | os.PathLike = ROUTES_PATH) -> RouteConfig:
    with open(path, encoding="utf-8") as f:
        return RouteConfig.from_dict(yaml.safe_load(f))


def utc_day() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ── usage store ────────────────────────────────────────────────────────────────

class MongoUsageStore:
    """Daily usage per (provider, model) in the `llm_usage` collection. Atomic $inc upserts."""

    def __init__(self, db):
        self._db = db

    async def get(self, provider: str, model: str, day: str) -> dict:
        doc = await self._db[USAGE_COLLECTION].find_one({"provider": provider, "model": model, "day_utc": day})
        return {"requests": int((doc or {}).get("requests", 0)), "tokens": int((doc or {}).get("tokens", 0))}

    async def add(self, provider: str, model: str, day: str, requests: int, tokens: int) -> None:
        await self._db[USAGE_COLLECTION].update_one(
            {"provider": provider, "model": model, "day_utc": day},
            {"$inc": {"requests": int(requests), "tokens": int(tokens)}},
            upsert=True,
        )


_default_db = None


def _default_usage_db():
    """Motor handle on the service database (certifi CA bundle for TLS URIs, F-23)."""
    global _default_db
    if _default_db is None:
        from motor.motor_asyncio import AsyncIOMotorClient

        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        kwargs = {}
        if uri.startswith("mongodb+srv") or "tls=true" in uri.lower() or "ssl=true" in uri.lower():
            import certifi

            kwargs["tlsCAFile"] = certifi.where()
        client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000, **kwargs)
        _default_db = client[os.getenv("MONGO_DB_NAME", "fillscore")]
    return _default_db


def _openai_client_factory(provider: Provider, api_key: str):
    from openai import AsyncOpenAI

    return AsyncOpenAI(
        base_url=provider.base_url,
        api_key=api_key,
        max_retries=0,  # the router owns retries (llm_client.call_with_retry)
        timeout=provider.timeout_s,
        default_headers=provider.headers or None,
    )


def _outcome_for(exc: BaseException) -> str:
    if is_timeout(exc):
        return "timeout"
    status = status_of(exc)
    if status is not None:
        return f"http_{status}"
    return f"error_{type(exc).__name__}"


# ── router ─────────────────────────────────────────────────────────────────────

class LLMRouter:
    def __init__(
        self,
        config: RouteConfig,
        usage_store,
        client_factory: Callable[[Provider, str], Any] = _openai_client_factory,
        env: Mapping[str, str] | None = None,
        sleep: Callable[[float], Any] | None = None,
        day_fn: Callable[[], str] = utc_day,
    ):
        self.config = config
        self.usage_store = usage_store
        self._client_factory = client_factory
        self._env = env
        self._sleep = sleep
        self._day_fn = day_fn
        self._clients: dict[str, Any] = {}

    # -- lookups --
    def _key(self, provider: Provider) -> str:
        env = self._env if self._env is not None else os.environ
        return (env.get(provider.key_env) or "").strip()

    def candidates(self, role: str) -> list[Candidate]:
        return [self.config.models[i] for i in self.config.roles.get(role, [])]

    def keyed_candidates(self, role: str) -> list[Candidate]:
        return [c for c in self.candidates(role) if self._key(self.config.providers[c.provider])]

    def _client(self, provider: Provider):
        if provider.name not in self._clients:
            self._clients[provider.name] = self._client_factory(provider, self._key(provider))
        return self._clients[provider.name]

    async def usage_today(self, provider: str, model: str) -> dict:
        return await self.usage_store.get(provider, model, self._day_fn())

    async def _room(self, c: Candidate) -> tuple[int, int]:
        used = await self.usage_today(c.provider, c.model)
        return c.daily_requests - used["requests"], c.daily_tokens - used["tokens"]

    async def _under_budget(self, c: Candidate) -> bool:
        requests_left, tokens_left = await self._room(c)
        return requests_left > 0 and tokens_left > 0

    async def capacity_problem(self) -> str | None:
        """None if a full run fits today's budgets, "no_provider" if some role has no keyed
        candidate (a configuration error), else "budget". Calls and tokens from run_estimate are
        reserved per candidate across roles, so roles sharing one model are counted together."""
        room: dict[str, list[int]] = {}
        for role, est in self.config.run_estimate.items():
            keyed = self.keyed_candidates(role)
            if not keyed:
                return "no_provider"
            calls = int(est.get("calls", 1))
            tokens = calls * int(est.get("tokens_per_call", 0))
            placed = False
            for c in keyed:
                if c.id not in room:
                    room[c.id] = list(await self._room(c))
                if room[c.id][0] >= calls and room[c.id][1] >= tokens:
                    room[c.id][0] -= calls
                    room[c.id][1] -= tokens
                    placed = True
                    break
            if not placed:
                return "budget"
        return None

    async def has_capacity(self) -> bool:
        return await self.capacity_problem() is None

    def describe(self) -> dict:
        """First keyed candidate per role (else first configured), for /health."""
        out = {}
        for role in self.config.roles:
            cands = self.keyed_candidates(role) or self.candidates(role)
            out[role] = cands[0].label if cands else "none"
        return out

    # -- the call --
    async def complete(
        self,
        role: str,
        system: str,
        user: str,
        schema: type[BaseModel],
        max_tokens: int,
        temperature: float = 0.1,
        telemetry: list | None = None,
    ) -> BaseModel:
        keyed = self.keyed_candidates(role)
        if not keyed:
            raise RouterExhausted(role, "no_provider")
        any_called = False
        for c in keyed:
            provider = self.config.providers[c.provider]
            client = self._client(provider)
            invalid = 0
            attempt = 0
            while True:
                if not await self._under_budget(c):
                    break
                any_called = True
                result = await self._attempt(role, c, client, system, user, schema, max_tokens,
                                             temperature, telemetry, attempt)
                attempt = result["attempt"]
                if result["parsed"] is not None:
                    return result["parsed"]
                if result["outcome"] == "invalid_json":
                    invalid += 1
                    if invalid < MAX_INVALID_REPLIES:
                        continue
                break  # this candidate is done: fall through to the next one
        raise RouterExhausted(role, "failed" if any_called else "budget")

    async def _attempt(self, role, c, client, system, user, schema, max_tokens, temperature, telemetry, attempt):
        state = {"attempt": attempt, "t0": _clock()}

        def record(outcome: str, usage: dict | None = None):
            usage = usage or {}
            if telemetry is not None:
                telemetry.append({
                    "role": role,
                    "provider": c.provider,
                    "model": c.model,
                    "attempt": state["attempt"],
                    "latency_ms": round((_clock() - state["t0"]) * 1000, 2),
                    "tokens": usage.get("total_tokens", 0),
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "outcome": outcome,
                })

        def on_error(exc, _n, _will_retry):
            record(_outcome_for(exc))
            state["t0"] = _clock()

        async def _call():
            state["attempt"] += 1
            kwargs = dict(
                model=c.model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                max_tokens=int(max_tokens * c.max_tokens_factor),
                temperature=temperature,
            )
            if c.extra_body:
                kwargs["extra_body"] = dict(c.extra_body)
            return await client.chat.completions.create(**kwargs)

        try:
            resp = await call_with_retry(_call, sleep=self._sleep, on_error=on_error)
        except Exception as exc:
            print(f"[router] {role} {c.label} failed: {type(exc).__name__} status={status_of(exc)}")
            return {"attempt": state["attempt"], "parsed": None, "outcome": _outcome_for(exc)}

        usage = usage_of(resp)
        try:
            await self.usage_store.add(c.provider, c.model, self._day_fn(), 1, usage["total_tokens"])
        except Exception as exc:  # a lost counter must not throw away a reply the model already gave
            print(f"[router] usage write failed: {type(exc).__name__}")

        try:
            content = resp.choices[0].message.content
        except Exception:
            content = None
        if not content or not str(content).strip():
            record("empty", usage)
            return {"attempt": state["attempt"], "parsed": None, "outcome": "empty"}

        parsed = extract_json_from_response(content)
        if parsed is not None:
            try:
                model_obj = schema.model_validate(parsed)
            except ValidationError:
                model_obj = None
        else:
            model_obj = None
        if model_obj is None:
            record("invalid_json", usage)
            return {"attempt": state["attempt"], "parsed": None, "outcome": "invalid_json"}

        record("ok", usage)
        return {"attempt": state["attempt"], "parsed": model_obj, "outcome": "ok"}


_default_router: LLMRouter | None = None


def get_default_router() -> LLMRouter:
    """The process-wide router: committed YAML routes, Mongo-persisted usage, real providers."""
    global _default_router
    if _default_router is None:
        _default_router = LLMRouter(load_routes(), usage_store=MongoUsageStore(_default_usage_db()))
    return _default_router

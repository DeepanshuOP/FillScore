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
import re
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
    """No candidate could answer. reason: "no_provider" | "budget" | "attempt_cap" | "failed"."""

    def __init__(self, role: str, reason: str):
        super().__init__(f"no model could answer role={role} ({reason})")
        self.role = role
        self.reason = reason


class AttemptCapReached(Exception):
    """The router's HTTP-attempt cap was hit before a request was sent (never retried)."""


class PacerSkip(Exception):
    """The pacer would make this call wait longer than pace_max_wait_s (never retried, not an HTTP attempt)."""

    def __init__(self, wait_s: float | None, max_wait_s: float):
        super().__init__("paced out")
        self.wait_s = wait_s
        self.max_wait_s = max_wait_s


# No limit configured anywhere (e.g. a minimal test config) means effectively unpaced.
_UNLIMITED = 10**9


class TokenBucketPacer:
    """Per-(provider, model) token + request buckets. Buckets start full and refill continuously.
    reserve() is synchronous (no await), so it is atomic under asyncio and parallel callers queue."""

    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self._clock = clock
        self._state: dict[tuple, dict] = {}

    def reserve(self, key: tuple, tpm: int, rpm: int, need_tokens: int, max_wait: float) -> float | None:
        if need_tokens > tpm:
            return None
        now = self._clock()
        st = self._state.get(key) or {"tok": float(tpm), "req": float(rpm), "last": now}
        dt = max(0.0, now - st["last"])
        tok_rate, req_rate = tpm / 60.0, rpm / 60.0
        tok = min(float(tpm), st["tok"] + tok_rate * dt)
        req = min(float(rpm), st["req"] + req_rate * dt)
        wait = max(0.0, (need_tokens - tok) / tok_rate, (1 - req) / req_rate)
        if wait > max_wait:
            return None
        self._state[key] = {"tok": tok - need_tokens, "req": req - 1, "last": now}
        return wait


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
    tpm: int = _UNLIMITED
    rpm: int = _UNLIMITED

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
    pace_max_wait_s: float = 20.0
    pace_max_wait_by_role: dict[str, float] = field(default_factory=dict)

    def max_wait_for(self, role: str) -> float:
        return self.pace_max_wait_by_role.get(role, self.pace_max_wait_s)

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
        raw_providers = raw.get("providers") or {}

        def limit(m, name):
            for src in (m, raw_providers[m["provider"]], defaults):
                if src.get(name) is not None:
                    return int(src[name])
            return _UNLIMITED

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
                tpm=limit(m, "tpm"),
                rpm=limit(m, "rpm"),
            )
        roles = {role: list(ids) for role, ids in (raw.get("roles") or {}).items()}
        for role, ids in roles.items():
            for model_id in ids:
                if model_id not in models:
                    raise ValueError(f"llm_routes: role {role} names unknown model {model_id}")
        by_role = {r: float(v) for r, v in (raw.get("pace_max_wait_s_by_role") or {}).items()}
        for role in by_role:
            if role not in roles:
                raise ValueError(f"llm_routes: pace_max_wait_s_by_role names unknown role {role}")
        canonical = json.dumps(raw, sort_keys=True, default=str)
        return cls(
            providers=providers,
            models=models,
            roles=roles,
            run_estimate=dict(raw.get("run_estimate") or {}),
            hash=hashlib.sha256(canonical.encode()).hexdigest()[:16],
            pace_max_wait_s=float(defaults.get("pace_max_wait_s", 20)),
            pace_max_wait_by_role=by_role,
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


class LLMCallBlocked(RuntimeError):
    """FILLSCORE_E2E_NO_LLM=1: an LLM provider call was attempted where none is allowed (e2e runs)."""


def _openai_client_factory(provider: Provider, api_key: str):
    # E2E guard: the browser specs must never reach a provider. The flag only ever blocks calls; it
    # cannot enable anything, so setting it in another environment can at worst disable the Council.
    if os.environ.get("FILLSCORE_E2E_NO_LLM") == "1":
        raise LLMCallBlocked(f"LLM call blocked by FILLSCORE_E2E_NO_LLM (provider={provider.name})")
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


_FIELD_SEG = re.compile(r"[A-Za-z_]+")


def _safe_loc(loc) -> str:
    """A loc path with every segment the model could have chosen masked as "*": list indices and
    digit-free identifiers (schema field names) are kept; dict keys / extra keys such as
    "save 42" or "saved_42_usd" are model text and may carry numerals, so they are masked."""
    return ".".join(str(p) if isinstance(p, int) or _FIELD_SEG.fullmatch(str(p)) else "*" for p in loc)


def _validation_error(ve: ValidationError) -> dict:
    """loc + type only: msg/input/ctx can echo LLM text (and numerals), so they are never kept."""
    errs = ve.errors()
    return {
        "kind": "validation",
        "errors": [{"loc": _safe_loc(e["loc"]), "type": str(e["type"])} for e in errs[:5]],
        "n_errors": len(errs),
    }


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
        pace_clock: Callable[[], float] = time.monotonic,
    ):
        self.config = config
        self.usage_store = usage_store
        self._client_factory = client_factory
        self._env = env
        self._sleep = sleep
        self._day_fn = day_fn
        self._clients: dict[str, Any] = {}
        self.pacer = TokenBucketPacer(pace_clock)
        self.paced_wait_s = 0.0
        # Optional process-wide hard cap on HTTP attempts (retries included), used by live scripts
        # with a fixed call budget. Once reached, complete() raises RouterExhausted(reason="attempt_cap")
        # and no further request is sent. None = no cap.
        self.http_attempt_cap: int | None = None
        self.http_attempts = 0

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

    def _cap_reached(self) -> bool:
        return self.http_attempt_cap is not None and self.http_attempts >= self.http_attempt_cap

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
                if self._cap_reached():
                    raise RouterExhausted(role, "attempt_cap")
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

        def record(outcome: str, usage: dict | None = None, error: dict | None = None):
            usage = usage or {}
            if telemetry is not None:
                entry = {
                    "role": role,
                    "provider": c.provider,
                    "model": c.model,
                    "attempt": state["attempt"],
                    "latency_ms": round((_clock() - state["t0"]) * 1000, 2),
                    "tokens": usage.get("total_tokens", 0),
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "outcome": outcome,
                }
                if error is not None:
                    entry["error"] = error
                telemetry.append(entry)

        def on_error(exc, _n, _will_retry):
            if isinstance(exc, PacerSkip):
                return
            record(_outcome_for(exc))
            state["t0"] = _clock()

        async def _call():
            sent_max_tokens = int(max_tokens * c.max_tokens_factor)
            need = (len(system) + len(user)) // 4 + sent_max_tokens
            max_wait = self.config.max_wait_for(role)
            wait = self.pacer.reserve((c.provider, c.model), c.tpm, c.rpm, need, max_wait)
            if wait is None:
                raise PacerSkip(None, max_wait)
            if self._cap_reached():
                raise AttemptCapReached()
            if wait > 0:
                self.paced_wait_s += wait
                await (self._sleep or asyncio.sleep)(wait)
            self.http_attempts += 1
            state["attempt"] += 1
            kwargs = dict(
                model=c.model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                max_tokens=sent_max_tokens,
                temperature=temperature,
            )
            if c.extra_body:
                kwargs["extra_body"] = dict(c.extra_body)
            return await client.chat.completions.create(**kwargs)

        try:
            resp = await call_with_retry(_call, sleep=self._sleep, on_error=on_error)
        except PacerSkip as exc:
            if telemetry is not None:
                telemetry.append({
                    "role": role, "provider": c.provider, "model": c.model, "attempt": state["attempt"],
                    "latency_ms": 0, "tokens": 0, "prompt_tokens": 0, "completion_tokens": 0,
                    "outcome": "paced_skip",
                })
            print(f"[router] {role} {c.label} paced: wait > {exc.max_wait_s:g}s, trying next")
            return {"attempt": state["attempt"], "parsed": None, "outcome": "paced_skip"}
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
        error: dict | None = None
        if parsed is not None:
            try:
                model_obj = schema.model_validate(parsed)
            except ValidationError as ve:
                model_obj = None
                error = _validation_error(ve)
        else:
            model_obj = None
            error = {"kind": "no_json"}
        if model_obj is None:
            record("invalid_json", usage, error)
            detail = ",".join(f"{e['loc']}:{e['type']}" for e in error.get("errors", []))
            print(f"[router] {role} {c.label} invalid reply: {error['kind']} {detail}".rstrip())
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

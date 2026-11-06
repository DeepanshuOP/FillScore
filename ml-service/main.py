"""FillScore ML Microservice — FastAPI entry point.

Serves the Agent Council and health endpoints on port 8000.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import JSONResponse, StreamingResponse
import asyncio, json
from datetime import datetime, timezone

_PROCESS_START = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient

from agents.schemas import CouncilResult
from config.startup_guard import assert_no_e2e_flag_in_production

assert_no_e2e_flag_in_production()

# ---------------------------------------------------------------------------
# Auth Guard
# ---------------------------------------------------------------------------
from fastapi.security import HTTPBearer
import jwt

security = HTTPBearer(auto_error=False)

from config.demo_users import VALID_DEMO_USERS
from config.flags import council_enabled, council_maintenance_message
from config.budget import council_budget
from agents.errors import (
    CouncilError, classify_exception, safe_message,
    RATE_LIMIT_EXHAUSTED, DAILY_BUDGET_EXHAUSTED, NO_DATA, DEMO_NOT_GENERATED, DB_UNAVAILABLE, MODEL_UNAVAILABLE,
)

def get_account_id(requested_user_id: str | None, req: Request) -> str:
    if requested_user_id:
        if requested_user_id in VALID_DEMO_USERS:
            req.state.account_id = requested_user_id   # read by the request-log middleware (hashed there)
            return requested_user_id
        else:
            raise HTTPException(status_code=403, detail="Forbidden: Invalid userId or unauthorized access")
    
    auth_header = req.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_ACCESS_SECRET, algorithms=["HS256"])
        # Only backend access tokens (typ "access", F-27): never refresh or other tokens on this secret
        if payload.get("typ") != "access":
            raise ValueError("wrong token type")
        req.state.account_id = payload["userId"]
        return payload["userId"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired access token")

# Env files: see config/env_loader.py for precedence (real environment > backend/.env for shared keys > ml-service/.env)
from config.env_loader import load_service_env

load_service_env(
    os.path.join(os.path.dirname(__file__), ".env"),
    os.path.join(os.path.dirname(__file__), "..", "backend", ".env"),
)

from observability.sentry_init import init_sentry

init_sentry()  # no-op unless SENTRY_DSN is set

JWT_ACCESS_SECRET = os.environ.get("JWT_ACCESS_SECRET", "")
if not JWT_ACCESS_SECRET:
    raise RuntimeError("JWT_ACCESS_SECRET is required but missing or empty. Fast-failing at startup.")


# ---------------------------------------------------------------------------
# MongoDB connection (lazy, reused)
# ---------------------------------------------------------------------------

_mongo_client: MongoClient | None = None
_db = None


def _mongo_client_kwargs(uri: str) -> dict:
    """certifi's CA bundle only for TLS URIs (SRV, or tls/ssl=true): passing tlsCAFile turns TLS on, which a
    plain local mongod never answers. 5 s server selection so /ready fails fast instead of after 30 s."""
    kwargs: dict = {"serverSelectionTimeoutMS": 5000}
    low = uri.lower()
    if low.startswith("mongodb+srv://") or "tls=true" in low or "ssl=true" in low:
        import certifi

        kwargs["tlsCAFile"] = certifi.where()
    return kwargs


def _get_db():
    """Return the fillscore MongoDB database handle."""
    global _mongo_client, _db
    if _db is None:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/fillscore")
        _mongo_client = MongoClient(uri, **_mongo_client_kwargs(uri))
        db_name = uri.rsplit("/", 1)[-1].split("?")[0] if "/" in uri else "fillscore"
        _db = _mongo_client[db_name]
    return _db


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup / shutdown lifecycle."""
    from agents import debug_sink
    if debug_sink.refused():
        print("[debug-sink] FILLSCORE_GROUNDING_DEBUG ignored: FILLSCORE_DEPLOY=1")
    yield
    global _mongo_client
    if _mongo_client is not None:
        _mongo_client.close()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="FillScore ML Service",
    description="Agent Council & ML analytics for crypto trade execution quality",
    version="0.1.0",
    lifespan=lifespan,
)

_allowed_origins_raw = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
_allowed_origins = [o.strip() for o in _allowed_origins_raw.split(",") if o.strip()]

from observability.request_log import install_request_log

install_request_log(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class CouncilRequest(BaseModel):
    userId: str | None = None
    symbol: str


class HealthResponse(BaseModel):
    status: str
    models: dict
    flags: dict


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Service health check: the first routed model per role (no LLM call, no DB call)."""
    from agents.llm_router import get_default_router
    routes = get_default_router().describe()
    return HealthResponse(
        status="ok",
        models={
            "specialists": routes.get("specialist", "none"),
            "debate": routes.get("debate", "none"),
            "synthesis": routes.get("synthesis", "none"),
        },
        flags={"council_enabled": council_enabled()},
    )


def _council_maintenance_response() -> JSONResponse:
    return JSONResponse(
        status_code=503,
        headers={"Retry-After": "300"},
        content={"status": "unavailable", "feature": "council", "detail": council_maintenance_message()},
    )


@app.get("/version")
async def version() -> dict:
    """Service version, sourced from the FastAPI app's own version string."""
    # RENDER_GIT_COMMIT is a default Render env var; builtAt is the process start time.
    return {"version": app.version, "commit": os.environ.get("RENDER_GIT_COMMIT") or "unknown", "builtAt": _PROCESS_START}


@app.get("/ready")
async def ready() -> JSONResponse:
    """Readiness check: Mongo reachable and GROQ_API_KEY configured.

    A presence check on GROQ_API_KEY (not a live Groq call) matches how
    JWT_ACCESS_SECRET is validated at startup — no quota burned per probe.
    """
    checks = {"mongo": False, "groq_api_key": bool(os.environ.get("GROQ_API_KEY"))}
    try:
        db = _get_db()
        await asyncio.to_thread(db.client.admin.command, "ping")   # sync driver: keep the event loop free
        checks["mongo"] = True
    except Exception:
        checks["mongo"] = False

    is_ready = all(checks.values())
    return JSONResponse(
        status_code=200 if is_ready else 503,
        content={"status": "ready" if is_ready else "not ready", "checks": checks},
    )


_HTTP_STATUS_FOR_CODE = {
    NO_DATA: 404,
    DEMO_NOT_GENERATED: 404,
    RATE_LIMIT_EXHAUSTED: 429,
    DAILY_BUDGET_EXHAUSTED: 429,
    DB_UNAVAILABLE: 503,
    MODEL_UNAVAILABLE: 503,
}


@app.post("/ml/agents/council", response_model=CouncilResult)
async def council_endpoint(req: CouncilRequest, request: Request) -> CouncilResult:
    """Run the Agent Council (same pipeline as the stream endpoint, without events)."""
    if not council_enabled():
        return _council_maintenance_response()
    account_id = get_account_id(req.userId, request)
    from agents.council_service import council_flow
    try:
        return await council_flow(account_id, req.symbol)
    except Exception as e:
        code = classify_exception(e)
        print(f"[council] failed code={code} type={type(e).__name__}")
        headers = None
        retry_after = getattr(e, "retry_after_s", None)
        if retry_after:
            headers = {"Retry-After": str(retry_after)}
        raise HTTPException(
            status_code=_HTTP_STATUS_FOR_CODE.get(code, 500),
            detail={"code": code, "message": safe_message(code)},
            headers=headers,
        )


@app.get("/ml/agents/council/runs")
async def list_runs(request: Request, userId: str = None, symbol: str = None, limit: int = 20):
    account_id = get_account_id(userId, request)
    from agents.persistence import list_council_runs
    runs = await list_council_runs(account_id, symbol, limit)
    return {"runs": runs, "count": len(runs)}

@app.get("/ml/agents/council/runs/{run_id}")
async def get_run(run_id: str, request: Request, userId: str = None):
    account_id = get_account_id(userId, request)
    from agents.persistence import load_council_run
    run = await load_council_run(run_id, account_id)
    if not run:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return run

@app.get("/ml/agents/council/telemetry")
async def get_telemetry(request: Request, userId: str = None):
    account_id = get_account_id(userId, request)
    from agents.persistence import get_telemetry_summary
    return await get_telemetry_summary(account_id)

@app.post("/ml/agents/council/stream")
async def council_stream(request: CouncilRequest, req: Request):
    """
    SSE view of the same pipeline as POST /ml/agents/council. The events come from hooks inside
    agents.council.run_council_pipeline; the final `complete` event carries the full result,
    identical to the non-stream response.
    """
    if not council_enabled():
        return _council_maintenance_response()
    account_id = get_account_id(request.userId, req)
    symbol = request.symbol
    from agents.council_service import council_flow

    def sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()

        async def sink(event: str, data: dict) -> None:
            await queue.put((event, data))

        async def runner():
            try:
                await council_flow(account_id, symbol, on_event=sink)
            except Exception as e:
                code = classify_exception(e)
                # Class name only: exception text can contain connection strings or credentials
                print(f"[council] stream failed code={code} type={type(e).__name__}")
                await queue.put(("error", {"code": code, "message": safe_message(code)}))
            finally:
                await queue.put(None)

        task = asyncio.create_task(runner())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield sse(*item)
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

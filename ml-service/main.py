"""FillScore ML Microservice — FastAPI entry point.

Serves the Agent Council and health endpoints on port 8000.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import JSONResponse, StreamingResponse
import asyncio, json
from datetime import datetime, timezone

_PROCESS_START = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
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
    CouncilError, classify_exception, safe_message, refusal_message,
    RATE_LIMIT_EXHAUSTED, DAILY_BUDGET_EXHAUSTED, NO_DATA, DEMO_NOT_GENERATED, DB_UNAVAILABLE, MODEL_UNAVAILABLE, ASK_NOT_AVAILABLE_FOR_DEMO,
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
    from observability import tracing
    print(f"[tracing] langfuse export: {'on' if tracing.init_tracing() else 'off'}")
    yield
    tracing.shutdown_tracing()
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

# The CSV check body is refused above 400,000 bytes before it is read (a file may hold 200,000 characters; JSON escapes add some).
from csv_import.bodylimit import BodyLimitMiddleware
app.add_middleware(BodyLimitMiddleware, path="/ml/csv/check", limit=400_000)


from fastapi.exceptions import RequestValidationError


@app.exception_handler(RequestValidationError)
async def _validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """A 422 names the field and the rule, never the value: the default body echoes the whole input (a CSV file would come back in full)."""
    return JSONResponse(status_code=422, content={"detail": [{"loc": list(e.get("loc", ())), "msg": e.get("msg", ""), "type": e.get("type", "")} for e in exc.errors()]})


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

MEASURE_TOKEN_MAX_TTL_S = 300
SERVICE_SECRET_MIN_LEN = 32


def _service_token_secret() -> str | None:
    """ML_SERVICE_TOKEN_SECRET, read per call. None (fail closed) when missing, shorter than 32 characters, or equal
    to JWT_ACCESS_SECRET: the service token has its own key, so a leaked user-token secret cannot mint it (M1.1)."""
    s = os.environ.get("ML_SERVICE_TOKEN_SECRET", "")
    if len(s) < SERVICE_SECRET_MIN_LEN or s == JWT_ACCESS_SECRET:
        return None
    return s


def get_measure_account(req: Request) -> str:
    """Service-to-service auth for /internal/*: a token the backend signs on ML_SERVICE_TOKEN_SECRET with typ
    "measure", an accountId, and an expiry at most 5 minutes after issue. Without a usable secret every call is
    refused with 503. User tokens are refused here, and measure tokens are refused by get_account_id (it accepts
    typ "access" only, on another secret). ADR-0011, amended in M1.1."""
    auth_header = req.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    secret = _service_token_secret()      # checked after the header, so a caller without a token learns nothing
    if secret is None:
        raise HTTPException(status_code=503, detail="Service token not configured")
    try:
        payload = jwt.decode(auth_header.split(" ", 1)[1], secret, algorithms=["HS256"],
                             options={"require": ["exp"]})
        if payload.get("typ") != "measure" or not isinstance(payload.get("accountId"), str):
            raise ValueError("wrong token type")
        iat = payload.get("iat")
        import time as _time
        start = iat if isinstance(iat, (int, float)) else _time.time()
        if payload["exp"] - start > MEASURE_TOKEN_MAX_TTL_S:
            raise ValueError("token lives too long")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid service token")
    return payload["accountId"]


class MeasureRequest(BaseModel):
    accountId: str


@app.post("/internal/measure")
async def internal_measure(body: MeasureRequest, request: Request) -> dict:
    """Measure the account's pending fills and orders (measurement v2). Called by the backend after a sync."""
    account_id = get_measure_account(request)
    if body.accountId != account_id:
        raise HTTPException(status_code=403, detail="Token is for another account")
    request.state.account_id = account_id
    import time as _time
    from starlette.concurrency import run_in_threadpool
    import measure.service as svc
    from expected_cost.runtime import kline_expected_cost_hook
    # Cost vs expected for real accounts: the hour before each order comes from Binance public 1-minute klines (no key).
    return await run_in_threadpool(svc.measure_account, _get_db(), account_id, svc.rest_source, int(_time.time() * 1000),
                                   expected_cost=kline_expected_cost_hook())


def _service_account(body: MeasureRequest, request: Request) -> str:
    account_id = get_measure_account(request)
    if body.accountId != account_id:
        raise HTTPException(status_code=403, detail="Token is for another account")
    if account_id.startswith("demo-"):
        raise HTTPException(status_code=400, detail="Demo accounts are not scored under v2")
    request.state.account_id = account_id
    return account_id


@app.post("/internal/score-v2")
async def internal_score_v2(body: MeasureRequest, request: Request) -> dict:
    """Score the account under the current ScoringVersion from its stored measurements; store and return it."""
    account_id = _service_account(body, request)
    import time as _time
    from starlette.concurrency import run_in_threadpool
    from config.versions import SCORING_V2_VERSION
    import scoring_v2.version as ver
    from scoring_v2.score import score_account_v2

    def run():
        doc = score_account_v2(_get_db(), account_id, ver.load_version(SCORING_V2_VERSION),
                               ver.version_file_sha256(SCORING_V2_VERSION), int(_time.time() * 1000))
        # Cost vs expected (M3 §2) for this account's own measured orders: stored beside the grade, outside its integrity hash
        # (the score never reads it). Fewer than 20 usable market orders: "insufficient data".
        from expected_cost.aggregate import cost_vs_expected
        rows = list(_get_db().order_measurements.find({"accountId": account_id}, {"shortfall": 1, "expectedCost": 1}))
        doc["costVsExpected"] = cost_vs_expected(rows)
        _get_db().scores_v2.insert_one(dict(doc))
        doc["computedAt"] = doc["computedAt"].isoformat()
        return doc

    return await run_in_threadpool(run)


@app.post("/internal/verify-v2")
async def internal_verify_v2(body: MeasureRequest, request: Request) -> dict:
    """Recompute the latest stored v2 score's integrity hash from the stored inputs and the version file."""
    account_id = _service_account(body, request)
    from starlette.concurrency import run_in_threadpool
    from config.versions import SCORING_V2_VERSION
    import scoring_v2.version as ver
    from scoring_v2.score import verify_account_v2

    out = await run_in_threadpool(lambda: verify_account_v2(_get_db(), account_id, ver.load_version(SCORING_V2_VERSION),
                                                            ver.version_file_sha256(SCORING_V2_VERSION)))
    if out is None:
        raise HTTPException(status_code=404, detail="No v2 score stored for this account")
    return out


class AskRequest(BaseModel):
    userId: str | None = None                       # only a demo id is accepted here (and refused: no model runs for demo data)
    question: str = Field(max_length=2000)


class CouncilRequest(BaseModel):
    userId: str | None = None
    symbol: str
    # "quick": one model call (the product default; the dashboard sends it). "deep": the 9-call Council, opt-in and budgeted.
    # A request without a mode keeps the Council behaviour that older callers (evals, scripts) rely on.
    mode: Literal["quick", "deep"] = "deep"


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
    ASK_NOT_AVAILABLE_FOR_DEMO: 403,
    RATE_LIMIT_EXHAUSTED: 429,
    DAILY_BUDGET_EXHAUSTED: 429,
    DB_UNAVAILABLE: 503,
    MODEL_UNAVAILABLE: 503,
}


@app.post("/ml/agents/council", response_model=None)
async def council_endpoint(req: CouncilRequest, request: Request) -> Any:
    """Run one audit (same pipeline as the stream endpoint, without events). mode "deep": a CouncilResult; mode "quick":
    the single-call result (`mode: "quick"`, no specialist verdicts)."""
    if not council_enabled():
        return _council_maintenance_response()
    account_id = get_account_id(req.userId, request)
    from agents.council_service import council_flow
    try:
        return await council_flow(account_id, req.symbol, mode=req.mode)
    except Exception as e:
        code = classify_exception(e)
        print(f"[council] failed code={code} type={type(e).__name__}")
        headers = None
        retry_after = getattr(e, "retry_after_s", None)
        if retry_after:
            headers = {"Retry-After": str(retry_after)}
        quick_available = getattr(e, "quick_available", None)
        detail = {"code": code, "message": refusal_message(code, quick_available)}
        if quick_available is not None:
            detail["quick_available"] = quick_available
        raise HTTPException(
            status_code=_HTTP_STATUS_FOR_CODE.get(code, 500),
            detail=detail,
            headers=headers,
        )


class CsvCheckRequest(BaseModel):
    format: Literal["kraken", "mapped"]
    csv: str = Field(max_length=300_000)             # a hard guard; the service refuses more than 200,000 characters with its own message
    mapping: dict[str, str] | None = None


@app.post("/ml/csv/check")
async def csv_check_endpoint(req: CsvCheckRequest, request: Request) -> Any:
    """Check a broker CSV (M6 §1): each fill against the public price at its second. Signed-in accounts only (a demo account is refused);
    6 checks an hour and 20 a day per account; nothing is stored; no row of the file is logged or returned in an error."""
    account_id = get_account_id(None, request)
    if account_id in VALID_DEMO_USERS:
        raise HTTPException(status_code=403, detail={"code": "demo_account", "message": "Demo accounts cannot check a file."})
    from csv_import import gate, route_budget
    busy = lambda msg: HTTPException(status_code=429, detail={"code": "csv_check_busy", "message": msg})
    pause = gate.cooling()
    if pause is not None:       # the market-data source asked for a pause: no check fetches anything until it is over
        raise HTTPException(status_code=503, headers={"Retry-After": str(pause)}, detail={
            "code": "market_data_busy", "message": "The public market-data source asked for a pause. Try again in a few minutes."})
    # The slot is reserved before the work starts, so parallel requests cannot all pass; it is given back only for a refusal that happened
    # before any market data was fetched (a bad file, or a source that asked for a pause).
    status, wait = route_budget.reserve(account_id)
    if status == "busy":
        raise busy("A check of yours is still running. Wait for it to finish.")
    if status == "limit":
        raise HTTPException(status_code=429, headers={"Retry-After": str(wait)}, detail={
            "code": "csv_check_limit", "message": f"At most {route_budget.PER_HOUR} checks an hour and {route_budget.PER_DAY} a day. Try again later."})
    if not gate.try_enter():
        route_budget.release(account_id, refund=True)
        raise busy("The service is busy with other checks. Try again in a minute.")
    from starlette.concurrency import run_in_threadpool
    import measure.service as svc
    from csv_import.service import CsvCheckError, run_check
    refund = False
    try:
        return await run_in_threadpool(run_check, req.format, req.csv, req.mapping, svc.rest_source)
    except CsvCheckError as e:
        refund = True
        extra = dict(e.extra)
        retry = extra.pop("retry_after", None)
        status_code = 413 if e.code == "file_too_large" else 503 if e.code == "market_data_busy" else 400
        raise HTTPException(status_code=status_code, headers={"Retry-After": str(retry)} if retry else None,
                            detail={"code": e.code, "message": e.message, **extra})
    except Exception as e:      # nothing about the file or the cause is returned or logged beyond the error class
        print(f"[csv_check] failed type={type(e).__name__}")
        raise HTTPException(status_code=500, detail={"code": "internal", "message": "The file could not be checked."})
    finally:
        gate.leave()
        route_budget.release(account_id, refund=refund)


@app.post("/ml/agents/ask")
async def ask_endpoint(req: AskRequest, request: Request) -> Any:
    """Ask your execution (M5): a question about the caller's own past executions, answered from deterministic tools only. The
    answer's numbers are tool values; advice, causes, links and markup are removed in code. Demo accounts are refused."""
    if not council_enabled():
        return _council_maintenance_response()
    account_id = get_account_id(req.userId, request)
    from agents.ask_service import ask_account
    try:
        return await ask_account(account_id, req.question)
    except Exception as e:
        code = classify_exception(e)
        print(f"[ask] failed code={code} type={type(e).__name__}")
        headers = None
        retry_after = getattr(e, "retry_after_s", None)
        if retry_after:
            headers = {"Retry-After": str(retry_after)}
        raise HTTPException(status_code=_HTTP_STATUS_FOR_CODE.get(code, 500), detail={"code": code, "message": safe_message(code)}, headers=headers)


@app.get("/ml/agents/council/budget")
async def council_budget_status(request: Request, userId: str = None):
    """What is left of the audit budget for this account and for the day, in units (Deep 9, Quick 1), and whether one more
    Deep or Quick audit would be allowed now. A demo account never runs live."""
    account_id = get_account_id(userId, request)
    body = council_budget.status(account_id)
    if account_id in VALID_DEMO_USERS:
        body = {**body, "demo": True}
    return body


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
                await council_flow(account_id, symbol, on_event=sink, mode=request.mode)
            except Exception as e:
                code = classify_exception(e)
                # Class name only: exception text can contain connection strings or credentials
                print(f"[council] stream failed code={code} type={type(e).__name__}")
                quick_available = getattr(e, "quick_available", None)
                payload = {"code": code, "message": refusal_message(code, quick_available)}
                if quick_available is not None:
                    payload["quick_available"] = quick_available
                await queue.put(("error", payload))
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

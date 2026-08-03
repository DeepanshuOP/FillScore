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
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient

from agents.council import run_council
from agents.schemas import CouncilResult, TradeContext

# ---------------------------------------------------------------------------
# Auth Guard
# ---------------------------------------------------------------------------
from fastapi.security import HTTPBearer
import jwt

security = HTTPBearer(auto_error=False)

from config.demo_users import VALID_DEMO_USERS

def get_account_id(requested_user_id: str | None, req: Request) -> str:
    if requested_user_id:
        if requested_user_id in VALID_DEMO_USERS:
            return requested_user_id
        else:
            raise HTTPException(status_code=403, detail="Forbidden: Invalid userId or unauthorized access")
    
    auth_header = req.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_ACCESS_SECRET, algorithms=["HS256"])
        return payload["userId"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired access token")

# Load env: ml-service/.env first (ANTHROPIC_API_KEY), then backend/.env (MONGODB_URI)
_ml_env = os.path.join(os.path.dirname(__file__), ".env")
_backend_env = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
for _env_path in [_ml_env, _backend_env]:
    try:
        load_dotenv(_env_path, override=False)
    except (ValueError, UnicodeDecodeError):
        pass

JWT_ACCESS_SECRET = os.environ.get("JWT_ACCESS_SECRET", "")
if not JWT_ACCESS_SECRET:
    raise RuntimeError("JWT_ACCESS_SECRET is required but missing or empty. Fast-failing at startup.")


# ---------------------------------------------------------------------------
# MongoDB connection (lazy, reused)
# ---------------------------------------------------------------------------

_mongo_client: MongoClient | None = None
_db = None


def _get_db():
    """Return the fillscore MongoDB database handle."""
    global _mongo_client, _db
    if _db is None:
        import certifi

        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/fillscore")
        _mongo_client = MongoClient(uri, tlsCAFile=certifi.where())
        db_name = uri.rsplit("/", 1)[-1].split("?")[0] if "/" in uri else "fillscore"
        _db = _mongo_client[db_name]
    return _db


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup / shutdown lifecycle."""
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Service health check with model info."""
    from agents.llm_client import SPECIALIST_MODEL, SYNTHESIS_MODEL, SYNTHESIS_PROVIDER
    return HealthResponse(
        status="ok",
        models={
            "specialists": f"{SPECIALIST_MODEL} (Groq)",
            "synthesis": f"{SYNTHESIS_MODEL} ({SYNTHESIS_PROVIDER})",
        },
    )


@app.get("/version")
async def version() -> dict:
    """Service version, sourced from the FastAPI app's own version string."""
    return {"version": app.version}


@app.get("/ready")
async def ready() -> JSONResponse:
    """Readiness check: Mongo reachable and GROQ_API_KEY configured.

    A presence check on GROQ_API_KEY (not a live Groq call) matches how
    JWT_ACCESS_SECRET is validated at startup — no quota burned per probe.
    """
    checks = {"mongo": False, "groq_api_key": bool(os.environ.get("GROQ_API_KEY"))}
    try:
        db = _get_db()
        db.client.admin.command("ping")
        checks["mongo"] = True
    except Exception:
        checks["mongo"] = False

    is_ready = all(checks.values())
    return JSONResponse(
        status_code=200 if is_ready else 503,
        content={"status": "ready" if is_ready else "not ready", "checks": checks},
    )


@app.post("/ml/agents/council", response_model=CouncilResult)
async def council_endpoint(req: CouncilRequest, request: Request) -> CouncilResult:
    """Run the Agent Council for a user's trade data."""
    account_id = get_account_id(req.userId, request)
    db = _get_db()

    # Fetch the user's most recent audit
    audit = db.audits.find_one(
        {"accountId": account_id},
        sort=[("period.start", -1)],
    )
    if audit is None:
        raise HTTPException(status_code=404, detail=f"No audit found for accountId={account_id}")

    result = await run_council(account_id, account_id, req.symbol)
    return result


@app.get("/ml/agents/council/runs")
async def list_runs(request: Request, userId: str = None, symbol: str = None, limit: int = 20):
    account_id = get_account_id(userId, request)
    from agents.persistence import list_council_runs
    runs = await list_council_runs(account_id, symbol, limit)
    return {"runs": runs, "count": len(runs)}

@app.get("/ml/agents/council/runs/{run_id}")
async def get_run(run_id: str, request: Request):
    account_id = get_account_id(None, request)
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
    SSE endpoint for streaming council results.
    """
    account_id = get_account_id(request.userId, req)
    symbol = request.symbol

    async def event_generator():
        import time
        start = time.time()

        def sse(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(data)}\n\n"

        try:
            # Load packets first
            from agents.metrics.loader import load_all_packets
            fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt = await load_all_packets(account_id, symbol)

            from agents.schemas import TradeContext
            context = TradeContext(
                userId=account_id, symbol=symbol, regime="STABLE",
                fee_packet_hash=fee_pkt.content_hash,
                risk_packet_hash=risk_pkt.content_hash,
                liquidity_packet_hash=liquidity_pkt.content_hash,
                alpha_packet_hash=alpha_pkt.content_hash,
            )

            # Import agents
            from agents import liquidity_scout, alpha_architect, risk_auditor, fee_optimizer, synthesis
            from agents.llm_client import get_groq_client, get_openrouter_client, SYNTHESIS_MODEL, SYNTHESIS_PROVIDER
            groq_client = get_groq_client()

            # Run specialists sequentially for SSE (so we can fire events as each completes)
            # This is streaming mode — parallel mode is for the non-streaming endpoint
            agents_config = [
                ("liquidity_scout", liquidity_scout.run, liquidity_pkt),
                ("alpha_architect", alpha_architect.run, alpha_pkt),
                ("risk_auditor",    risk_auditor.run,    risk_pkt),
                ("fee_optimizer",   fee_optimizer.run,   fee_pkt),
            ]

            verdicts = {}
            for agent_name, agent_fn, packet in agents_config:
                yield sse("agent_start", {"agent": agent_name, "timestamp": time.time()})
                verdict = await agent_fn(context, groq_client, packet)
                verdicts[agent_name] = verdict

                # Summarise verdict for the event (no raw packet data)
                verdict_dict = verdict.model_dump()
                yield sse("agent_done", {
                    "agent": agent_name,
                    "rating": verdict_dict.get(
                        next((k for k in ["liquidityRating","alphaRating","riskLevel","feeRating"] if k in verdict_dict), ""),
                        "UNKNOWN"
                    ),
                    "confidence": verdict_dict.get("confidence", 0),
                    "severity": verdict_dict.get("severity", "MEDIUM"),
                    "cited_evidence_count": len(verdict_dict.get("cited_evidence", [])),
                    "flags": verdict_dict.get("flags", []),
                })

            # Execution Trial debate (before synthesis)
            yield sse("debate_started", {"message": "Execution Trial in progress", "max_rounds": 2})
            from agents.debate import run_debate, transcript_to_dict as debate_transcript_to_dict
            debate_transcript = await run_debate(
                liquidity_packet=liquidity_pkt.to_prompt_dict(),
                risk_packet=risk_pkt.to_prompt_dict(),
                fee_packet=fee_pkt.to_prompt_dict(),
                alpha_packet=alpha_pkt.to_prompt_dict(),
                groq_client=groq_client,
            )
            debate_dict = debate_transcript_to_dict(debate_transcript)
            yield sse("debate_done", {
                "round_count": debate_dict["round_count"],
                "prosecution_summary": debate_dict["prosecution_summary"],
                "defense_summary": debate_dict["defense_summary"],
                "key_dispute": debate_dict["key_dispute"],
                "claim_count": len(debate_dict["claims"]),
            })

            # Synthesis (judge reads debate transcript)
            yield sse("agent_start", {"agent": "synthesis", "timestamp": time.time()})
            if SYNTHESIS_PROVIDER == "openrouter":
                synth_client = get_openrouter_client()
            else:
                synth_client = get_groq_client()

            synth_verdict = await synthesis.run(
                context,
                {k: v.model_dump() for k, v in verdicts.items()},
                synth_client,
                fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt,
                debate_dict=debate_dict,
            )
            yield sse("synthesis_done", {
                "headline": synth_verdict.headline,
                "overallRating": synth_verdict.overallRating,
                "topRecommendations": synth_verdict.topRecommendations,
                "estimatedMonthlyCostUSD": synth_verdict.estimatedMonthlyCostUSD,
            })

            # Verification gate
            from agents.verification import verify_recommendations, gate_report_to_dict
            gate_report = verify_recommendations(
                recommendations=synth_verdict.topRecommendations,
                fee_packet=fee_pkt.to_prompt_dict(),
                risk_packet=risk_pkt.to_prompt_dict(),
                liquidity_packet=liquidity_pkt.to_prompt_dict(),
                alpha_packet=alpha_pkt.to_prompt_dict(),
            )
            gate_dict = gate_report_to_dict(gate_report)
            yield sse("gate_done", {"gate_report": gate_dict})

            # Grounding check
            from agents.grounding import check_all_verdicts, summarise_grounding
            grounding_reports = check_all_verdicts(
                liquidity_cited=verdicts["liquidity_scout"].cited_evidence,
                liquidity_reasoning=verdicts["liquidity_scout"].slippageRoot,
                liquidity_packet=liquidity_pkt.to_prompt_dict(),
                alpha_cited=verdicts["alpha_architect"].cited_evidence,
                alpha_reasoning=verdicts["alpha_architect"].bestAlternative,
                alpha_packet=alpha_pkt.to_prompt_dict(),
                risk_cited=verdicts["risk_auditor"].cited_evidence,
                risk_reasoning=" ".join(verdicts["risk_auditor"].flags),
                risk_packet=risk_pkt.to_prompt_dict(),
                fee_cited=verdicts["fee_optimizer"].cited_evidence,
                fee_reasoning=verdicts["fee_optimizer"].recommendedAction,
                fee_packet=fee_pkt.to_prompt_dict(),
            )
            grounding_summary = summarise_grounding(grounding_reports)

            elapsed = (time.time() - start) * 1000
            yield sse("complete", {
                "totalLatencyMs": round(elapsed, 2),
                "grounding_report": grounding_summary,
            })

        except Exception as e:
            yield sse("error", {"message": str(e)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

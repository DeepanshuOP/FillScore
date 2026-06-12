"""FillScore ML Microservice — FastAPI entry point.

Serves the Agent Council and health endpoints on port 8000.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient

from agents.council import run_council
from agents.schemas import CouncilResult, TradeContext

# Load env: ml-service/.env first (ANTHROPIC_API_KEY), then backend/.env (MONGODB_URI)
_ml_env = os.path.join(os.path.dirname(__file__), ".env")
_backend_env = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
for _env_path in [_ml_env, _backend_env]:
    try:
        load_dotenv(_env_path, override=False)
    except (ValueError, UnicodeDecodeError):
        pass


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class CouncilRequest(BaseModel):
    userId: str
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


@app.post("/ml/agents/council", response_model=CouncilResult)
async def council_endpoint(req: CouncilRequest) -> CouncilResult:
    """Run the Agent Council for a user's trade data."""
    db = _get_db()

    # Fetch the user's most recent audit
    audit = db.audits.find_one(
        {"userId": req.userId},
        sort=[("period.start", -1)],
    )
    if audit is None:
        raise HTTPException(status_code=404, detail=f"No audit found for userId={req.userId}")

    result = await run_council(req.userId, req.symbol)
    return result

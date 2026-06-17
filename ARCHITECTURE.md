# Architecture Map

## 1. Project Summary
FillScore is a reproducible crypto execution-quality (TCA) auditing platform that GRADES past execution against real market microstructure. It is explicitly not a trading-signal or prediction product. Instead, its flagship feature is the multi-agent Execution Council, which utilizes LLM-driven agents alongside rigorous deterministic metrics to analyze historical trade efficiency, execution alpha, and liquidity conditions.

## 2. System Map (Three Tiers)

### Backend (Node/Express, port 3001)
| File Path | What it does | Status |
|---|---|---|
| `backend/src/index.ts` | Top-level Express app, global middleware, and primary router mounting | REAL/wired |
| `backend/src/models/Audit.ts` | Mongoose schema for saved Audit reports | REAL/wired |
| `backend/src/models/Trade.ts` | Mongoose schema for trade records | REAL/wired |
| `backend/src/models/User.ts` | Mongoose schema for user accounts/demo tracking | REAL/wired |
| `backend/src/routes/attribution.ts` | Attribution router endpoints | REAL/wired |
| `backend/src/routes/audit.ts` | Core endpoints for score, export, analytics, SSE streams, etc. | REAL/wired |
| `backend/src/routes/connect.ts` | Connection simulation/auth route | REAL/wired |
| `backend/src/scoring/attribution.ts` | Deterministic trade attribution logic | REAL/wired |
| `backend/src/scoring/engine.ts` | Core engine for evaluating basic trade scoring rules | REAL/wired |
| `backend/src/services/BinanceClient.ts` | Exchange client for Binance integration | REAL/wired |
| `backend/src/services/BybitClient.ts` | Exchange client for Bybit integration | REAL/wired |
| `backend/src/services/OKXClient.ts` | Exchange client for OKX integration | REAL/wired |
| `backend/src/services/ReportService.ts` | Generates PDF summaries, comparison reports, and scorecards | REAL/wired |
| `backend/src/scripts/downloadMarketData.ts` | Script for pulling specific CSV trade data sets | REAL/wired |
| `backend/src/scripts/generateSyntheticTrades.ts` | Utility to create synthetic data for demo populations | REAL/wired |

### ML-Service (Python, port 8000 scaffolded)
| File Path | What it does | Status |
|---|---|---|
| `ml-service/agents/council.py` | Agent Council — LangGraph StateGraph wiring for parallel specialist execution | REAL/wired |
| `ml-service/agents/debate.py` | Execution Trial debate logic — Prosecution/Defense/Judge | REAL/wired |
| `ml-service/agents/liquidity_scout.py` | Liquidity Scout — specialist agent for slippage & liquidity analysis | REAL/wired |
| `ml-service/agents/fee_optimizer.py` | Fee Optimizer — specialist agent for fee efficiency analysis | REAL/wired |
| `ml-service/agents/alpha_architect.py` | Alpha Architect — specialist agent for execution alpha analysis | REAL/wired |
| `ml-service/agents/risk_auditor.py` | Risk Auditor — specialist agent for concentration & adverse selection risk | REAL/wired |
| `ml-service/agents/synthesis.py` | Synthesis Agent — conflict resolution & recommendation generation | REAL/wired |
| `ml-service/agents/grounding.py` | Grounding contract, checking metric validity vs claim | REAL/wired |
| `ml-service/agents/verification.py` | Verification gate preventing unsafe trade logic | REAL/wired |
| `ml-service/agents/confidence.py` | Deterministic evidence coverage confidence scoring | REAL/wired |
| `ml-service/agents/helpers.py` | Helper functions like override_synthesis_cost | REAL/wired |
| `ml-service/agents/llm_client.py` | Groq async client connection factory | REAL/wired |
| `ml-service/agents/persistence.py` | MongoDB interactions for runs and traces | REAL/wired |
| `ml-service/eval/harness.py` | Eval framework execution | REAL/wired |
| `ml-service/eval/cost_report.py` | Generates cost telemetry stats table | REAL/wired |
| `ml-service/eval/paper_artifacts.py` | Artifact builder mapping evaluation data to paper formats | REAL/wired |
| `ml-service/whale/aggtrades_window.py` | Fetches raw local or REST aggregate trades for window contexts | REAL/wired |
| `ml-service/whale/enrich.py` | Correlates trades against order book imbalance factors | REAL/wired |
| `ml-service/whale/analyze_slippage.py` | Calculates primary Mann-Whitney and secondary t-tests | REAL/wired |
| `ml-service/whale/regen_fills.py` | Determines fallback versus genuine market fill paths | REAL/wired |

### Frontend (Next.js, port 3000)
| File Path | What it does | Status |
|---|---|---|
| `frontend/app/page.tsx` | Main landing page | REAL/wired |
| `frontend/app/dashboard/page.tsx` | Main user execution dashboard | REAL/wired |
| `frontend/app/analytics/page.tsx` | Detailed analytics breakdown | REAL/wired |
| `frontend/app/analytics/WhaleCorrelation.tsx` | Whale/Slippage visual analysis component | REAL/wired |
| `frontend/app/components/AgentCouncil.tsx` | Core UI component for execution streaming and reporting | REAL/wired |
| `frontend/app/trades/page.tsx` | Raw trade listing view | REAL/wired |
| `frontend/app/share/[userId]/page.tsx` | Shareable scorecard page | REAL/wired |

## 3. Backend API Surface

| Method | Path | Feature it serves |
|---|---|---|
| GET | `/api/health` | Service health check |
| GET | `/api/ready` | Service readiness probe |
| GET | `/api/version` | Endpoint for build verification |
| POST | `/api/connect/` | User exchange connection simulation |
| GET | `/api/audit/` | Audit initiation |
| GET | `/api/audit/score` | Primary execution score endpoint |
| GET | `/api/audit/report` | PDF export retrieval |
| GET | `/api/audit/share/:userId` | Shareable scorecard deep-link |
| GET | `/api/audit/trades/export` | CSV export of executed trades |
| GET | `/api/audit/trades` | Retrieves trade list |
| PATCH | `/api/audit/trades/:tradeId/note` | Trade Journal Notes submission |
| GET | `/api/audit/analytics` | Deep-dive analytics entrypoint |
| GET | `/api/audit/analytics/exchange-comparison` | Venue Alpha / comparative analysis |
| GET | `/api/audit/coach` | Execution Coach mode logic |
| GET | `/api/audit/analytics/whale-correlation` | Whale/slippage specific analysis |
| GET | `/api/attribution/` | Trade attribution processing |

## 4. Feature Status Ledger
*(This replaces the v3 roadmap table)*

No demo-visible feature is missing. The repository reflects its true, final, built state.

| Feature | Roadmap ID | Status | Evidence (File/Commit) |
|---|---|---|---|
| Scoring engine | N/A | BUILT | `backend/src/scoring/engine.ts` |
| 3 Exchange connectors | N/A | BUILT | `BinanceClient.ts`, `BybitClient.ts`, `OKXClient.ts` |
| Analytics deep-dive | N/A | BUILT | `app/analytics/page.tsx` |
| Exchange comparison/venue alpha | T2.4 | BUILT | `backend/src/routes/audit.ts` |
| PDF export | T2.5 | BUILT | `backend/src/services/ReportService.ts` |
| CSV export | T2.6 | BUILT | `backend/src/routes/audit.ts` |
| Shareable scorecard | T2.8 | BUILT | `backend/src/routes/audit.ts` |
| Execution Coach | N/A | BUILT | `backend/src/routes/audit.ts` |
| Trade Journal Notes | N/A | BUILT | `backend/src/routes/audit.ts` |
| Whale Correlation pipeline | T2.12 | BUILT | `ml-service/whale/*.py` |
| Full Agent Council (AC-0 to AC-15) | N/A | BUILT | `ml-service/agents/*.py`, `council_runs` in DB |
| Eval Harness & Reproducibility Pack | N/A | BUILT | `ml-service/eval/harness.py`, `eval_tables.md` |
| Cost Telemetry | N/A | BUILT | `ml-service/eval/cost_report.py` |
| Live-price WebSockets | T2.9 | DEFERRED-BY-DESIGN | Requires live InfluxDB/Redis infra incompatible with static demo |
| Benchmark/FillScore Index | T2.10 | DEFERRED-BY-DESIGN | Requires live InfluxDB/Redis infra incompatible with static demo |
| OBI Engine | T2.11 | DEFERRED-BY-DESIGN | Requires live InfluxDB/Redis infra incompatible with static demo |
| Latency Benchmarking | T2.13 | DEFERRED-BY-DESIGN | Requires live InfluxDB/Redis infra incompatible with static demo |
| Spoofing Detector | T2.14 | DEFERRED-BY-DESIGN | Requires live InfluxDB/Redis infra incompatible with static demo |
| Weekly Email Digest | T2.7 | DEFERRED-BY-DESIGN | Requires live InfluxDB/Redis infra incompatible with static demo |

## 5. Data Model

- **Demo Users**:
  - Main Evaluation Set: `demo-disciplined`, `demo-moderate`, `demo-aggressive`. These are whale-enriched, real January-2024-timestamped Binance users used strictly for analytical performance eval.
  - Comparison Set: `demo-bybit`, `demo-okx`, `demo-multi`. These users act as benchmark and comparative baselines.
- **Trade Schema Fields**: Trade documents use `fee` and `notional` directly (the previously duplicated seeder properties like `feePaid` or `notionalValue` are obsolete/absent).
- **Whale Enrichment Fields**: Main users are enriched directly in the DB with fields like `whaleAdverse`, `whalePressure`, `arrivalSlippageBps`, and `realFillComputed` representing deep historical context.

## 6. Known Gaps / Tech Debt (Honest & Brief)

- **Trade.exchange Enum**: Missing the explicit `'okx'` member inside the mongoose schema definition, which could cause ingest errors on strict type enforcement.
- **CamelCase Mapping in `loader.py`**: The python data loader assumes snake_case fields (`whale_adverse`, `reversion_30s`), while Mongo strictly uses camelCase (`whaleAdverse`, `reversion30s`), resulting in silent `None` parsing. Needs to be confirmed if this missing data is load-bearing.
- **Constant Duplication**: `metrics_version` and `prompt_version` are hardcoded strings independently duplicated across multiple scripts rather than centralized in one constants module.
- **Hardcoded URI Secrets**: MongoDB URIs and passwords are leaked and hardcoded into specific `.py` files inside the `whale/` pipeline. These need to be immediately rotated and moved purely to `.env`.

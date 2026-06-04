# 🏦 FillScore — Supreme Master SaaS Build Roadmap (Elite Edition)

> **Institutional-Grade Crypto Execution Intelligence for Retail Traders**

> Stack: Next.js 16 · TypeScript · Node.js · MongoDB · InfluxDB · Python/FastAPI · Claude API (Synthesis) · Ollama/Llama 3 (Specialist Agents) · LangGraph · Redis Streams · scipy (KDE) · Protocol Buffers
>
> Build Method: Antigravity IDE (agentic, one task at a time) · Windows/PowerShell
>
> Benchmarked Against: J.P. Morgan Execution Analytics · Bloomberg TCA · OASIS Multi-Agent Simulation

---

## 📌 Project North Star

FillScore answers the question every retail crypto trader ignores: **how well did you actually execute that trade?** Not whether you were directionally right — but whether you got the best possible price, minimized slippage, used the right order type, and traded during optimal liquidity windows.

The gap between institutional and retail execution quality costs retail traders an estimated **$2–8 billion annually** in avoidable slippage and fees. FillScore closes that gap — bringing Bloomberg Terminal-level TCA to anyone with a Binance or Bybit account.

What makes FillScore supreme:
- **ai-hedge-fund-inspired:** Multi-agent LangGraph execution council where specialist agents (Liquidity Scout, Alpha Architect, Risk Auditor) debate and synthesize audit verdicts in real time
- **WorldMonitor-inspired:** Dual-layer live market intelligence — real-time L2 order book tracking, whale flow correlation, 45+ data layers, cross-exchange signal convergence
- **MiroFish-inspired:** Swarm intelligence simulation sandbox — thousands of synthetic trader agents with independent personalities interact and evolve to predict execution trajectories for any given strategy

---

## 🗺️ Phases Overview

| Phase | Name | Status | Duration | Key Output |
| --- | --- | --- | --- | --- |
| 1 | Foundation & Core Engine | ✅ Built | Weeks 1–4 | Working TCA engine + dashboard |
| 2 | Analytics Deep-Dive & Multi-Exchange | 🔄 Next | Weeks 5–7 | Deep analytics + WorldMonitor Visibility + OBI Engine |
| 3 | AI / ML Intelligence | 🔲 Planned | Weeks 8–11 | Agentic Council + HMM Regimes + Swarm Simulation |
| 4 | Enterprise & SaaS | 🔲 Planned | Weeks 12–14 | Auth, billing, Deterministic Audits, k6 Load Testing |
| 5 | Ecosystem & Open Platform | 🔲 Future | Weeks 15–18 | Strategy Sandbox + DEX Analysis + MCP Server |

---

## ✅ PHASE 1 — Foundation & Core Engine

### Status: BUILT · Weeks 1–4

Phase 1 is production-ready. The full stack is operational with real Binance market data, a complete scoring engine, a Bloomberg Terminal-inspired UI, and three validated synthetic trader profiles.

### What Is Built

**Data Pipeline**
- Real Binance 1-min kline CSVs from [data.binance.vision](http://data.binance.vision) (BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT — Jan 2024)
- HMAC-SHA256 signed Binance API requests for live trade ingestion
- AES-256-GCM encryption for user API keys stored in MongoDB
- Market enrichment engine: arrival price proxy, VWAP 5-min, spread bps
- 3 synthetic trader profiles: Aggressive (D/57), Moderate (B/81), Disciplined (A/93)
- Symbol-aware spread multipliers (BTC ×1.0, ETH ×1.2, BNB ×1.5, SOL ×2.0)

**Scoring Engine**
- Slippage score (35%): arrival price vs execution price in bps
- Fee efficiency score (25%): maker vs taker ratio
- Timing quality score (25%): UTC hour liquidity window
- Spread cost score (15%): exchange spread drag
- Composite FillScore 0–100 with A/B/C/D/F grade
- Audit summary with period analytics, best/worst symbols and hours

**Backend API** (Node.js 20 + TypeScript + Express on port 3001)
- POST /api/connect — exchange auth with encrypted key storage
- GET /api/audit — full pipeline: ingest → enrich → score → summarise
- GET /api/score — retrieve stored AuditSummary
- GET /api/trades — paginated, filterable trade history
- GET /api/analytics — heatmap, symbol breakdown, score distribution
- MongoDB Atlas: Trade, Audit, User, MarketCache schemas

**Dashboard & UI** (Next.js 16, Neural Noir dark design system)
- Landing page: exchange selector, API key form, demo mode
- Dashboard: hero grade display, animated score bars, Recharts trend chart
- Trade History: Bloomberg-style blotter, 11 sortable columns, slide-over drawer
- Analytics: 24×7 heatmap, symbol breakdown, score distribution
- Mobile-responsive across all pages
- simplex-noise animated wave background with mouse physics

### Phase 1 Subtasks (Reference)

- **T1.1 — Project Scaffold & Environment Setup**
  Node.js/TypeScript monorepo, Express server, MongoDB connection, env validation.
  Deliverable: `npm run dev` → "MongoDB connected"

- **T1.2 — TypeScript Types & MongoDB Schemas**
  All interfaces: BinanceRawTrade, NormalisedTrade, MarketSnapshot, TradeMetrics, TradeScores, AuditSummary. Mongoose models: Trade, Audit.

- **T1.3 — API Key Encryption & Security Layer**
  AES-256-GCM encrypt/decrypt utils. POST /api/connect with rate limiting (5/15min).

- **T1.4 — Binance Trade Ingestion Service**
  BinanceClient with HMAC signing. 24-hour window loop for 30-day fetch. Deduplication. 200ms delay between requests.

- **T1.5 — Market Data Enrichment Service**
  fetchArrivalPrice (kline open proxy), fetchVwap5min, estimateSpreadBps. Batch processor: 50 trades per chunk, 500ms pause. MongoDB market_cache with 24h TTL.

- **T1.6 — Scoring Algorithm (4 Components)**
  Pure functions: computeArrivalSlippageBps, scoreArrivalSlippage, scoreFeeEfficiency, scoreTiming, scoreExchange, computeFillScore, gradeFromScore, scoreTrade.

- **T1.7 — Audit Engine & Recommendation Generator**
  computeAuditSummary (notional-weighted), generateRecommendations (rule engine with dollar estimates). GET /api/audit, GET /api/score.

- **T1.8 — Synthetic Trade Generator**
  3 trader profiles. CSV kline parser. Probabilistic trade generation. 200+ trades per profile. `npm run seed`.

- **T1.9 — Onboarding & API Key Connection Flow**
  Exchange selector, API key form with show/hide, read-only confirmation checkbox, demo mode button.

- **T1.10 — Main Dashboard**
  Hero grade display, 4 component score bars, trend chart (Recharts), recommendation cards, skeleton loaders.

- **T1.11 — Trade Drilldown Table & Analytics Heatmap**
  TanStack Table, slide-over detail modal, 24×7 CSS Grid heatmap, symbol bar chart.

- **T1.12 — Rate Limiting, Error Handling & Deployment**
  helmet.js, global rate limiter, Zod validation, errorHandler middleware, GET /api/trades pagination, vercel.json, README.

### Phase 1 Hardening Tasks (Post-Build Polish)

These should be done to elevate Phase 1 to institutional quality before Phase 2 begins:

1. Add ingestion resume logic and duplicate detection reporting
2. Add unit tests for all scoring boundary conditions (zero slippage, max slippage, missing candle)
3. Add safe fallback for bad or missing market data (zero-volume candles, delayed klines)
4. Add structured error middleware with correlation IDs
5. Add demo-user seed verification smoke test
6. Add endpoint pagination safety checks
7. Add route-level latency logging (entry/exit timing per endpoint)
8. Add `/health`, `/ready`, and `/version` endpoints for production monitoring

---

## 🔄 PHASE 2 — Analytics Deep-Dive & Multi-Exchange

### Status: NEXT UP · Weeks 5–7

Expand the data layer, deepen analytics, add Bybit and OKX, and inject WorldMonitor-grade market visibility through real-time order book intelligence and whale correlation overlays.

### Subtasks

**T2.1 — Analytics Deep-Dive Page** *(~4 hrs)*

Prompt goal: Build `app/analytics/page.tsx` with:
- Slippage distribution histogram (bucket by 5bps intervals, Recharts BarChart)
- Fee drag analysis: maker vs taker pie chart + cost attribution breakdown table
- Score distribution histogram: A/B/C/D/F bucket counts
- Hourly execution quality chart: best/worst UTC hours per symbol
- "Best Window" and "Worst Window" annotation overlays
- All charts dark-themed, match Neural Noir system

Subtasks:
1. Implement slippage histogram component with positive/negative slippage separation
2. Implement fee drag view: maker vs taker ratio breakdown, fee drag as % of monthly notional
3. Implement symbol comparison table: notional, score, maker ratio, slippage, fee drag per symbol
4. Implement "compare this month vs last month" period toggle
5. Add saved filter state to URL params for shareable analytics views

**T2.2 — Bybit Trade Connector** *(~5 hrs)*

Prompt goal: Create `src/services/BybitClient.ts`:
- HMAC-SHA256 signing for Bybit v5 API (`GET /v5/execution/list`)
- Fetch trade history with pagination (cursor-based)
- Map Bybit response fields → NormalisedTrade (note: Bybit uses `execPrice`, `execQty`, `execFee`)
- Bybit fee structure: 0.02% maker / 0.055% taker (vs Binance 0.02%/0.1%)
- Integrate into TradeIngestionService as a second exchange branch

Subtasks:
1. Implement BybitClient class with cursor pagination
2. Map Bybit field names → NormalisedTrade canonical schema
3. Add exchange-specific fee constants to scoring config
4. Add Bybit to onboarding exchange selector
5. Integration test: seed 50 synthetic Bybit trades and verify scoring

**T2.3 — OKX Trade Connector** *(~4 hrs)*

Prompt goal: Create `src/services/OKXClient.ts`:
- OKX REST API v5: `GET /api/v5/trade/fills-history` with passphrase header
- Pagination with `after` cursor param
- Handle OKX's unique fee structure (OKB discount tier)
- Add exchange comparison endpoint: `GET /api/analytics/exchange-comparison`

Subtasks:
1. Implement OKXClient with passphrase header auth
2. Map OKX field schema → NormalisedTrade
3. Add OKB fee-tier detection from API response
4. Add OKX to onboarding selector with logo
5. Verify with synthetic OKX trade batch

**T2.4 — Exchange Comparison Dashboard Section** *(~3 hrs)*

Prompt goal: New dashboard card showing:
- Side-by-side avg FillScore per exchange (if user has multiple)
- Per-symbol fill quality ranking: "BTC fills best on Bybit for your trading style"
- Fee tier detection: auto-read VIP level from API response headers
- "Venue Alpha" metric: estimated savings from routing trades to the better exchange

**T2.5 — PDF Audit Report Export** *(~5 hrs)*

Prompt goal: `src/services/ReportService.ts` + API endpoint `GET /api/report?userId=X`:
- Use `@react-pdf/renderer` to generate branded PDF
- Include: cover page with grade + period, component score breakdown, top 5 worst trades table, all recommendations with dollar estimates, trend chart screenshot
- Return as downloadable PDF binary
- Add "Download Report" button to dashboard header
- Include month-over-month delta section and strategy notes section

**T2.6 — CSV Trade History Export** *(~2 hrs)*

Prompt goal: `GET /api/trades/export?userId=X&format=csv`:
- Stream CSV response with all EnrichedTrade fields as columns
- Add "Export CSV" button on Trade History page
- Include header row with human-readable column names

**T2.7 — Weekly Email Digest** *(~4 hrs)*

Prompt goal: `src/services/EmailService.ts`:
- Use `nodemailer` + SendGrid SMTP
- Email template: current FillScore grade, week-over-week change, top 3 recommendations
- Bull job queue: weekly cron at Monday 09:00 UTC
- Opt-in/out stored on User document
- Unsubscribe link in email footer

**T2.8 — Shareable Score Card** *(~3 hrs)*

Prompt goal: `app/share/[userId]/page.tsx`:
- Public read-only page: shows grade, period, top 3 stats — no trade data exposed
- Open Graph meta tags for Twitter/LinkedIn preview
- "View my FillScore" share button on dashboard
- Rate-limited: 100 views/hour per scorecard

**T2.9 — Real-Time WebSocket Score Updates** *(~5 hrs)*

Prompt goal: Add `socket.io` to Express server:
- Event: `trade:ingested` — fires when new trade stored, payload: {userId, tradeId, fillScore}
- Event: `audit:updated` — fires when audit recomputed
- Client: connect on dashboard mount, update grade display live without page refresh
- Reconnect logic with exponential backoff

**T2.10 — Benchmark Comparison** *(~3 hrs)*

Prompt goal: Aggregate anonymised platform-wide stats:
- `GET /api/benchmark` → {avgFillScore, medianSlippageBps, makerRatioP50, avgFeeDragBps} computed over all users
- Add "Platform Average" reference line to all score bars on dashboard
- Add "Synthetic Ideal Trader" benchmark line (maker ratio 0.80, trades only 8–16 UTC, BTC/ETH only)
- Privacy: only computed when ≥10 users exist; never expose individual data

**T2.11 — Order Book Imbalance (OBI) Engine** *(~6 hrs)*
*Inspiration: WorldMonitor Depth Layer — 45+ real-time data overlays*

Prompt goal: Create `src/services/MarketDepthService.ts`:
- WebSocket worker tracking Binance/Bybit L2 order book data via `wss://stream.binance.com:9443/ws/{symbol}@depth20@100ms`
- **Run as a dedicated Node.js `worker_threads` worker** — never on the main Express event loop. At 100ms intervals across 4 symbols, this is ~40 WebSocket messages/second. Running on the main thread will cause event-loop lag and dropped packets.
- Calculate OBI (Ratio of Bid vs. Ask volume at top 5 levels): `OBI = (bidVol - askVol) / (bidVol + askVol)`
- Add "Market Pressure" metric to EnrichedTrade: `marketPressure: 'BID_HEAVY' | 'ASK_HEAVY' | 'BALANCED'`
- Store L2 snapshots in InfluxDB via Redis Streams buffer: WebSocket → Redis Stream → InfluxDB writer (decoupled ingestor pattern for guaranteed delivery)
- **⚠️ Architectural constraint:** Binance does NOT provide historical L2 depth data via free API. OBI data is only available from the moment the engine starts. All historical/synthetic trades will have `obiAtExecution: null`. Do NOT attempt to backfill.
- **Warm-up period:** System must collect 24–48 hours of L2 data before OBI scoring is meaningful. Display warm-up progress to user.

Subtasks:
1. Set up InfluxDB connection and write client (`src/config/influxdb.ts`)
2. Set up Redis Streams pipeline: `XADD l2:snapshot …` → consumer group → InfluxDB batch writer (decouples WebSocket ingestor from DB writes)
3. Implement L2 WebSocket worker as a `worker_threads` worker with reconnect logic and ring-buffer snapshot storage
4. Implement OBI calculation function with 5-level depth aggregation
5. Add `marketPressure`, `obiAtExecution: number | null`, and `obiDataAvailable: boolean` fields to EnrichedTrade schema
6. Implement graceful null-handling: if `obiAtExecution` is null, OBI component is excluded from score calculation entirely — do NOT penalize historical trades
7. Add warm-up progress indicator to dashboard: "OBI Engine collecting baseline… Live OBI scoring begins when engine has run for 24h"
8. Add "Market Pressure" column to trade blotter (hidden with tooltip "OBI available from [date]" for pre-engine trades)
9. Dashboard (once live): "You traded into a bid wall 34% of the time — this cost you ~$X in slippage"

**T2.12 — Whale Correlation Heatmap** *(~5 hrs)*
*Inspiration: WorldMonitor Cross-Stream Signal Convergence*

Prompt goal: Implement `app/components/WhaleHeatmap.tsx`:
- Fetch large order flows (>$100k notional, Binance agg-trades stream) occurring within ±30 seconds of user trades
- CSS Grid heatmap overlaying user trades against whale activity by hour and symbol
- Color-code "Aggression": `RED = user traded into a whale sweep (high slippage correlation)`, `YELLOW = concurrent activity`, `GREEN = clean execution`
- Tooltip: "At 14:23 UTC, a $240k BTC market buy occurred 8 seconds before your trade — likely caused your 12bps slippage"
- `GET /api/analytics/whale-correlation?userId=X` endpoint

Subtasks:
1. Build Binance aggTrades WebSocket listener and store large trades (>$100k) in InfluxDB
2. Implement whale correlation algorithm: match user trade timestamp ± 30s window
3. Build WhaleHeatmap React component with Neural Noir color scale
4. Add whale correlation score to EnrichedTrade: `whalePressureScore: number (0–100)`
5. Add "Whale Pressure Index" to analytics page section

**T2.13 — Execution Latency Benchmarking** *(~4 hrs)*

Prompt goal:
- Add millisecond-level timestamps to the ingestion pipeline using `performance.now()` and exchange server timestamps
- Calculate "Exchange Latency": delta between `executedAt` (exchange time) and `receivedAt` (our server time)
- Store `latencyMs` on NormalisedTrade
- Benchmarking section on analytics page: "Your median Bybit latency is 14ms vs Binance 28ms — consider routing high-volatility trades to Bybit"
- Latency percentile chart: P50, P90, P99 per exchange

**T2.14 — Spoofing & Ghost Order Detector** *(~5 hrs)*
*Novel feature enabled by real-time L2 tracking — no retail TCA tool does this*

Prompt goal: Since the OBI engine records L2 snapshots at 100ms intervals, implement a spoofing detection algorithm that identifies institutional "ghost orders" — large bids/asks placed to manipulate price, then cancelled within milliseconds:

- `src/services/SpoofingDetector.ts`: runs as a post-processing step on InfluxDB L2 data after each trade
- **Spoofing detection logic:** For each trade, query InfluxDB for the L2 snapshot at `executedAt` and `executedAt + 200ms`. If a bid/ask wall of >$50k was present at `executedAt` but disappeared by `executedAt + 200ms`, flag as a "Ghost Order Event"
- Add `ghostOrderDetected: boolean` and `ghostOrderSide: 'BID' | 'ASK' | null` to EnrichedTrade
- Liquidity Scout Agent context: include ghost order flag in agent input JSON
- Analytics: "Ghost Order Events" metric on analytics page — "3 of your last 20 trades were influenced by ghost orders, costing an estimated X bps additional slippage"
- Dashboard: ghost order badge (👻) on affected trade rows in the blotter

Subtasks:
1. Implement InfluxDB query: fetch L2 snapshot at T and T+200ms for a given symbol
2. Implement ghost order detection function: compare bid/ask walls between T and T+200ms
3. Add ghost order fields to EnrichedTrade schema
4. Run ghost order detection as background job after OBI engine has been warm for 24h
5. Add ghost order badge to trade blotter rows
6. Add "Ghost Order Events" analytics card to analytics page
7. Inject ghost order data into Liquidity Scout Agent context for council verdicts

---

## 🤖 PHASE 3 — AI & Machine Learning Intelligence

### Status: PLANNED · Weeks 8–11

This phase transforms FillScore from a reporting tool into a quantitative execution intelligence system. Architecture draws from three reference projects:
- **ai-hedge-fund:** Multi-agent LangGraph orchestration where specialist agents run independently, debate, and synthesize
- **MiroFish:** Swarm intelligence simulation — deploy thousands of synthetic trader agents to predict future execution trajectories
- **WorldMonitor:** Real-time intelligence synthesis — agents consume live market signals, not just historical data

The ML layer runs as a separate Python microservice (FastAPI), keeping Node.js clean while enabling full scikit-learn/TensorFlow access.

### AI Capability Groups

**Layer A — Predict:** score forecasting, pre-trade fill prediction, regime-adjusted future score estimates
**Layer B — Explain:** audit narration, trade-level explanations, anomaly explanations, recommendation rationale
**Layer C — Simulate:** what-if scenarios, counterfactual cost estimates, alternate order-type simulation, swarm trajectory prediction

### Subtasks

**T3.1 — Python FastAPI Microservice Scaffold** *(~3 hrs)*

Prompt goal: Create `ml-service/` directory:
- FastAPI app with uvicorn, pydantic v2 models
- Health endpoint: `GET /health`
- CORS configured to accept calls from Node.js backend
- Docker-ready: `Dockerfile` + `requirements.txt` (scikit-learn, tensorflow, pandas, numpy, joblib, hmmlearn, fastapi, uvicorn, langchain, langgraph, anthropic)
- Shared type models: `TradeFeatureVector`, `PredictionResult`, `ClusterResult`, `AgentVerdict`
- Node.js → Python bridge: `src/services/MLService.ts` (axios calls to Python)

Subtasks:
1. Scaffold FastAPI app with router structure: `/ml/lstm`, `/ml/cluster`, `/ml/anomaly`, `/ml/regime`, `/ml/pretrade`, `/ml/agents`, `/ml/swarm`
2. Implement pydantic v2 models for all input/output contracts
3. Implement health check with model load status
4. Add CORS middleware and auth token validation
5. Write `requirements.txt` with pinned versions

**T3.2 — LSTM FillScore Forecasting** *(~6 hrs)*

Prompt goal: `ml-service/models/lstm_forecaster.py`:
- TensorFlow/Keras LSTM (seq2seq): input = rolling 30-day FillScore sequence, output = 7-day prediction
- Features: daily avg fillScore, slippageBps, feeDragBps, makerRatio, tradeCount, marketRegime
- Training: `POST /ml/lstm/train` — trains on user's historical audit records
- Inference: `GET /ml/lstm/forecast?userId=X` → {predictions: [{date, score, lower, upper}]}
- Model versioning: save to `models/lstm_{userId}_{timestamp}.h5`
- Dashboard widget: "Predicted score next 7 days: 89 ±4" with confidence band on trend chart

Subtasks:
1. Implement data preparation: sliding window feature extraction from audit records
2. Implement LSTM model architecture (2-layer, dropout 0.2)
3. Implement train/save/load with model registry
4. Implement inference with Monte Carlo dropout for uncertainty estimation
5. Add forecasting widget to dashboard trend chart (dashed line + shaded confidence band)
6. Add regime-conditional forecasting: model receives current HMM regime as an additional feature

**T3.3 — K-Means Trading Style Clustering** *(~5 hrs)*

Prompt goal: `ml-service/models/style_classifier.py`:
- scikit-learn K-Means (k=5) on 8 behavioural features:
  - makerRatio, avgTradeUSD, preferredHourCluster, symbolConcentrationHHI, tradesPerDay, avgSlippageBps, feeSensitivity (feeDrag/notional), holdingPeriodProxy
- Archetypes: Scalper / Swing Trader / HODLer / DCA Bot / Noise Trader
- PCA 2D plot for cluster visualisation (return as base64 PNG)
- `POST /ml/cluster/classify` → {archetype, confidence, pca_plot, archetype_description}
- Dashboard: archetype badge with icon + one-paragraph description of trading style

Subtasks:
1. Implement feature engineering pipeline for 8 behavioural metrics
2. Implement K-Means with silhouette analysis to validate k=5
3. Implement PCA dimensionality reduction and 2D scatter plot generation
4. Write archetype descriptions for all 5 profiles with strengths and weaknesses
5. Add archetype badge to dashboard hero section beside FillScore grade
6. Add "Your peers in this archetype" benchmark comparison (anonymised)

**T3.4 — Isolation Forest Anomaly Detection** *(~4 hrs)*

Prompt goal: `ml-service/models/anomaly_detector.py`:
- scikit-learn IsolationForest (contamination=0.05) trained **per user** (not global)
- Features: arrivalSlippageBps, feeDragBps, executedAt (hour), quantity, spreadBps, obiAtExecution, whalePressureScore
- `POST /ml/anomaly/detect` → [{tradeId, anomalyScore, reason, severity: 'HIGH'|'MED'|'LOW'}]
- Anomaly types: slippage spike, fee outlier, unusual hour, abnormal size, whale coincidence
- Analytics page: anomaly timeline view — red dots on heatmap for flagged trades
- Slide-over modal: "Why flagged?" explanation section

Subtasks:
1. Implement per-user model training with joblib persistence
2. Implement anomaly classification: map isolation score to severity tiers
3. Implement reason generation: identify which feature contributed most to anomaly score
4. Add red dot overlay to 24×7 heatmap for anomalous trades
5. Add "Anomaly Report" section to PDF export
6. Add anomaly count badge to dashboard nav

**T3.5 — Market Regime Detection (HMM)** *(~4 hrs)*
*Inspiration: MiroFish Quantitative Rigor — dynamic system-state modeling*

Prompt goal: `ml-service/models/hmm_regime.py`:
- `hmmlearn` GaussianHMM with 4 hidden states: Stable / Violent / Trending / Ranging
- Features: BTC daily return, 30d rolling vol, volume z-score (fetched from Binance klines)
- `GET /ml/regime/current` → {regime, confidence, since_date, description}
- Regime label shown on dashboard header and score cards
- **Dynamic FillScore Weighting:** When regime = 'Violent', slippage component weight increases from 35% to 50%, timing decreases to 15% (volatility makes slippage dominant). When regime = 'Stable', timing weight increases to 35%.
- Historical regime overlay on trend chart (background colour bands: green/red/yellow/blue)

Subtasks:
1. Implement GaussianHMM training pipeline on 1-year BTC daily kline data
2. Implement regime transition probability matrix and Viterbi decoding
3. Implement regime-weighted scoring: `adjustedScore = rawScore × regimeMultiplier`
4. Store current regime in Redis for fast dashboard reads (refresh every 1h)
5. Add historical regime band overlay to trend chart (semi-transparent background colors)
6. Dashboard: "Current Regime: VOLATILE — your timing score is being evaluated more strictly"

**T3.6 — "Ask Your Trades" LLM Chat Interface** *(~6 hrs)*
*Inspiration: ai-hedge-fund conversational agent pattern*

Prompt goal: Build inspired by `virattt/ai-hedge-fund` multi-agent architecture:
- `src/services/TradeRAGService.ts`: builds context packet from MongoDB → recent trades, audit summary, anomalies, cluster archetype, current regime, OBI data
- `src/routes/chat.ts`: `POST /api/chat` — accepts `{userId, message, history[]}`, calls Claude API with structured system prompt + context
- Streaming SSE response: `GET /api/chat/stream`
- System prompt: "You are FillScore's trade analyst. You have access to the user's complete execution history, anomaly flags, market regime, and order book data. Answer questions grounded in their actual data. Cite specific trades when relevant. Do not invent scores or costs."
- Supported query types (few-shot examples in prompt):
  - "Why did my score drop in December?"
  - "Which symbol should I trade more?"
  - "Am I getting worse at limit orders?"
  - "What would my score be if I only traded BTC?"
  - "Was my 14:23 trade yesterday affected by whale activity?"
- Frontend: `app/chat/page.tsx` — chat UI with conversation history, suggestion pills, streaming typing effect, source citations
- Context window management: include last 30 trades + audit summary + anomalies + regime (max 4000 tokens of trade data)

Subtasks:
1. Implement TradeRAGService context builder with token budget management
2. Implement streaming Claude API call with SSE
3. Implement conversation history management (client-side state)
4. Build chat UI with Neural Noir dark theme, message bubbles, source citation links
5. Add suggestion pill chips: pre-built common questions
6. Add "thinking" indicator during streaming
7. Add chat history export as PDF

**T3.7 — LLM Audit Narration Engine** *(~4 hrs)*

Prompt goal: `src/services/NarrationService.ts`:
- After every audit computation, call Claude API with full AuditSummary as structured JSON context
- System prompt includes tone instructions: "harsh but actionable for D/F grades, encouraging and precise for A/B"
- Output: 3-paragraph narrative (what went well, what cost money, exact improvement plan with dollar estimates)
- Include whale correlation findings and OBI data in narration context
- Store narration on AuditSummary document as `narration: string`
- Dashboard: "AI Audit Narrative" collapsible section above recommendations
- PDF export: narration included as prose section

**T3.8 — Pre-Trade Execution Quality Estimator** *(~5 hrs)*

Prompt goal: `ml-service/models/pretrade_estimator.py`:
- RandomForestRegressor trained on historical EnrichedTrade features
- Input features: symbol, side, orderType, quantity (USD), proposedHour (UTC), currentRegime, currentSpreadBps, currentOBI, currentWhalePressure
- Output: `{predictedFillScore, range: [low, high], confidence, topFactors: [{factor, impact}]}`
- `POST /ml/pretrade/estimate`
- Frontend: `app/estimate/page.tsx` — form with symbol/side/size/hour inputs → show predicted score before trading
- Insight: "If you place this BTC market order at 2AM UTC in a Volatile regime, predicted score: 61. At 10AM UTC in Stable regime: 88"

Subtasks:
1. Implement feature engineering for live pre-trade inputs
2. Implement RandomForestRegressor with SHAP feature importance
3. Implement confidence interval via quantile regression forest
4. Build pre-trade estimator UI with real-time regime indicator
5. Add browser extension hook: call this endpoint from Binance/Bybit order form

**T3.9 — Execution Cost Attribution Model** *(~4 hrs)*

Prompt goal: `src/scoring/attribution.ts`:
- For each trade, compute counterfactual costs:
  - If limit order (isMaker=true): save `(takerFee - makerFee) × notional`
  - If traded 8–16 UTC: estimated spread saving from better liquidity window
  - If VWAP deviation: cost of entering at wrong time vs VWAP
  - If whale-correlated: estimated additional slippage from adverse selection
- Aggregate: monthly cost breakdown — `{feeCost, slippageCost, timingCost, spreadCost, whaleCost, total}`
- `GET /api/attribution?userId=X&period=30d` → full breakdown
- Dashboard section: "Your $X total cost this period: $A fees + $B slippage + $C timing + $D spread + $E whale-correlated"
- Savings estimates: "Switching to 80% maker would save ~$Y/month"

**T3.10 — The Agentic Council Architecture (LangGraph + Hybrid LLM)** *(~8 hrs)*
*Inspiration: ai-hedge-fund multi-agent debate — 18 specialist agents producing structured verdicts*
*Cost Optimization: Hybrid LLM strategy — Ollama/Llama 3 for specialist parsing (~70% cost reduction), Claude only for Synthesis and Narration*

Prompt goal: Refactor into a **LangGraph** orchestration pipeline with a **Hybrid LLM strategy**:

**Why Hybrid LLM:** Running 4 Claude API calls in parallel per audit would cost ~$0.15–0.30 per audit and take 30–60 seconds. Using Ollama (Llama 3 8B, free, local) for the specialist agents that do structured data parsing reduces cost by ~70% and latency by ~50%. Claude is reserved for the Synthesis and Narration steps that require nuanced reasoning.

- **The Liquidity Scout Agent** *(Ollama/Llama 3):* Receives structured JSON: `{trades, obiData, whaleEvents, avgSlippageBps}`. Analyzes slippage vs. order book depth, whale activity correlation, market impact. Returns structured JSON verdict: `{liquidityVerdict, slippageRoot, impactBps, confidence}`
- **The Alpha Architect Agent** *(Ollama/Llama 3):* Receives `{trades, twapBenchmark, vwapBenchmark}`. Benchmarks trades against synthetic TWAP/VWAP. Returns `{alphaVerdict, twapDeviation, bestAlternative, confidence}`
- **The Risk Auditor Agent** *(Ollama/Llama 3):* Receives `{trades, volatility30d, hhi, whalePressureScore}`. Evaluates position sizing, adverse selection risk, concentration risk. Returns `{riskVerdict, concentrationScore, adverseSelectionRisk, confidence}`
- **The Fee Optimizer Agent** *(Ollama/Llama 3):* Receives `{trades, makerRatio, feeDragBps, exchangeFeeSchedule}`. Analyzes maker/taker ratio, VIP fee tier opportunity, cross-exchange fee arbitrage. Returns `{feeVerdict, potentialSaving, recommendedTier, confidence}`
- **The Synthesis Agent** *(Claude API only):* Reads all four structured JSON verdicts + current regime + user's cluster archetype. Resolves conflicts using a priority matrix (Risk > Slippage > Fee > Alpha in volatile regimes). Produces final narrative + top 3 prioritized recommendations.
- LangGraph StateGraph: parallel fanout (Liquidity, Alpha, Risk, Fee via Ollama) → join → Synthesis (Claude API)
- API: `POST /api/audit/council` → {liquidityVerdict, alphaVerdict, riskVerdict, feeVerdict, synthesis, recommendations, totalLatencyMs, llmCostEstimateUSD}

Subtasks:
1. Install `langgraph`, `ollama`, `anthropic` Python libraries; set up Ollama Docker sidecar with Llama 3 8B model
2. Define AgentState schema with typed verdict fields and confidence scores
3. Implement LiquidityScoutAgent using Ollama client with structured JSON prompt (no free-form text — pure data-in, JSON-out)
4. Implement AlphaArchitectAgent with TWAP/VWAP benchmark computation using Ollama
5. Implement RiskAuditorAgent with volatility and HHI calculation using Ollama
6. Implement FeeOptimizerAgent with cross-exchange fee comparison using Ollama
7. Implement SynthesisAgent using Claude API — receives all 4 verdicts as structured context, outputs prose narrative + JSON recommendations
8. Build LangGraph StateGraph: `START → [Liquidity, Alpha, Risk, Fee] (parallel) → Synthesis → END`
9. Expose `POST /ml/agents/council` FastAPI endpoint with latency and cost tracking
10. Add "Agent Council" UI panel: expandable verdict cards per agent with Ollama/Claude badge, confidence bar, and conflict indicator

**T3.11 — Market Regime Transition Modeling (Enhanced HMM)** *(~6 hrs)*
*Inspiration: MiroFish Quantitative Rigor — predict regime transitions before they happen*

Prompt goal: Extend `ml-service/models/hmm_regime.py` with transition prediction:
- Train regime transition probability matrix on 3-year historical BTC data
- `GET /ml/regime/transition-forecast` → {currentRegime, nextLikelyRegime, probability, estimatedHours}
- Add regime-change alert: if P(transition) > 0.7 within next 24h, notify user via WebSocket event
- Dashboard: "Market may shift to VOLATILE within ~18 hours (72% confidence) — consider limit orders"
- **Dynamic Score Weighting by Regime (full matrix):**
  - Stable: Slippage 30%, Fees 25%, Timing 30%, Spread 15%
  - Violent: Slippage 50%, Fees 20%, Timing 15%, Spread 15%
  - Trending: Slippage 35%, Fees 20%, Timing 35%, Spread 10%
  - Ranging: Slippage 25%, Fees 30%, Timing 25%, Spread 20%

**T3.12 — Swarm Intelligence Simulation Sandbox** *(~10 hrs)*
*Inspiration: MiroFish — "rehearse the future in a digital sandbox, win decisions after countless simulations"*
*Math Upgrade: Ornstein-Uhlenbeck process for synthetic order book + KDE for result distribution*

Prompt goal: Build a swarm simulation engine where 500 synthetic trader agents evolve and interact in a physically realistic synthetic order book:

**Why Ornstein-Uhlenbeck (OU) process for the order book:**
Real market liquidity is mean-reverting — it dips after a large order and then recovers. A simple random walk doesn't model this. The OU process `dX_t = θ(μ - X_t)dt + σdW_t` models this mean-reversion. Parameters `θ` (reversion speed), `μ` (long-run liquidity mean), and `σ` (volatility) are estimated from the user's own InfluxDB L2 history. This makes swarm agents behave like real market participants rather than random noise — a genuine quantitative finance technique.

**Why KDE (Kernel Density Estimation) for results:**
Instead of just showing "best case: 91, worst case: 67", KDE (via `scipy.stats.gaussian_kde`) shows the user a continuous probability curve: `P(FillScore > 80) = 73%`. This is how institutional risk systems present simulation results.

- `ml-service/simulation/swarm_engine.py`: Agent-based simulation using OU-driven synthetic L2 order book
- **Synthetic Order Book:** modeled as an OU process with parameters estimated from user's InfluxDB L2 snapshots (or global Binance kline vol if OBI not yet available)
- **Agent Types (100 per type, 500 agents total):**
  - Scalper agents: high frequency, market orders, noise-sensitive, trigger on OBI signal
  - HODLer agents: infrequent, large orders, spread-insensitive
  - DCA Bot agents: time-scheduled, size-consistent
  - Momentum agents: trend-following, market orders in trending regimes
  - Arbitrageur agents: cross-exchange, latency-sensitive
- **Simulation Inputs:** seed with user's actual cluster archetype parameters + current HMM regime + OU order book parameters
- **Simulation Loop:** 1000 Monte Carlo runs × N-day horizon; each run generates a FillScore trajectory
- **Result Output:** `{mean, std, pct5, pct25, pct50, pct75, pct95, kdeCurve: [{x, density}], P_gt_80, P_lt_60}`
- `POST /ml/swarm/simulate` → full distribution results
- Frontend: `app/simulate/page.tsx` — interactive simulation results with KDE probability density curve (D3.js area chart) + key probability callouts

Subtasks:
1. Implement OU process class: parameter estimation from InfluxDB L2 history (or fallback to Binance vol)
2. Build Agent base class with personality parameters (aggression, patience, sizePreference, hourBias)
3. Build synthetic L2 order book driven by OU process with configurable depth and slippage propagation
4. Implement 5 agent archetypes with behavioral logic and OU-aware order sizing
5. Implement simulation loop: 1000 Monte Carlo runs × 30-day horizon with vectorized NumPy operations
6. Implement KDE using `scipy.stats.gaussian_kde` on simulation score distribution
7. Compute probability statements: `P(score > 80)`, `P(score < 60)` from KDE integral
8. Build KDE probability density curve visualization (D3.js smooth area chart with Neural Noir styling)
9. Add "What-If" input form: parameters to change (order type, hours, symbols, exchange, regime)
10. Persist simulation results as `SimulationRun` MongoDB document for auditability
11. Add "Simulation Result" section to PDF export with KDE chart and probability callouts

---

## 🏢 PHASE 4 — Enterprise & SaaS Platform

### Status: PLANNED · Weeks 12–14

Transform FillScore into a production-grade, monetisable SaaS product with institutional-level reliability, security, and auditability. **At J.P. Morgan, the architecture is what earns respect — not the UI.**

### Subtasks

**T4.1 — JWT Authentication System** *(~5 hrs)*

Prompt goal: Full auth system replacing the current hashed-key userId approach:
- `POST /api/auth/register` — email + password, bcrypt hash, send verification email
- `POST /api/auth/login` — returns access token (15min) + refresh token (30d, httpOnly cookie)
- `POST /api/auth/refresh` — rotate refresh token, issue new access token
- `POST /api/auth/logout` — blacklist refresh token in Redis
- Middleware: `authenticateJWT` guard on all protected routes
- User model: add `email`, `passwordHash`, `isVerified`, `plan: 'free'|'pro'|'enterprise'`

**T4.2 — OAuth2 Social Login** *(~3 hrs)*

Prompt goal: Add Google + GitHub OAuth:
- `passport.js` with `passport-google-oauth20` and `passport-github2`
- Callback flow: create user if new, link to existing if email matches
- `GET /api/auth/google`, `GET /api/auth/github` endpoints
- Frontend: "Continue with Google" and "Continue with GitHub" buttons on onboarding

**T4.3 — Stripe Subscription Billing** *(~6 hrs)*

Prompt goal: `src/services/StripeService.ts`:
- Three products: Free (no card), Pro ($9/mo), Enterprise (custom)
- `POST /api/billing/checkout` — create Stripe Checkout session
- `POST /api/billing/webhook` — handle `customer.subscription.updated`, `invoice.paid`, `invoice.payment_failed`
- Feature gates: check `user.plan` before serving ML endpoints (plan = 'pro' required)
- `GET /api/billing/portal` — Stripe Customer Portal for self-serve management
- Frontend: Pricing page `app/pricing/page.tsx` with feature comparison table + Stripe Checkout integration
- Grace period handling: 7-day grace period on payment failure before downgrade

**T4.4 — Multi-User Team Dashboards** *(~5 hrs)*

Prompt goal: Teams feature for Pro+ users:
- `Organisation` MongoDB model: `{orgId, name, ownerId, memberIds[], plan}`
- `POST /api/org/invite`, `POST /api/org/accept`
- Team dashboard: aggregate view showing all member FillScores sorted by grade
- Role-based access: Owner can see all member data, Members see only own
- `GET /api/org/leaderboard` → sorted member rankings (opt-in per member)

**T4.5 — Docker + CI/CD Pipeline** *(~4 hrs)*

Prompt goal: Production deployment infrastructure:
- `docker-compose.yml`: services for `backend`, `ml-service`, `mongo`, `redis`, `influxdb`
- `.github/workflows/deploy.yml`: on push to main — run tests → build Docker images → deploy to Railway (backend/ML) + Vercel (frontend)
- `Dockerfile` for Node.js backend (multi-stage: build → slim runtime)
- `Dockerfile` for Python ML service
- Health check endpoints included in compose
- Environment-specific configs: dev/staging/prod

**T4.6 — Redis Caching Layer** *(~3 hrs)*

Prompt goal: Distributed caching for performance:
- `src/config/redis.ts` — ioredis connection with retry logic
- Cache keys: `market:${symbol}:${minuteTs}` → TTL 24h, `regime:current` → TTL 1h
- Session store: connect-redis for Express sessions
- Rate limiting: migrate express-rate-limit to Redis store (distributed, works across multiple instances)
- Cache dashboard: `GET /api/admin/cache-stats`

**T4.7 — Sentry Error Tracking + Datadog APM** *(~2 hrs)*

Prompt goal: Full observability stack:
- `@sentry/node` + `@sentry/nextjs` integration
- Error boundaries in Next.js with Sentry capture
- Custom Sentry context: attach `userId`, `exchange`, `tradeCount`, `currentRegime` to errors
- Datadog APM: `dd-trace` auto-instrumentation for Express routes + MongoDB + ML service calls
- Dashboard: response time histogram, error rate, slow query alerts, agent latency tracking

**T4.8 — White-Label API** *(~4 hrs)*

Prompt goal: Enterprise feature — allow third-party embedding:
- `POST /api/enterprise/apikey` — generate API key for org (Enterprise plan only)
- API key auth middleware (X-FillScore-Key header)
- `POST /api/enterprise/score` — accepts trade array, returns FillScore without storing data
- Rate limit: 1000 req/day per API key
- OpenAPI/Swagger docs: auto-generate from Zod schemas using `zod-to-openapi`
- API reference page: `app/docs/page.tsx` using Swagger UI

**T4.9 — Key Rotation & Vaulting Security** *(~4 hrs)*
*Institutional requirement: Zero-downtime secret rotation*

Prompt goal:
- Implement automatic API key expiration alerts: notify user 7 days before exchange API key expires (detectable from 401 responses)
- Add key rotation log: `{userId, exchangeKeyId, rotatedAt, reason}` stored in MongoDB
- Enhance `EncryptionService`: Implement AES-256-GCM master key rotation using dual-key scheme (old key decrypts, new key re-encrypts) — zero downtime, zero data loss
- Admin endpoint: `POST /api/admin/rotate-master-key` — triggers background re-encryption job

**T4.10 — Institutional Load Testing (k6)** *(~5 hrs)*
*J.P. Morgan standard: system must handle institutional traffic under degradation*

Prompt goal: Create `tests/performance/load_test.js`:
- k6 script simulating 1,000 concurrent trade ingestions over 60 seconds
- Scenarios: ramp-up (0→1000 users in 30s), sustained (1000 users for 60s), spike (burst to 2000 for 10s)
- Target SLOs: P99 latency < 200ms for enrichment pipeline, P99 < 500ms for audit computation
- Custom metrics: `trade_ingestion_rate`, `scoring_duration_p99`, `agent_council_latency`
- Output: k6 HTML report saved to `tests/performance/reports/`
- GitHub Action: run k6 smoke test (100 users) on every PR

Subtasks:
1. Write k6 test script for `/api/audit` endpoint with realistic payload
2. Write k6 test script for `/api/chat` streaming endpoint
3. Write k6 test script for ML service `/ml/agents/council` endpoint
4. Configure k6 threshold assertions (fail build if SLO missed)
5. Add k6 HTML summary to CI artifacts
6. Document SLO targets and results in PERFORMANCE.md

**T4.11 — Deterministic Audit Replays** *(~4 hrs)*
*Inspired by institutional TCA requirement: every score must be 100% reproducible*

Prompt goal: Full audit determinism and version control:
- **Version the Scoring Engine:** Each scoring formula version has a semver tag stored in MongoDB
- `ScoringVersion` model: `{version, weights: {slippage, fee, timing, spread}, regimeWeights: {...}, createdAt, changelog}`
- When scoring a trade, attach `scoringVersion` to every scored trade document
- **Audit Replay:** `POST /api/audit/replay?userId=X&scoringVersion=1.0.0` — re-scores all trades using the specified historical formula version
- **Audit Hash:** Store a JSON hash (SHA-256) of the formula parameters used for every generated FillScore: `auditIntegrityHash`
- Compliance endpoint: `GET /api/audit/verify?auditId=X` — recomputes hash and compares to stored — returns `{isIntact: bool, delta: null | object}`
- Dashboard: "Audit v1.2 · Integrity: ✓ Verified" badge on every audit card

Subtasks:
1. Implement ScoringVersion MongoDB model with migration support
2. Implement version tagging: attach scoringVersion to every scored trade
3. Implement audit replay endpoint with version lookup
4. Implement SHA-256 audit integrity hash computation and storage
5. Implement `/api/audit/verify` integrity check endpoint
6. Add audit integrity badge to dashboard
7. Add version history changelog to API docs

---

## 🌐 PHASE 5 — Ecosystem & Open Platform

### Status: FUTURE · Weeks 15–18

**T5.1 — FillScore MCP Server** *(~4 hrs)*

Build FillScore as a Model Context Protocol server so Claude/Cursor/GPT agents can call it as a tool:
- Tools: `get_fill_score`, `get_worst_trades`, `get_recommendations`, `run_audit`, `simulate_strategy`, `get_regime`
- MCP server in Node.js using `@modelcontextprotocol/sdk`
- Published to npm: `@fillscore/mcp-server`
- README badge: "Compatible with Claude, Cursor, and any MCP client"

**T5.2 — npm SDK Package** *(~4 hrs)*

`@fillscore/sdk` — TypeScript client library:
- `FillScoreClient` class with typed methods for all API endpoints including simulation and agent council
- Browser + Node.js compatible (ESM + CJS dual build)
- Auto-generated from OpenAPI spec using `openapi-typescript`
- Published on npm with full TypeScript types

**T5.3 — Chrome Browser Extension** *(~6 hrs)*

- Manifest V3 extension
- Content script injected on [binance.com](http://binance.com) and [bybit.com](http://bybit.com)
- Pre-trade overlay: detects order form, shows predicted FillScore from T3.8 estimator
- Real-time OBI display: current order book imbalance badge on order form
- Post-trade popup: instant score after order fills (reads DOM for fill confirmation)
- Calls FillScore API with user's stored JWT
- Published to Chrome Web Store

**T5.4 — TradingView Pine Script Integration** *(~3 hrs)*

- Pine Script v5 indicator: plots user's historical FillScore alongside price chart
- Regime overlay: colors candles by HMM regime state
- Webhook receiver: `POST /api/webhooks/tradingview` → records signal-triggered trades
- Published in TradingView public script library

**T5.5 — Multi-Agent Audit Debate System (Full LangGraph)** *(~6 hrs)*

Full upgrade of T3.10 Council with visual debate UI:
- Add confidence scores to each agent verdict
- Add "Conflict Detected" badge when agents disagree (e.g., Fee Agent says "use maker" but Timing Agent says "current hour has low maker fill rate")
- Synthesis Agent outputs a structured JSON verdict with explicit conflict resolution reasoning
- Frontend: "Agent Council" animated panel — shows each agent's verdict appearing one by one like a real-time debate
- API: `POST /api/audit/debate` → {liquidityVerdict, alphaVerdict, riskVerdict, feeVerdict, conflictResolution, synthesis}

**T5.6 — React Native Mobile App** *(~8 hrs)*

- Expo-based React Native app
- Full dashboard on iOS and Android
- Push notifications: "Your score dropped 8 points this week" + "Market entering VOLATILE regime"
- Home screen widget: current FillScore grade
- Manual trade entry for exchanges without API

**T5.7 — DEX Execution Analysis** *(~6 hrs)*

- Uniswap v3 subgraph integration (GraphQL)
- Jupiter (Solana) transaction analysis
- Metrics: price impact vs slippage tolerance, MEV detection via Flashbots API
- Cross-chain comparison: CEX vs DEX fill quality for the same asset
- MEV exposure score: "Your last 5 Uniswap swaps were frontrun — costing you an estimated $X"

**T5.8 — The "Shadow Trader" Strategy Simulator** *(~10 hrs)*
*Inspiration: MiroFish Backtesting — "rehearse the future, win decisions after countless simulations"*

- Build a "Counterfactual Engine": Allows users to simulate their 30-day history as if they used different logic (e.g., "Limit Order with 2bp Offset" vs. "Market Order")
- Powered by the Swarm Engine from T3.12: run 1000 simulations per scenario
- Scenarios available:
  - "What if I used 80% limit orders?"
  - "What if I only traded 8–16 UTC?"
  - "What if I traded on Bybit instead of Binance?"
  - "What if I avoided whale-correlated windows?"
  - "What if I traded BTC only?"
- Opportunity Cost Calculator: measure "Lost Fills" — the amount saved in fees but lost by trades that never hit the limit price
- Frontend: `app/shadow/page.tsx` — scenario builder with sliders + simulation result violin plots

**T5.9 — Cross-Exchange Arbitrage Analysis** *(~6 hrs)*

- Implement `api/analytics/venue-comparison`: Compare the user's Binance fill price against the global mid-price of Bybit and OKX at that exact millisecond (using InfluxDB time-series lookup)
- Quantify "Venue Alpha": "Trading this asset on Bybit instead of Binance would have saved you $420 this month"
- Account for latency differential in the venue alpha calculation

---

## 🛠️ Development Workflow (Antigravity Protocol)

### Rule 1 — One Task at a Time
Never combine two tasks into one Antigravity prompt. Each task is sized to produce one complete, testable deliverable.

### Rule 2 — Context Injection
Every new Antigravity session starts with: *"You are building FillScore, a crypto TCA platform. Stack: Node.js 20/TypeScript/Express/Mongoose/Next.js 16/Tailwind. Here are the relevant types from the previous task: [paste types]."*

### Rule 3 — No Screenshots in Prompts
Screenshots go directly to Claude (separate conversation). Never include screenshot requests inside Antigravity prompts.

### Rule 4 — TypeScript Strict Mode Always
All backend and frontend code uses `strict: true`. No `any` types. Zod for runtime validation.

### Rule 5 — Iterative Fix Pattern
If output has a bug: *"The VWAP calculation returns NaN when volume is 0. Fix this edge case and add a guard."* One bug = one follow-up prompt.

### Rule 6 — Validate After Each Phase
After each major phase, run: *"Review this code for: (1) TypeScript type safety issues, (2) unhandled Promise rejections, (3) missing error handling, (4) API rate limit risks, (5) audit determinism violations."*

### Rule 7 — PowerShell Syntax
All terminal commands use PowerShell syntax (Windows). E.g., `$env:NODE_ENV="production"` not `NODE_ENV=production`.

### Build Sequence Rule
The order should always be:
1. Define the data contract
2. Persist the data
3. Validate the math
4. Expose the endpoint
5. Render the UI
6. Add polish
7. Add automation
8. Add intelligence

---

## 🧪 Testing Strategy

| Layer | Tool | Coverage Target |
| --- | --- | --- |
| Scoring engine (pure functions) | Jest | 100% — every formula including regime-weighted variants |
| API routes | Supertest | Happy path + error cases + pagination |
| ML models (Python) | pytest | Prediction shape, no NaN outputs, regime transition correctness |
| Agent Council | pytest | Verify each agent produces a valid verdict, Synthesis resolves conflicts |
| Swarm Simulation | pytest | 1000 simulation runs complete, score distribution is non-degenerate |
| Audit determinism | Jest | Same inputs → same FillScore across versions |
| E2E (demo mode) | Playwright | Onboarding → dashboard → export → chat → simulate flow |
| Load testing | k6 | P99 < 200ms for enrichment, P99 < 500ms for audit, P99 < 2s for council |

---

## 🚀 GitHub Star Strategy

**"Show, Don't Tell" Demo**
- Live demo at [fillscore.io](http://fillscore.io) with demo-disciplined profile pre-loaded (A-grade dashboard)
- One-click demo — no signup, no API key
- Animated GIF in README: heatmap + grade reveal + Agent Council verdict in 8 seconds
- "Try the Swarm Simulator" CTA button on landing page

**README Architecture**
- Hero image: dashboard screenshot with glowing A-grade + Agent Council panel
- Star History badge, visitor counter, license badge up front
- Quick start: 3 commands (`npm install` → `npm run seed` → `npm run dev`)
- ARCHITECTURE.md: comprehensive architecture diagram (inspired by WorldMonitor)
- AGENTS.md: description of each AI agent and its decision logic

**Viral Hooks**
- r/algotrading, r/CryptoCurrency, r/programming posts
- Hacker News "Show HN" when "Ask Your Trades" + Agent Council ships
- [Dev.to](http://Dev.to) article: "I built Bloomberg Terminal TCA + Multi-Agent AI for retail crypto traders"
- Twitter thread: "I built an AI system that lets 500 synthetic traders simulate my trading strategy — here's what they found"
- Target: tag @binance/@bybit/@anthropic in announcement

---

## 📊 Resume Bullets (Copy-Paste Ready)

**Built (past tense):**
- Built full-stack Transaction Cost Analysis engine processing real Binance 1-min kline data (BTC/ETH/BNB/SOL) — computing slippage in bps, fee drag, timing quality, and composite FillScore (A–F) across 500+ synthetic executions validated against 3 trader profiles
- Engineered AES-256-GCM API key encryption and HMAC-SHA256 signed Binance trade ingestion pipeline with 24-hour window loop handling and rate-limit-safe batching
- Designed 4-dimension weighted scoring model (slippage 35%, fees 25%, timing 25%, spread 15%) with notional-weighted audit aggregation and dollar-cost attribution
- Built Bloomberg Terminal-inspired dashboard in Next.js 16 featuring animated score components, 24×7 execution heatmap (CSS Grid + D3 colour scale), sortable 11-column trade blotter, and slide-over detail drawer

**Building/Designing (present/future):**
- Engineering real-time L2 Order Book Imbalance engine tracking Binance/Bybit depth WebSocket streams at 100ms resolution via a dedicated `worker_threads` worker, buffered through Redis Streams into InfluxDB — decoupled ingestor pattern preventing event-loop interference
- Implementing "Ghost Order / Spoofing Detector" — novel feature using 200ms InfluxDB L2 diff to identify institutional bid/ask walls that vanished after a user's fill, quantifying adverse selection impact in bps
- Building LangGraph-based "Agentic Council" with **Hybrid LLM strategy**: four specialist agents (Liquidity Scout, Alpha Architect, Risk Auditor, Fee Optimizer) run locally via Ollama/Llama 3 for structured data parsing (~70% cost reduction), feeding into Claude API exclusively for the Synthesis and Narration steps requiring nuanced reasoning
- Integrating Hidden Markov Model (hmmlearn, 4 hidden states) for real-time market regime detection with **dynamic scoring weight rebalancing** per regime and regime transition probability forecasting (Viterbi decoding)
- Building swarm simulation engine with **Ornstein-Uhlenbeck mean-reverting synthetic order book** (parameters estimated from user's L2 history) and 500 personality-parameterized agents; 1000 Monte Carlo runs produce **KDE probability density curve** — `P(FillScore > 80) = 73%` — institutional-grade uncertainty quantification
- Designing deterministic audit replay system with SHA-256 integrity hashing and scoring version control — ensures 100% score reproducibility across formula upgrades, meeting institutional audit trail standards
- Architecting system for production scaling: Node.js ingestor is interface-compatible with a Go replacement; Redis Streams is Kafka-compatible; AES-256-GCM master key architecture is Vault-ready — upgrade paths documented in ARCHITECTURE.md

**JPM-Level Resume Talking Points:**
- "Built a LangGraph-based Multi-Agent Council with a **Hybrid LLM strategy** — Ollama/Llama 3 for structured-data specialist agents (70% cost reduction), Claude API exclusively for the Synthesis step requiring nuanced conflict resolution via a regime-based priority matrix"
- "Implemented a **Ghost Order / Spoofing Detector** using 200ms InfluxDB L2 diff analysis to identify institutional bid/ask manipulation — a feature not present in any retail TCA platform"
- "Engineered a deterministic scoring engine with SHA-256 audit hashing and **scoring version control** ensuring 100% reproducibility of TCA audits — equivalent to institutional risk system audit trails"
- "Built a **swarm simulation engine with an Ornstein-Uhlenbeck mean-reverting order book** and Kernel Density Estimation output — produces probability statements (`P(score > 80) = 73%`) rather than point estimates"
- "Designed a **production-scaling architecture** documented in ARCHITECTURE.md: Node.js ingestor → Go, Redis Streams → Kafka, AES-256-GCM → Vault — I understand when and why each upgrade becomes necessary"
- "Built institutional-grade load testing with k6, validating P99 < 200ms for the enrichment pipeline under 1,000 concurrent users"

---

## 📦 Full Tech Stack

**Frontend:** Next.js 16, TypeScript 5, Tailwind CSS, Recharts, D3.js, simplex-noise, TanStack Table

**Backend:** Node.js 20, Express 5, TypeScript 5, Mongoose 8, Zod, helmet, socket.io, Bull, `worker_threads` (OBI ingestor)

**ML Service:** Python 3.11, FastAPI, scikit-learn, TensorFlow/Keras, hmmlearn, LangGraph, pandas, numpy, joblib, SHAP, `scipy.stats` (KDE, OU process)

**AI/LLM:** Ollama + Llama 3 8B (Liquidity Scout, Alpha Architect, Risk Auditor, Fee Optimizer agents — free, local), Claude API (Synthesis Agent + Audit Narration + Chat — reserved for reasoning-heavy tasks)

**Database:** MongoDB Atlas, Redis Streams (L2 ingestor buffer + sessions + queues), InfluxDB (L2 order book time-series, latency, whale events)

**Security:** AES-256-GCM, HMAC-SHA256, JWT + refresh tokens, bcrypt, express-rate-limit, SHA-256 audit integrity hashing

**Infra:** Docker + Docker Compose (Node.js backend + Python ML + MongoDB + Redis + InfluxDB + Ollama), GitHub Actions CI/CD, Vercel (frontend), Railway (backend + ML)

**Monitoring:** Sentry, Datadog APM, Stripe (billing), k6 (load testing)

**Exchange APIs:** Binance REST v3 + WebSocket depth stream (`@depth20@100ms`), Bybit v5, OKX v5

**Ecosystem:** MCP server, Chrome Extension MV3, React Native (Expo), TradingView Pine Script v5, npm SDK

---

## 📐 Institutional Upgrade Paths (Document, Don't Build Yet)

These are real production upgrades that a J.P. Morgan engineer would implement at scale. Document them in your README/ARCHITECTURE.md to demonstrate you understand the tradeoffs — you don't need to build them for a student portfolio.

| Current Stack | Production Upgrade | Reason | When to Upgrade |
|---|---|---|---|
| Node.js WebSocket worker | **Go ingestor** | Go handles 10,000+ WebSocket msg/sec with goroutines; Node.js is fine up to ~500/sec | When tracking 20+ symbols live |
| Redis Streams | **Apache Kafka / NATS** | Kafka gives durable log replay, multi-consumer groups, backpressure | When ingesting across 5+ exchanges simultaneously |
| `.env` master key (AES-256-GCM) | **HashiCorp Vault / AWS KMS** | Vault means a server breach can't expose the master key — the app requests decryption on-the-fly | When handling real user funds or going to market |
| Railway/Vercel | **AWS EKS + RDS** | Kubernetes for horizontal pod scaling, managed DB with read replicas | When MRR > $1k/month |
| scikit-learn / Keras | **PyTorch + vLLM** | PyTorch for custom architectures; vLLM for serving multiple LLM agents in parallel | When Swarm engine needs GPU acceleration |

**How to use this on your resume/interviews:** "The current stack handles our traffic comfortably. I've architected the system to be swap-compatible — the Node.js ingestor can be replaced with a Go service behind the same Redis Streams interface without frontend changes. I understand when and why that upgrade becomes necessary."

---

## 🧭 SUPPLEMENTAL MASTER REFINEMENT LAYER

> This section does not replace any part of the roadmap. It expands it, cross-references it, and turns it into an execution-ready SaaS blueprint.

---

## 0. How This Roadmap Should Be Used

This file is the single source of truth for FillScore development.

### Operating rules
- Keep all work **small, reversible, and testable**.
- Use Antigravity prompts for **one task at a time**.
- Ask for **only the delta** when creating prompts.
- Never request full-file outputs inside a prompt if a partial patch is enough.
- Keep any large outputs, logs, screenshots, or generated files **outside the prompt** and provide them manually.
- Preserve existing work unless a change is clearly required.
- Prefer adding a new section over rewriting a stable section.
- Treat this document as a living product bible, not just a backlog.

### Prompt discipline
Each agent prompt should include:
- the exact file or endpoint
- the exact change requested
- validation criteria
- any known constraints
- a request for a minimal patch only

### Anti-token-waste rules
- Do not ask for entire codebases if only one function changed.
- Do not ask for output in the prompt.
- Do not mix backend and frontend changes unless they are inseparable.
- Do not merge multiple unrelated tasks in one Antigravity run.
- Do not ask for the whole page when only one section changed.
- If the issue is only in a subsection, ask for the subsection only.

---

## 1. Developer-First Build Strategy

### 1.1 Architecture principles
- Keep the backend and frontend loosely coupled.
- Keep one canonical trade schema across all exchanges.
- Keep market enrichment separate from scoring.
- Keep scoring separate from audit aggregation.
- Keep AI/ML separate from core execution logic.
- Keep enterprise features behind explicit plan gates.
- Keep all secrets encrypted at rest.
- Keep every transformation deterministic wherever possible.
- Keep time-series data (OBI, latency, regime) in InfluxDB — not MongoDB.
- Keep agent verdicts versioned alongside scoring engine versions.

### 1.2 Data contract strategy
Use one stable contract per layer:
- Raw exchange trade payload
- Normalised internal trade
- Enriched trade with market context (+ OBI, whale pressure, latency)
- Scored trade with component metrics (+ regime-adjusted weights)
- Agent council verdict with per-agent assessments
- Audit summary with rollups + simulation results
- Narrative / agent output with explanation + citations

### 1.3 Safety and correctness
- Validate every inbound request with runtime schema checks.
- Use strict TypeScript everywhere.
- Enforce idempotency in ingestion.
- Prevent duplicate persistence.
- Make retry logic explicit.
- Add guardrails for zero volume, missing candles, and failed market lookups.
- Add logging that helps debugging without leaking secrets.
- Never let agents invent scores, costs, or trades — ground all outputs in MongoDB data.

### 1.4 Observability
Every major pipeline step should be observable:
- connection attempts and key rotation events
- ingestion counts per exchange
- enrichment success / fail counts
- OBI snapshot coverage rate (% of trades with OBI data)
- scoring duration
- audit duration
- agent council latency per agent
- swarm simulation duration per run
- AI latency (narration, chat)
- export latency
- webhook failures

### 1.5 Product engineering rule
Every feature should answer at least one of these:
- Does it improve trust?
- Does it reduce confusion?
- Does it save money?
- Does it give the user an action?
- Does it help the developer maintain the system?

If not, it should be deferred.

---

## 2. User-First Product Strategy

### 2.1 First-time user experience
The first-time user should understand:
- what FillScore is
- why they should trust it
- how it protects their API keys
- what they get immediately after connecting

### 2.2 Trust signals
Users need to repeatedly see:
- read-only permission warning
- encryption warning / reassurance
- transparent data usage
- no hidden trading actions
- explanation of what FillScore can and cannot do
- audit integrity verification badge

### 2.3 Value moments
The app should create value at several moments:
- immediately after connecting
- immediately after first audit
- immediately after heatmap rendering
- immediately after seeing estimated loss
- immediately after reading the first recommendation
- immediately after comparing symbols or exchanges
- immediately after Agent Council verdict appears
- immediately after a swarm simulation completes

### 2.4 Cognitive load
Minimize friction:
- one primary action per screen
- one major insight per card
- one chart per question
- one recommendation per problem
- one explanation per number

### 2.5 Motivation loop
The product should encourage users to:
- improve execution quality
- move toward limit orders
- trade in better liquidity windows
- compare exchanges intelligently
- ask more questions about their own data
- simulate before they trade

---

## 3. Cross-Reference Matrix: Developer vs User Lens

| Area | Developer Objective | User Benefit |
|---|---|---|
| Ingestion | Stable, deduplicated trade import | Accurate trade history |
| Enrichment | Deterministic market context lookup + OBI + latency | Honest cost estimates with market context |
| Scoring | Correct formulas, unit tests, regime weighting | Clear FillScore grade adjusted for market conditions |
| Audit | Notional-weighted rollups + integrity hash | Monthly summary, loss estimate, audit proof |
| Analytics | Fast aggregation, OBI heatmap, whale correlation | Find patterns quickly, understand market impact |
| Agent Council | LangGraph parallel agents + synthesis | Expert multi-perspective audit verdict |
| Swarm Simulation | Monte Carlo agent-based simulation | Preview future performance before changing strategy |
| AI Chat | Grounded RAG + safe prompts + source citations | Ask questions in plain English, get data-backed answers |
| Forecasting | Versioned LSTM + regime-conditional | Predict future performance |
| Enterprise | Auth, billing, roles, observability, k6 SLOs | Team usage, trust, reproducible audits |
| Ecosystem | SDK, MCP, browser extension | Use FillScore anywhere |

---

## 4. Expanded Phase 1 Refinement

Phase 1 is already built, but it still needs hardening and polish so it behaves like a real SaaS foundation.

### 4.1 What is already strong
- Binance ingestion, AES-256-GCM key storage, enrichment pipeline, scoring engine, audit summary, dashboard / history / analytics screens

### 4.2 What should still be improved

#### Data reliability
- add ingestion resume logic
- add duplicate detection reporting
- add raw payload archival for debugging
- add symbol-by-symbol ingestion checkpoints

#### Math reliability
- handle zero-volume candles
- handle missing or delayed kline data
- handle negative or invalid numeric values
- add score boundary tests for all thresholds

#### API reliability
- add request correlation IDs
- add structured error responses
- add route-level latency logging
- add pagination safety checks
- add response caching where appropriate

#### UI reliability
- improve loading skeletons
- add empty-state cards
- add "no trade data" messaging
- keep heatmap / tables responsive on narrow screens

### 4.3 Phase 1 exit criteria
- all formulas are unit tested
- every important endpoint is protected by validation
- all major screens render without console errors
- no duplicate trade ingestion is possible
- audit summaries are reproducible

---

## 5. Expanded Phase 2 Refinement

### 5.1 Analytics deep-dive page should answer six questions
1. When do I execute best?
2. Which symbols do I execute best?
3. Which order styles cost me the most?
4. Which exchange performs best for my style?
5. Am I trading into whale activity?
6. How does my order book timing compare to institutional patterns?

### 5.2 Additional analytics features to include

#### Execution efficiency heatmap (enhanced)
- score by day and hour
- whale pressure overlay (red dot for coincident whale activity)
- OBI at execution overlay (color-coded by market pressure)
- highlight high-density poor-performance cells
- show "best window" and "worst window" annotations

#### Slippage histogram
- bucket by small bps ranges
- show positive and negative slippage separately
- distinguish buys from sells
- overlay whale-correlated vs. clean trades

#### Fee drag view
- maker vs taker breakdown
- total fee cost
- fee drag as a percentage of monthly notional
- estimated savings if maker ratio improved

#### Symbol comparison
- compare notional, score, maker ratio, slippage, fee drag, whale exposure per symbol
- show which symbol is most consistent
- show which symbol is most expensive

#### Hourly quality chart
- use sorted hourly data
- OBI and whale pressure overlays per hour
- show best/worst hour markers

#### Benchmarking
- compare against platform average
- compare against user's own prior period
- compare against a synthetic "ideal trader" benchmark (80% maker, 8–16 UTC, BTC/ETH only)

---

## 6. Expanded Phase 3 Refinement

Phase 3 should make FillScore feel intelligent, not just descriptive.

### 6.1 AI capabilities grouped into three layers

**Layer A — Predict:** score forecasting (LSTM), pre-trade fill prediction (RandomForest), regime-adjusted future score estimates (HMM + LSTM combined), regime transition alert

**Layer B — Explain:** audit narration (Claude), trade-level explanations, anomaly explanations, agent council verdicts with conflict resolution, whale impact explanation

**Layer C — Simulate:** swarm simulation (500 agents, 1000 runs), what-if scenarios, counterfactual cost estimates, Shadow Trader strategy simulator

### 6.2 Agent stack for FillScore

**Liquidity Scout Agent** — analyzes OBI, book depth, whale correlation, market impact
**Alpha Architect Agent** — benchmarks TWAP/VWAP deviation, opportunity cost
**Risk Auditor Agent** — volatility, concentration risk (HHI), adverse selection
**Fee Optimizer Agent** — maker/taker ratio, VIP tier opportunity, cross-exchange fee arbitrage
**Synthesis Agent** — resolves conflicts, prioritizes by regime, produces final narrative
**Narration Agent** — turns structured findings into readable, tone-appropriate prose
**Simulation Agent** — runs swarm scenarios and interprets distribution results

### 6.3 What the LLM should never do
- invent trades, scores, or costs
- claim certainty where there is none
- recommend risky or irrelevant actions without data grounding
- output whale correlation data without time-series source citation

### 6.4 AI quality requirements
- outputs must cite the underlying data fields used
- outputs must include uncertainty or approximate framing
- outputs must be reproducible given the same context packet
- outputs must be short enough for the user to act on

---

## 7. Expanded Phase 4 Refinement

### 7.1 Core enterprise capabilities
- authenticated user accounts, password resets, verification emails
- plan gating, subscription management, billing resilience
- team dashboards, org-level summaries
- API rate controls, audit logs
- SSO / SAML (Phase 5 stretch)
- white-label API access

### 7.2 SaaS product necessities

#### Product analytics
Track: signup conversion, connection conversion, audit completion rate, feature adoption, agent council usage, simulation usage, AI prompt count, report export rate

#### Feature flags
Use flags for: agent council rollout, swarm simulation access, DEX analysis beta, new exchange connectors

#### Billing resilience
- retries for failed payments
- grace period handling
- downgrade behavior
- access lockout policy
- invoice visibility

#### Security and compliance
- clear data deletion flow
- export my data
- remove my data
- account recovery
- role auditing
- IP/session visibility
- rate-limit transparency

---

## 8. Expanded Phase 5 Refinement

### 8.1 Ecosystem philosophy
The goal is to make FillScore something others build on.

### 8.2 Platform building blocks
- MCP server, SDK, browser extension, plugin system, mobile app, public datasets, TradingView integration, research exports, open API docs

### 8.3 Recommended ecosystem additions

#### 8.3.1 Simulation sandbox
A safe space for: backtesting execution quality, testing hypothetical strategies, replaying past months, running swarm simulations

#### 8.3.2 Community benchmark leaderboard
Opt-in ranking by: FillScore, maker ratio, average slippage, whale-avoidance score, best symbol consistency

#### 8.3.3 Research mode
Offer: anonymized datasets, CSV exports, benchmark charts, reproducible methodology summaries, agent council decision logs for research

#### 8.3.4 Agent marketplace
Allow future plugins such as: custom scoring agents, commentary agents, signal agents, risk agents, trade-journal agents

---

## 9. Minimal Task Graph for Step-by-Step Execution

### Phase 1 remaining hardening tasks
1. Add missing validation to ingestion routes
2. Add unit tests for scoring boundaries
3. Add safe fallback for bad market data
4. Add structured error middleware
5. Add demo-user seed verification
6. Add endpoint pagination safety
7. Add performance logging

### Phase 2 task graph
1. Add cost attribution chart
2. Add slippage histogram
3. Add fee drag breakdown
4. Add Bybit connector
5. Add OKX connector
6. Add exchange comparison
7. Add OBI engine (InfluxDB + Redis Streams + worker_threads)
8. Add whale correlation heatmap
9. Add execution latency benchmarking
10. Add spoofing / ghost order detector
11. Add CSV export
12. Add PDF export
13. Add benchmark endpoint
14. Add shareable score card
15. Add websocket updates

### Phase 3 task graph
1. Scaffold ML service
2. Set up Ollama Docker sidecar with Llama 3 8B
3. Add anomaly detection
4. Add narration engine (Claude API)
5. Add pre-trade estimator (RandomForest + SHAP)
6. Add cost attribution model
7. Add clustering (K-Means + PCA)
8. Add forecasting (LSTM + regime-conditional)
9. Add regime detection (HMM 4-state)
10. Add regime transition forecasting
11. Add chat interface (Ask Your Trades — Claude API)
12. Add Agent Council (LangGraph: Ollama specialists + Claude synthesis)
13. Add swarm simulation engine (OU order book + KDE output)
14. Add simulation UI (KDE probability curve)

### Phase 4 task graph
1. Add auth (JWT)
2. Add OAuth (Google + GitHub)
3. Add Stripe billing
4. Add orgs and teams
5. Add Docker + CI/CD
6. Add Redis caching
7. Add observability (Sentry + Datadog)
8. Add white-label API
9. Add key rotation and vaulting
10. Add k6 load testing
11. Add deterministic audit replays

### Phase 5 task graph
1. Add MCP server
2. Add SDK package
3. Add browser extension (with OBI overlay)
4. Add mobile app scaffold
5. Add DEX analysis
6. Add Shadow Trader simulator
7. Add cross-exchange arbitrage analysis
8. Add public dataset export
9. Add community plugin architecture
10. Add full agent debate UI

---

## 10. Notion Operating Model

### 10.1 Roadmap database
Fields: Phase, Area, Task, Priority, Status, Owner, Dependency, Estimate, Last updated, Notes

### 10.2 Prompt library database
Fields: Prompt title, Task reference, Target files, Delta scope, Expected validation, Reusable or one-off, Status

### 10.3 Bug log database
Fields: Bug title, Affected phase, Severity, Repro steps, Root cause, Fix prompt, Status

### 10.4 Decision log database
Fields: Decision, Date, Why, Alternatives, Impact, Related tasks

### 10.5 Experiment database
Fields: Idea, Hypothesis, Phase, Metric, Result, Keep / drop / iterate

### 10.6 Release log database
Fields: Version, Phase, Features shipped, Scoring engine version, Known issues, Follow-up tasks

---

## 11. Additional High-Impact Features

### 11.1 Execution coach mode
A guided mode that shows: best time to trade, order-type guidance, size guidance, venue guidance (including OBI-aware routing), cost estimates

### 11.2 Trade journal notes
Allow users to attach notes: "entered on breakout", "trade was emotional", "market order due to speed". Later used in LLM analysis and anomaly correlation.

### 11.3 Personal execution policy
A user-defined policy: preferred hours, max spread tolerance, max slippage tolerance, maker-first preference, ignored symbols, whale-avoidance toggle

### 11.4 Saved views
Users can save: favorite filters, favorite symbols, preferred analytics layout, saved simulation scenarios

### 11.5 Alerting center
Triggers when: slippage spikes, fee drag rises, night trading increases, execution score drops, exchange changes, regime transition imminent, whale pressure index high

### 11.6 Counterfactual simulator (Shadow Trader)
Powered by swarm engine: "What if I had used limit orders?", "What if I only traded 8–16 UTC?", "What if I traded BTC only?", "What if I traded on Bybit instead?"

### 11.7 Smart summaries
One-line summaries after each audit: what changed, what helped, what hurt, what to do next, what the Agent Council recommends first

### 11.8 Real-Time Market Intelligence Feed (WorldMonitor-style)
A live feed panel on the dashboard showing: current OBI for user's most-traded symbols, active whale sweeps, regime status, market depth alerts. Updates via WebSocket every 1 second.

---

## 12. Quality Gates for Every Phase

A phase should not be marked complete unless:
- TypeScript compiles cleanly
- runtime checks pass
- the feature is usable in browser
- the API is stable and versioned
- the user can understand the result
- the result can be reproduced (audit integrity check passes)
- the feature does not leak secrets
- agent outputs cite their data sources
- the feature is documented in this roadmap

---

## 13. Final Product Vision, Refined

The ultimate FillScore product is not just a dashboard. It is:
- a scoring engine with institutional audit trails
- an execution coach with live market intelligence
- a quantitative analytics system with whale correlation
- a recommendation engine grounded in real data
- a multi-agent AI council for trade audit debate
- a swarm intelligence simulator for strategy preview
- a team product with org-level dashboards
- a research platform with anonymized benchmark datasets
- a developer platform with MCP server, SDK, and browser extension

That means the roadmap must always support: **trust · insight · action · scale · extensibility · reproducibility**

---

## 14. Build Priority Summary

### Must build next
- OBI Engine (InfluxDB + WebSocket depth stream) — this unlocks whale correlation, latency benchmarking, and pre-trade estimation simultaneously
- Analytics deep-dive improvements (slippage histogram, fee drag, whale correlation heatmap)
- Bybit connector
- Cost attribution

### Should build after that
- HMM regime detection (enables dynamic scoring and LSTM forecasting)
- Agent Council (LangGraph) — the highest-prestige feature for recruiters
- LLM narration and chat assistant
- LSTM forecast widgets
- Swarm simulation (most differentiated feature vs. all competitors)

### Can build later
- Enterprise auth and billing
- k6 load testing
- Deterministic audit replay
- SDK and MCP server
- Mobile app
- Browser extension
- DEX analysis
- Shadow Trader full UI

---

## 15. Updated Antigravity Working Style for This Roadmap

When working from this document:
- keep the prompt small
- provide the file path
- describe the delta only
- avoid full-file reproduction
- keep massive outputs outside the prompt
- validate after each change
- move to the next micro-task only after the current one is stable
- never prompt for an agent without first confirming the data contract it consumes
- never build a simulation before the scoring engine it simulates is fully unit tested

That is how this roadmap stays usable as a real build system.

---

## 16. Final Note

This roadmap should stay alive throughout the product lifecycle. Every new feature, bug fix, and design choice should map back to one of the phases above, and every phase should be improved only where it directly serves the user, the developer, or the product's long-term SaaS viability.

The three benchmark repositories studied during this roadmap update:
- **ai-hedge-fund (45.7k ⭐):** Inspired the multi-agent LangGraph council architecture, specialist-agent debate pattern, and structured verdict synthesis
- **WorldMonitor (44.1k ⭐):** Inspired the real-time L2 order book intelligence layer, whale correlation overlays, cross-stream signal convergence, and live market intelligence feed
- **MiroFish (54.1k ⭐):** Inspired the swarm intelligence simulation engine, agent-based Monte Carlo trajectory modeling, and the Shadow Trader counterfactual sandbox

FillScore's goal is not to replicate any of these — it is to synthesize their most powerful ideas into a focused, vertical platform that solves a specific institutional-grade problem for retail traders, and builds a career-defining portfolio project in the process.

---

*Last updated: April 2026 · Deepanshu · VIT Vellore · 23BIT0264*

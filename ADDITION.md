# FillScore — Comprehensive Code Audit, Architecture Review & Roadmap Gap Analysis

> **Auditor Roles:** Project Manager & Senior Full-Stack / Quant AI Systems Architect  
> **Date:** October 2026  
> **Repository:** `FillScore` (Next.js 16, Express/TypeScript, FastAPI/Python, LangGraph, MongoDB)  
> **Scope:** Full-stack audit of existing codebase, live UI/UX evaluation via Playwright, test verification (560 tests), alignment against Master Roadmap (`ROADMAP.md`), security & open-source readiness, competitive teardown of trending GitHub AI/quant repos, and concrete architectural addition specifications.

---

## Executive Summary

FillScore occupies a distinct and defensible market niche: **Crypto Transaction Cost Analysis (TCA) powered by a Grounded Multi-Agent Audit Council**. While almost all AI-crypto projects on GitHub attempt to **predict** markets (unfalsifiable, fraught with severe regulatory exposure and hallucinations), FillScore **audits the past** using real microstructure data (Binance, Bybit, OKX) with a deterministic scoring engine and a compute-then-judge LangGraph agent debate.

### Overall Audit Verdict
* **Quantitative & Agent Engine:** **A-** — Exceptionally well-grounded mathematically. The 4-component composite score (35% slippage, 25% fees, 25% timing, 15% spread), implementation shortfall calculation (Perold 1988), and verification gate (`verification.py`) represent top-tier engineering that eliminates LLM hallucinated numbers.
* **Code Quality & Test Coverage:** **Solid A** — **560 tests passing** across 3 services (Backend: 269 tests across 31 files; Frontend: 47 tests across 8 files; ML Service: 244 tests across 24 files). Zero TypeScript compilation errors (`tsc --noEmit` passes clean on both frontend and backend). Production Next.js 16 Turbopack build succeeds.
* **Runtime Production Readiness:** **C+** — The ml-service is currently undeployed; the live server in Railway Singapore (`sin1`) suffers HTTP 451 geo-blocking from Binance; and local ML-to-Mongo connectivity in the FastAPI service failed during live audit due to env precedence (`AtlasError: bad auth`).
* **Frontend UI/UX (Awwwards & SaaS Benchmark):** **B-** — Clean dark palette, but exhibits classic AI-template patterns: hardcoded placeholder recommendations ("if you increase maker ratio to 80%" shown to a 100% maker trader), fabricated trend chart data, font pairing mismatch (`Playfair Display` serif in a quant terminal), unhandled guest-flash redirects, and a missing product hero experience.
* **Open-Source & Security Readiness:** **B** — Strong AES-256-GCM encryption for exchange keys, immutable provenance tags (`synthetic-demo` vs `real-user`), and strict account-level JWT isolation. However, it lacks a CI/CD pipeline (`.github/workflows/`), has no CSRF protection on refresh cookies, leaks OAuth tokens in URL redirects, and lacks Terms of Service / Privacy Policy documents.

---

## 1. Roadmap Reconciliation: Built vs. Partial vs. Remaining

Audited against `ROADMAP.md` (Master Roadmap):

### 1.1 Phase 1 & 2: Core TCA Platform & Data Engine
| Item ID | Feature Description | Status in Code | Runtime Reality | Audit Finding |
|---|---|---|---|---|
| **T1.x** | 4-Component Weighted Scoring Engine | ✅ Complete | ✅ Live | `scoring/engine.ts` correctly weights 35% slippage, 25% fees, 25% timing, 15% spread. |
| **T1.x** | Binance Ingestion & Market Data Enrichment | ✅ Complete | 🟥 Blocked Prod | Blocked by HTTP 451 on Railway Singapore (`sin1`). Parallelized 4-call sync works locally. |
| **T2.1** | Analytics Deep-Dive Page | ✅ Complete | ✅ Live | `/analytics` renders heatmap, symbol breakdown, and slippage distribution. |
| **T2.2** | Bybit Trade Connector | 🟨 Code Built | 🟥 Dead Code | Client and tests exist, but unreachable via API routes; lacks read-only key validation. |
| **T2.3** | OKX Trade Connector | 🟨 Code Built | 🟥 Dead Code | Client and tests exist; `Trade.exchange` enum in MongoDB model omits `'okx'`. |
| **T2.4** | Exchange Comparison / Venue Alpha | ✅ Complete | ✅ Live | Compares fill quality across venues on `/dashboard`. |
| **T2.5** | PDF Audit Report Export (`ReportService`) | ✅ Complete | 🟨 Demo-Only | PDFKit generator works, but hidden behind `dashboardMode === 'demo'` for real users. |
| **T2.6** | CSV Trade History Export | ✅ Complete | ✅ Live | `/trades` exports accurate CSV with all execution metrics. |
| **T2.8** | Public Shareable Score Card | ✅ Complete | ✅ Live | `/share/[userId]` renders public grade, stats, and social sharing links. |
| **T2.12** | Whale Correlation Heatmap | 🟨 Demo-Only | 🟥 Null Glitch | Evaluates aggTrades bursts, but synthetic slippage uses `Math.random()`, invalidating the null. |

### 1.2 Phase 3 & 4.4: AI/ML & The Agent Council (AC-0 to AC-15)
| Item ID | Feature Description | Status in Code | Runtime Reality | Audit Finding |
|---|---|---|---|---|
| **T3.1** | FastAPI Service Scaffold | ✅ Complete | ✅ Running | Port 8000. Serves `/health`, `/ml/agents/council`, and SSE streaming. |
| **AC-0..3**| LangGraph State Graph & Specialist Fanout | ✅ Complete | ✅ Functional | 4 specialists (Liquidity, Fee, Alpha, Risk) run parallel analysis. |
| **AC-4** | Grounding Contract (`grounding.py`) | ✅ Complete | ✅ Functional | Extracted numbers strictly verified against Python evidence packet. |
| **AC-5** | Counterfactual Verification Gate | ✅ Complete | ✅ Functional | `verification.py` deterministically recomputes savings and catches hallucinations. |
| **AC-6** | Execution Trial Debate | ✅ Complete | ✅ Functional | Bounded 2-round Prosecution vs Defense debate before Judge. |
| **AC-7** | Synthesis v2 & Conflict Ledger | ✅ Complete | ✅ Functional | Merges verdicts without fence-sitting; estimates monthly cost USD. |
| **AC-8** | Council Run Persistence & Replay | 🟨 Partial | 🟨 Persistence Only | Persists run in MongoDB, but `POST /ml/agents/council/replay/{runId}` is not built. |
| **AC-9** | SSE Streaming UI (`AgentCouncil.tsx`) | ✅ Complete | 🟨 Error Handling Gap | Streams step-by-step agent cards, but displays raw Mongo errors when DB fails. |
| **AC-11**| Walk-Forward Eval Harness | ✅ Complete | ✅ Verified | Leakage-free temporal split at 2024-01-15 (`assert_no_future_leakage`). |
| **AC-14**| Cost Telemetry | ✅ Complete | ✅ Functional | Telemetry captures exact token usage and latency per agent call. |

### 1.3 Phase 4: Production SaaS & Security Infrastructure
| Item ID | Feature Description | Status in Code | Runtime Reality | Audit Finding |
|---|---|---|---|---|
| **T4.0** | Fail-fast Env Validation | ✅ Complete | ✅ Verified | `config/env.ts` validates required keys at startup without printing secrets. |
| **T4.1** | JWT Authentication & Refresh Rotation | ✅ Complete | ✅ Live | 15-min JWT, bcrypt(12), SHA-256 hashed refresh tokens with family revocation. |
| **T4.2** | OAuth2 (Google & GitHub) | ✅ Complete | ✅ Verified | Both providers link accounts by verified email; cookie SameSite handled. |
| **T4.12**| Account-Scoped Isolation | ✅ Complete | ✅ Live | `resolveAccount` derives identity from JWT; prevents cross-tenant access. |
| **T4.14**| Immutable Provenance Tagging | ✅ Complete | ✅ Live | `dataSource: 'synthetic-demo' \| 'real-user'` enforced with `immutable: true`. |
| **T4.17**| Real-User Onboarding Wizard | 🟨 Partial | 🟥 Blocked | Connects Binance via read-only check; PDF and Trend charts disabled. |
| **T4.18**| Incremental Sync & Re-scoring (R6-G6) | 🟥 Unbuilt | 🟥 Missing | Every sync refetches everything; no delta cursor (`lastSyncAt`). |
| **T4.5** | Docker & Compose | ✅ Complete | 🟨 Untested on ARM | Multi-stage Dockerfiles exist; Oracle Cloud aarch64 build unverified. |
| **R5-C7** | GitHub Actions CI/CD | 🟥 Unbuilt | 🟥 Missing | No `.github/workflows/` directory in repo. Merges are ungated. |
| **T4.3/19**| Stripe Billing & Quotas (R5-C4) | 🟥 Unbuilt | 🟥 Missing | No `stripe` dependency; free users cannot upgrade to paid tiers. |
| **T4.13**| Groq Multi-Tenant Budget & Queue (R5-C1)| 🟥 Unbuilt | 🟥 Risk | 100K TPD limit allows only ~8 runs/day across all users; no BullMQ/Redis queue. |
| **T4.6** | Redis Caching & Distributed Rate Limit | 🟥 Unbuilt | 🟥 In-Memory Only | Uses in-memory `express-rate-limit`; limits fail across multi-instance nodes. |
| **T4.15**| Reader/Writer Isolation & SECURITY.md | 🟥 Unbuilt | 🟥 Missing | Raw text from notes not passed through isolated reader agent; no SECURITY.md. |
| **T4.11**| Deterministic Audit Replay (R5-C6) | 🟥 Unbuilt | 🟥 Missing | No `ScoringVersion` tracking or `auditIntegrityHash` tamper check. |
| **R6-G1** | Terms of Service & Privacy Policy | 🟥 Unbuilt | 🟥 Legal Blocker | No legal pages linked on `/signup` or footer; violates GDPR preconditions. |

---

## 2. In-Depth Code & Runtime Defect Audit (Findings F1–F18)

During our end-to-end audit (running Next.js, Express, FastAPI, MongoDB, and Playwright browser sessions), the following concrete flaws were discovered:

### [P0 Critical] F1 — Agent Council MongoDB Authentication Failure (`AtlasError: bad auth`)
* **Location:** `ml-service/main.py:52-59` and `ml-service/.env`
* **Trigger:** Clicking "RUN ANALYSIS" on the dashboard Agent Council panel.
* **Mechanism:** `main.py` loads `ml-service/.env` with `override=False`, followed by `backend/.env`. The local `ml-service/.env` contained a stale or mismatched `MONGODB_URI` string. When the Python Mongo driver initializes (`_get_db()`), it throws:  
  `bad auth : authentication failed, full error: {'ok': 0, 'errmsg': 'bad auth : authentication failed', 'code': 8000, 'codeName': 'AtlasError'}`
* **Impact:** The flagship Agent Council fails immediately upon invocation for real database reads.
* **Remedy:** Standardize single-source-of-truth env loading, or ensure `ml-service` reads `backend/.env` directly or validates MongoDB connectivity on startup health check.

### [P1 High] F2 — Unhandled Council Error SSE Exposure in Frontend
* **Location:** `ml-service/main.py:377` and `frontend/app/components/AgentCouncil.tsx`
* **Finding:** When any internal error occurs in Python (such as the Mongo auth error above, or a Groq 429 rate-limit exhaustion), the endpoint catches `Exception` and yields `sse("error", {"message": str(e)})`. The frontend component directly prints the raw exception string into the UI.
* **Impact:** Exposes internal database connection strings, credentials, or stack traces directly to end users.
* **Remedy:** Implement roadmap task **R5-M9** / **R6-D3**: Sanitize error messages, return a typed error code (`RATE_LIMIT_EXHAUSTED`, `DB_UNAVAILABLE`), and show an institutional "Degraded / Service Busy" card.

### [P1 High] F3 — Fabricated Score Trend History
* **Location:** `frontend/app/dashboard/page.tsx:82-90`
* **Code:**
  ```typescript
  const generateTrendData = (currentScore: number) => {
    const months = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'];
    const variance = [-12, -8, -5, -2, -1, 0];
    return months.map((month, i) => ({
      month,
      score: Math.min(100, Math.max(0, Math.round(currentScore + variance[i]))),
      isCurrent: i === months.length - 1
    }));
  };
  ```
* **Impact:** The 6-month historical score chart is entirely simulated using a hardcoded delta array. This violates the core positioning ("Audit the past with mathematical truth").
* **Remedy:** Implement roadmap task **R6-D1 / R5-M4**: Introduce an append-only `AuditHistory` collection. Plot real past audits; if only one audit exists, display a clear "Initial Audit Completed — History builds with subsequent syncs" state.

### [P1 High] F4 — Static / Illogical Recommendation Copy on Analytics Page
* **Location:** `frontend/app/analytics/page.tsx:613-616`
* **Finding:** Under Fee Drag Analysis, the interface displays:
  ```html
  <p>If you increase maker ratio to 80%, you could reduce fee drag</p>
  ```
  Even when evaluating `demo-disciplined`, who already possesses a **100.0% Maker Ratio**, the card still advises increasing the maker ratio to 80%!
* **Impact:** Immediate loss of user trust; makes the platform look like a dumb AI mock rather than a rigorous TCA system.
* **Remedy:** Dynamically evaluate `if (feeStats.makerRatio < 80)` before displaying this prompt; if `>= 80%`, display "Optimal Maker Ratio maintained (≥80%) — fee drag minimized."

### [P1 High] F5 — Missing `okx` in Mongoose `Trade.exchange` Enum
* **Location:** `backend/src/models/Trade.ts:17`
* **Code:** `exchange: { type: String, enum: ['binance', 'bybit'], required: true }`
* **Impact:** OKX is touted across the marketing page and roadmap, and client code exists in `OKXClient.ts`, but saving any ingested OKX trade via standard Mongoose validation will throw a `ValidationError` because `'okx'` is omitted from the schema enum.
* **Remedy:** Update enum to `['binance', 'bybit', 'okx']`.

### [P1 High] F6 — Onboarding Rejects Supported Exchanges
* **Location:** `backend/src/routes/onboarding.ts:33-35`
* **Code:**
  ```typescript
  if (exchange !== 'binance') {
      return res.status(400).json({ error: 'exchange_not_supported_yet' });
  }
  ```
* **Impact:** The frontend onboarding UI presents Bybit and OKX as primary cards. When an authenticated user selects either, the API immediately rejects the request with HTTP 400.
* **Remedy:** Implement **R5-C10**: Wire Bybit and OKX read-only key validation into `keyValidation.ts` and remove the artificial block.

### [P2 Medium] F7 — Missing CSRF Protection on Mutating Auth Routes
* **Location:** `backend/src/routes/auth.ts:113-144`
* **Finding:** `/api/auth/refresh` and `/api/auth/logout` rely entirely on `req.cookies.refreshToken`. Neither route validates a CSRF header, double-submit token, or the `Origin` / `Referer` header against `ALLOWED_ORIGINS`.
* **Impact:** Malicious third-party sites can trigger unintended token rotation or session logout via CSRF.
* **Remedy:** Implement **R5-M3**: Add CSRF origin verification middleware to cookie-authenticated endpoints.

### [P2 Medium] F8 — OAuth Tokens Exposed in URL Query String
* **Location:** `backend/src/routes/auth.ts:173`
* **Code:** `res.redirect(`${frontendUrl}/?accessToken=${user.accessToken}`);`
* **Impact:** The JWT access token is transmitted in plaintext in the browser address bar. It persists in browser history, proxy access logs, and the `Referer` header if outbound links are clicked.
* **Remedy:** Implement **R6-G3**: Emit a short-lived (30s) single-use authorization code; the frontend exchanges this code via a POST request for the token pair.

### [P2 Medium] F9 — Email Verification Inactive for Password Signups
* **Location:** `backend/src/services/authService.ts:46-50`
* **Finding:** When a user registers with email/password, `emailVerified` defaults to `false`. No activation email is dispatched, and no endpoint exists to verify the email. However, OAuth users get `emailVerified: true`.
* **Impact:** Fake/disposable emails can hoard account IDs; unverified accounts cannot be pruned.
* **Remedy:** Implement **R6-G2**: Utilize existing Resend/nodemailer infrastructure to dispatch a hashed verification token upon registration.

### [P2 Medium] F10 — Unbounded `daysBack` Parameter in Audit Runner
* **Location:** `backend/src/routes/audit.ts:90-91`
* **Finding:** `const daysBack = daysBackStr ? parseInt(daysBackStr, 10) : INGEST_DAYS_BACK;` lacks range validation.
* **Impact:** Passing `daysBack=-100` or `daysBack=100000` causes uncontrolled query execution and potential DoS against exchange rate limits.
* **Remedy:** Implement **R5-M8**: Add Zod schema validation restricting `daysBack` to `z.number().int().min(1).max(90)`.

### [P2 Medium] F11 — Double Mounting of `auditRouter`
* **Location:** `backend/src/index.ts:49-50`
* **Code:**
  ```typescript
  app.use('/api/audit', auditLimiter, auditRouter);
  app.use('/api', auditRouter); // exposes /api/score
  ```
* **Impact:** Mounting the full router at `/api` allows any endpoint on `auditRouter` (such as `POST /api/run`) to be accessed at `/api/run`, completely bypassing `auditLimiter`!
* **Remedy:** Implement **R5-M7**: Mount `auditRouter` exclusively at `/api/audit`, and expose a dedicated single route for `/api/score`.

### [P3 Low] F12 — Landing Page Hero Typo
* **Location:** `frontend/app/page.tsx:236`
* **Finding:** Headline text renders as: `Understand exactlywhat your trades cost you.` (missing whitespace between `exactly` and `what`).

### [P3 Low] F13 — Outdated Demo Grades Displayed on Landing Page
* **Location:** `frontend/app/page.tsx:58-91`
* **Finding:** Cards show Disciplined = 84 (A), Moderate = 67 (B), Aggressive = 41 (D).
* **Impact:** Contradicts the canonical locked dataset in §2.1 of `ROADMAP.md` (Disciplined: 95.89 A; Moderate: 84.81 B; Aggressive: 60.67 C).

### [P3 Low] F14 — Blotter Notional Formatting Precision
* **Location:** `frontend/app/trades/page.tsx:327`
* **Finding:** Trade notional is displayed with 4 decimal places (`$187.4277`) instead of standard 2-decimal currency formatting (`$187.43`).

### [P3 Low] F15 — Database Unique Index Missing on `Audit.accountId`
* **Location:** `backend/src/models/Audit.ts:13`
* **Finding:** `accountId` is indexed but lacks `unique: true`. If application code bypasses the upsert helper, duplicate canonical audit records can be inserted for a single account.

---

## 3. UI/UX & Design Audit: Achieving "Awwwards Level" & SaaS Standards

Audited against `design-taste-frontend`, `high-end-visual-design`, and `redesign-existing-projects`:

### 3.1 Typography & Visual Hierarchy
* **Current State:** The application loads `Playfair Display` (serif), `Inter` (sans), and `JetBrains Mono` in `layout.tsx`.
* **The Problem:** A high-fashion serif font (`Playfair Display`) clashes with institutional high-frequency crypto trading and quantitative risk analytics. Furthermore, plain `Inter` on dark backgrounds is the universal "generic AI" signature.
* **Awwwards-Level Recommendation:**
  * Adopt an elite neo-grotesque display typeface such as **`Geist`**, **`Cabinet Grotesk`**, or **`Satoshi`** for bold headlines (`tracking-tighter`, `font-semibold`, uppercase subheaders).
  * Pair with **`JetBrains Mono`** or **`IBM Plex Mono`** with `font-variant-numeric: tabular-nums` for all financial figures, bps metrics, and trade timestamps.
  * Eliminate the serif display font completely to unify the terminal/fintech aesthetic.

### 3.2 Color Calibration & Material Surfaces
* **Current State:** Background `#0f0f0f` with gold accent `#a78b71`, white borders with `rgba(255,255,255,0.06)`.
* **The Problem:** The dark theme is flat and sterile. Cards are standard rectangular boxes with uniform borders.
* **Awwwards-Level Recommendation:**
  * **Layered Elevation:** Base surface `#0a0a0c`, Card surface `#121215`, Card hover `#18181d`.
  * **Refraction Borders & Glass:** Replace flat borders with a 1px border gradient (`border-white/10` transitioning to `border-white/5`) plus an inner top highlight (`shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`).
  * **Subtle Noise & Depth:** Add a subtle, non-intrusive SVG film grain overlay (`opacity-[0.025]`, `pointer-events-none`) across the page to break digital banding.
  * **Accent Discipline:** Retain a singular high-contrast accent: Warm Gold (`#d4af37` / `#c5a059`) for prime branding, with functional Emerald (`#10b981`) for alpha/savings and Crimson (`#f43f5e`) for slippage/loss.

### 3.3 Component Polish & Interactive Motion
* **Hero Experience:** Currently a static centered text block and exchange buttons. Transform into an **interactive live execution terminal preview** (mock live order book matching engine or a dynamic slippage scrubber where users drag a trade size slider and watch execution shortfall widen).
* **Agent Council Experience:** When "RUN ANALYSIS" is clicked, replace the basic card list with a **visual deliberative graph** showing the four agents connected to a central debate arena, with audio-visual pulse waves or active status rays when the prosecution/defense nodes interact.
* **Micro-physics:** Implement tactile button feedback (`active:scale-[0.98]`, spring transition `stiffness: 300, damping: 20`).
* **Iconography:** Stop using raw unicode symbols (`🔒`, `⚡`, `📝`, `◈`, `◎`). Standardize strictly on **Lucide React** or **Phosphor Icons** with uniform `strokeWidth={1.5}`.

---

## 4. Competitive Teardown: Learning from Trending GitHub Repositories

Analysis of leading open-source repositories in AI trading, multi-agent finance, and quant execution:

### 4.1 What Trending Repositories Do
1. **`TradingAgents` (TauricResearch)**: Multi-agent debate between fundamentals, technicals, and sentiment specialists.  
   * *Takeaway for FillScore:* Bounded debate works extraordinarily well for credibility, but their target (predicting stock prices) is legally dangerous and unfalsifiable. FillScore's focus on **post-trade execution attribution** is vastly more defensible.
2. **`HKUDS/AI-Trader` (arXiv:2512.10971)**: Leakage-free agentic evaluation, strict token-scoped REST/MCP boundaries, and Sortino-family metrics.  
   * *Takeaway for FillScore:* Reinforces the need for **R6-A8 (Agent-Native MCP Gateway)** and zero-frontend tool access for LLMs.
3. **`tcapy` (cuemacro) & `slippage` (DaniyalMlk)**: Institutional Python TCA libraries implementing Almgren-Chriss market impact models, implementation shortfall decomposition, and arrival-price markouts (1s, 5s, 60s).  
   * *Takeaway for FillScore:* Adding **Almgren-Chriss theoretical optimal trajectories** to counterfactual analysis would allow FillScore to tell traders not just "you lost $18", but "an optimal Almgren-Chriss liquidation schedule would have reduced your market impact by 4.2 bps."
4. **`anthropics/financial-services`**: Enterprise blueprint establishing the three-tier **Reader / Writer / Orchestrator** security model and progressive-disclosure `SKILL.md` packaging.

---

## 5. Architectural Additions & Strategic Upgrades

To position FillScore as an elite, production-grade, open-source AI SaaS, we propose the following high-impact additions:

### 5.1 Architecture Addition 1: Agent-Native MCP Gateway (Task R6-A8)
* **What:** Expose FillScore's execution quality metrics natively to AI agents (Claude Code, Cursor, Antigravity, AutoGPT) via the **Model Context Protocol (MCP)**.
* **Implementation:**
  * FastMCP server hosted within the FastAPI service (`port 8000`).
  * Token-scoped authentication (`X-FillScore-Key`).
  * Exposed Tools:
    * `get_fillscore(trade_id)`: Granular 4-component score.
    * `audit_execution(user_id, timeframe)`: Full TCA report.
    * `query_whale_pressure(symbol, timestamp)`: Net order-flow imbalance.
    * `simulate_counterfactual(trade_id, alternative_strategy)`: Limit vs Market comparison.
* **Why:** In 2026, developers and quant funds don't just want web dashboards; they want their trading agents to query TCA scores programmatically before rebalancing portfolios.

### 5.2 Architecture Addition 2: RAG Longitudinal Memory via MongoDB Atlas Vector Search (Task R6-A4)
* **What:** Longitudinal memory for the Agent Council.
* **Implementation:**
  * When an audit completes, generate vector embeddings of the evidence packet and Council synthesis using `text-embedding-3-small` or `nomic-embed-text`.
  * Store in an Atlas Vector Search index scoped to `accountId`.
  * On subsequent runs, retrieve the top-3 most similar past audit findings.
  * Synthesis Prompt injection:  
    `"Prior Audit Context: In December, user suffered 18 bps slippage trading SOL at 19:00 UTC. In January, the same pattern recurred despite prior warning. Flag as an uncorrected recurring behavioral flaw."`
* **Why:** Transforms the AI from a one-shot stateless calculator into an ongoing institutional execution coach with memory.

### 5.3 Architecture Addition 3: Distilled SLM Judge — FillScore-Mini (Task R6-A3)
* **What:** A distilled 1.5B parameter language model (Qwen2.5-1.5B-Instruct) fine-tuned on verified Council run trajectories.
* **Implementation:**
  * Generate 3,000 synthetic (packet → debate → verdict) pairs using the 70B teacher model.
  * Fine-tune via LoRA (Unsloth on Colab T4).
  * Host the distilled model locally on the VPS or via low-cost vLLM inference.
  * Route simple, clean packets (e.g. <50 trades, zero whale anomalies) to `FillScore-Mini` (latency < 400ms, cost $0), reserving Groq 70B for contentious debate runs.
* **Why:** Permanently solves the Groq free-tier bottleneck (~8 runs/day across all users).

### 5.4 Architecture Addition 4: Verified Screenshot Ingestion via Vision Models (Task R6-C1)
* **What:** Allow users to upload a screenshot of their exchange trade blotter instead of pasting API keys.
* **Implementation:**
  * Multimodal VLM (Llama-3.2-11B-Vision or Groq Vision) extracts trade rows (timestamp, symbol, side, price, amount, fee).
  * **Deterministic Market Gate:** The server queries historical public Binance/Bybit aggTrades at that millisecond. If the reported price falls outside the high/low candle of that second, the row is rejected.
* **Why:** Solves the #1 user drop-off barrier (reluctance to enter API keys) and bypasses exchange IP geoblocking (HTTP 451).

### 5.5 Architecture Addition 5: Layered Redis Caching & Distributed Job Queue (Tasks R5-C8 & R5-C1)
* **What:** Introduce Redis (`ioredis` in Node, `redis-py` in Python) with BullMQ / Celery.
* **Implementation:**
  * Decouple long-running trade ingestion and Agent Council LLM calls into background worker queues.
  * Redis distributed rate limiter (`rate-limit-redis`) replacing in-memory limits.
  * Cache market klines and historical order books with TTL 24h (`market:${symbol}:${timestamp}`).
* **Why:** Prevents HTTP request timeouts during large account syncs and shields Groq API from duplicate packet evaluations.

---

## 6. Open-Source Readiness Checklist

To publish FillScore as a viral, star-worthy open-source repository on GitHub, the following assets must be completed:

1. **`.github/workflows/ci.yml`**:
   * Automated matrix test runner: Node.js 20 vitest, Python 3.11 pytest, Next.js build, and strict `tsc --noEmit`.
   * Leakage assertion gate (`assert_no_future_leakage()`).
2. **`SECURITY.md`**:
   * Threat model, key encryption methodology (AES-256-GCM), and responsible vulnerability disclosure policy.
3. **`CONTRIBUTING.md` & Dev Setup**:
   * One-line setup instructions using Docker Compose (`docker compose -f docker-compose.dev.yml up`).
4. **Interactive Sandbox / Mock Mode**:
   * Zero-config demo mode allowing any developer to clone and run the app with simulated trades without needing exchange API keys or MongoDB Atlas accounts.
5. **OpenAPI / Swagger Documentation**:
   * Auto-generated Swagger UI mounted at `/docs` using FastAPI and Zod-to-OpenAPI on Express.

---

## 7. Prioritized Implementation Roadmap (Phased Execution)

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Critical Bug Fixes & Integrity Lock (Sprint 1)               │
│ • Fix ml-service Mongo auth & isolate .env loading (F1)                │
│ • Fix landing page hero typo & sync canonical demo grades (F12, F13)   │
│ • Fix Analytics dynamic maker copy (F4) & blotter 2-decimal format(F14)│
│ • Add 'okx' to Trade.exchange enum & wire Bybit/OKX validator (F5, F6) │
│ • Add unique index on Audit.accountId (F15)                           │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│ Phase 2: Security, Auth & History Hardening (Sprint 2)                 │
│ • Implement Event-Sourced AuditHistory to replace fake trend chart(F3) │
│ • Add CSRF protection on refresh/logout & secure OAuth code redirect   │
│ • Add Zod schema validation to POST /audit/run & /connect              │
│ • Create Terms of Service & Privacy Policy pages (GDPR readiness)     │
│ • Setup GitHub Actions CI/CD workflow (.github/workflows/ci.yml)       │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│ Phase 3: Premium UI/UX Redesign & Awwwards Polish (Sprint 3)           │
│ • Typeface swap: Geist / Satoshi + JetBrains Mono tabular figures      │
│ • Layered dark glass design system, gradient borders & noise texture   │
│ • Interactive Hero Execution Terminal Preview                          │
│ • Visual LangGraph Council deliberative graph UI with real-time audio  │
│ • Replace raw unicode emojis with standardized Lucide icon system      │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│ Phase 4: Flagship Capabilities & Ecosystem Expansion (Sprint 4)        │
│ • R6-A8: FastMCP Agent Gateway on FastAPI port 8000                   │
│ • R6-A4: Longitudinal Memory via Atlas Vector Search RAG               │
│ • R6-C1: Verified Multimodal Screenshot Ingestion with Market Gate     │
│ • R6-A3: FillScore-Mini LoRA distillation on Colab T4                  │
│ • R5-C8 / R5-C1: Redis caching + BullMQ background worker queue       │
└────────────────────────────────────────────────────────────────────────┘
```

---

*Report prepared by Antigravity Senior Developer & Project Manager Agent.*  
*Ready for user review and approval prior to executing code modifications.*

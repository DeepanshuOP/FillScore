# FillScore — Master Roadmap

> **This is the only roadmap.** It is self-contained: every task from every prior roadmap generation
> (Supreme v2, Unified v4, Audit v5, Launch+Research v6) is inlined here with its full specification.
> You never need to open an archived roadmap. If something appears missing, it is a bug in *this*
> file — fix it here rather than consulting an older document, all of which contain known-wrong facts.
>
> **How to read it.** §1–§3 are always relevant. §4 is the complete task register — jump to the one
> ID you are working on and read only that. §5–§11 are reference.
>
> **ID namespaces (never renumbered, never reused):**
> `T1.x–T6.x` original v2/v4 task line · `AC-x` Agent Council series · `R5-x` v5 audit findings ·
> `R6-x` v6 additions. IDs are historical anchors; a task keeps its ID forever even when superseded.

---

## §1 — What FillScore is, and the lines that don't move

FillScore is a crypto **Transaction Cost Analysis** platform. It grades the quality of trades that
have already happened, against real market microstructure, producing an A–F composite score from four
weighted components: **slippage 35%, fees 25%, timing 25%, spread 15%**.

Five rules govern every decision in this document. A feature that violates one does not get built.

1. **Audit the past. Never predict.** No signals, no forecasts, no pre-trade estimates. This is the
   positioning, and it is also the legal-safety line — Council output is never financial advice.
2. **LLMs may label, argue, and explain — never originate a number.** Every numeric value traces to a
   deterministic Python/TypeScript computation. This is the *Grounding Contract*.
3. **Provenance is immutable.** `dataSource: 'synthetic-demo' | 'real-user'`, set once, enforced at
   schema level. Only trader *behaviour* is synthetic; all market and whale data is real.
4. **Correlation, never causation.** "Coincided with," not "caused."
5. **Secrets come from env only.** Never printed, never logged, never hardcoded, never in git.

**Goals, in priority order:** (1) placement — SDE, AI/ML, data-science roles, and a resume that earns
the interview; (2) a published research paper; (3) GitHub stars and recognition; (4) a sellable SaaS.

---

## §2 — Current state

### 2.1 — Canonical facts (do not re-derive)

**Demo grades — the current, correct set.** Any document showing `95.675 / 84.570 / 60.771` is stale;
those were retired after the P0 scoring-drift fix and the June whale re-enrichment.

| User | FillScore | Grade | Notes |
|---|---|---|---|
| `demo-disciplined` | **95.88542572161496** | A | Real Jan-2024 Binance timestamps, whale-enriched |
| `demo-moderate` | **84.80888516669383** | B | Real Jan-2024 Binance timestamps, whale-enriched |
| `demo-aggressive` | **60.67469266790485** | C | Real Jan-2024 Binance timestamps, whale-enriched |
| `demo-bybit` | **76.16413408878628** | B | Rolling last-30-day timestamps, re-randomise on reseed |
| `demo-okx` | **81.65894774026690** | B | Rolling last-30-day timestamps |
| `demo-multi` | **70.71963854879698** | C | Rolling last-30-day timestamps |

Accept A/B/C. Never chase a D. ~931 seeded trades total. Deterministic PRNG (mulberry32, seed 42) plus
a parquet window cache (`ml-service/whale/.cache/windows`) make reruns near-instant.

**Test counts:** backend 250 (30 files) · frontend 42 (7 files) · ml-service 221 passed + 1 skipped =
**513 total**. Any document saying "184 tests" is a start-of-session snapshot.

**Fee constants (real 2026 spot):** Binance 0.10/0.10 · Bybit 0.10/0.10 · OKX 0.08/0.10. Any roadmap
showing Bybit 0.02/0.055 is quoting futures rates mislabelled as spot.

**Whale correlation, final locked results.** Whale = *bursts* (consecutive same-direction aggTrades
within ≤1s, summed over a per-symbol notional threshold), not single trades or sweeps. Thresholds
calibrated to 15–40% detection: BTC/ETH $250k, SOL $100k, BNB $50k. Metrics: signed net order-flow
imbalance ∈ [-1,1] and proximity-weighted `whale_pressure` (exponential decay, τ=10s). Adverse rates:
BTC 14.3%, ETH 7.0%, BNB 17.9%, SOL 13.2% — **not comparable across symbols** (different thresholds).
**Result: no statistically significant whale-adversity→slippage relationship, pooled or per-symbol**
(Mann-Whitney p 0.13–0.98). The old BTC figure (7.52 bps, p=0.021) and ETH figure (p=0.0074) are
**retired** — artifacts of a pre-fix arrival-price bug and an underpowered sample. **But see §2.3 —
this null is instrumented wrong and R6-E5 must fix it before it can be reported as a finding.**
Scoped to the 3 Binance Jan-2024 demo users only.

**Agent Council eval (Tables 1–3, final corrected).** All three users, clean n=3 on whale-fixed
packets, each verified `n_calls=9`, failure-swept, and with the real recommendation text read.
E1 faithfulness = **1.0**; E2 agreement = **100%** for all three. E3 actionable/vacuous:
disciplined (A) 1 rec / 88.9% vacuous; moderate (B) 0 recs / 100% vacuous (pass-rate n/a);
aggressive (C) 7 recs / 22.2% vacuous. **Key finding: the worse-graded trader gets MORE actionable
recommendations** — problems generate actionable advice. The old "better trader = more actionable"
claim was a loader-bug artifact and is retired. Frame as descriptive across 3 profiles, not a
powered trend. E4 cost/latency: 27 runs / 264K tokens / $0.

### 2.2 — Component status

| Component | Code | **Runtime (prod)** | Evidence |
|---|---|---|---|
| Scoring engine (4-component weighted) | ✅ | ✅ Live | `scoring/engine.ts` |
| Audit aggregation + determinism fix | ✅ | ✅ Live | `scoring/audit.ts:35` stable sort; `POST /audit/run` sole writer |
| Binance ingestion + enrichment | ✅ | 🟥 **Blocked — HTTP 451 from Railway `sin1`** | `TradeIngestionService.ts` |
| Bybit / OKX connectors | 🟨 Coded, unreachable | 🟥 Dead code | no route reaches them; no key validator exists for either |
| JWT auth + OAuth (Google/GitHub) | ✅ | ✅ Live, both verified | `authService.ts`, `passport.ts` |
| Per-account isolation | ✅ | ✅ Live | `resolveAccount.ts` — identity always from JWT |
| Immutable provenance tagging | ✅ | ✅ Live | `Trade.ts:16`, `Audit.ts:14` |
| Real-user onboarding | 🟨 Partial | 🟥 Blocked by 451 | report card + trend chart unmet |
| Agent Council (AC-0…AC-11, 14, 15) | ✅ | 🟥 **NOT DEPLOYED** | ml-service has no host |
| Council replay endpoint | 🟥 | — | `main.py` has load, not replay |
| Whale correlation | 🟨 Hardcoded to 3 demo users | 🟥 Silently empty for real users | `whale/enrich.py:158-162` |
| PDF/CSV export, share card, Coach, Journal | ✅ | 🟨 Hidden from real users | `dashboard/page.tsx:469` demo-only gate |
| Docker | ✅ | 🟨 x86 only; ARM rebuild unverified | both Dockerfiles exist |
| CI/CD | 🟥 | — | no `.github/workflows` |
| Stripe / metering / GDPR / compliance | 🟥 | — | no `stripe` dependency |
| Redis / queue / distributed rate limit | 🟥 | — | no `ioredis` |
| Observability (Sentry/OTel/Langfuse) | 🟥 | — | no matching dependency |
| Injection isolation + SECURITY.md | 🟥 | — | no reader/writer split |
| Groq multi-tenant budget | 🟥 | 🟥 **~8 council runs/day, all users combined** | 100K TPD ÷ 11.6K/run |
| ToS / Privacy Policy | 🟥 | 🟥 Legal precondition for EU users | — |
| Email verification (password signups) | 🟥 Dead code | 🟥 `emailVerified` never set true | only OAuth sets it |
| Standalone ML (LSTM/K-Means/IF/HMM) | 🟥 | — | three revived with new framing (§4.6), two cut (§7) |

**`ARCHITECTURE.md` is stale** — it predates all of Phase 4 and lists already-rotated secrets as open
gaps. Do not trust it for build status until R6-D10 regenerates it.

### 2.3 — Corrections to prior roadmaps (evidence-backed)

1. **The whale null is instrumented wrong, not a finding.** Synthetic trade slippage is
   `Math.random()`-based per profile (`generateSyntheticTrades.ts` ~L177-187), drawn independently of
   the real price path. It *cannot* correlate with whale activity by construction. Fix the
   instrumentation (R6-E5), then re-run. Either outcome is then publishable.
2. **v5's "deployment unverified" understated a crisis.** The ml-service is not deployed; the Council
   does not run in production; Railway's $5 is a one-time credit, not monthly.
3. **`POST /ml/agents/council/replay/{runId}` does not exist.** AC-8's persistence half is real; the
   replay half named in the task table was never built.
4. **T4.17's DoD is unmet twice over.** `ReportService` is never called from onboarding, and the
   PDF/share buttons are hidden for real users behind a `dashboardMode === 'demo'` conditional. The
   root cause is that `window.open` cannot send a Bearer token — the fix is a cookie-authenticated
   `/report` endpoint, not a UI change.
5. **T4.5 is two tasks with opposite statuses.** Docker: done. CI/CD: absent entirely.
6. **The dashboard trend chart is fabricated.** `generateTrendData()` applies a hardcoded variance
   array `[-12,-8,-5,-2,-1,0]` to the current score. There is no stored history because
   `POST /api/audit/run` overwrites one canonical Audit doc per account.
7. **Content-hash packet caching does not exist.** `content_hash` is real (`fee_packet.py:61-65`) but
   is used only for replay identity; nothing checks it to skip an LLM call.
8. **No real trade has ever been scored by anyone, including Deepanshu.** Every grade in existence
   comes from the synthetic demo population.

---

## §3 — The blocking layer (do these before anything else in this document)

Nothing else has value if these fail. Ordered; each depends on the one above.

**R6-B0.1 — Decide and execute hosting.** *(L)*
Recommendation: **Oracle Cloud Always Free, `eu-frankfurt-1`**, Ampere A1 (2 OCPU / 12 GB after the
June-2026 halving), running the existing `docker-compose.yml` behind Caddy for HTTPS. Keep Vercel for
the frontend. Retire Railway. Frankfurt also provisions reliably and is the strongest bet for Binance
API access (US datacenter IPs are more commonly blocked). Requires a credit card for identity
verification ($1 hold). **The real risk is the ARM (aarch64) rebuild** — `node:20-alpine` and
`python:3.11-slim` have ARM variants and pandas/pyarrow ship aarch64 wheels, but this must be verified
by building, not assumed. **Fallback if ARM fights back:** Fly.io's free allowance, or a Hetzner CX22
at ~€4/mo. Steps: provision → install Docker → verify ARM builds → compose up → Caddy → repoint
`NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_ML_URL` on Vercel → update OAuth callbacks and
`BACKEND_URL`/`ALLOWED_ORIGINS` → retire Railway.
**DoD:** both services respond on `/health`, `/ready`, `/version` at a stable HTTPS URL that will not
expire. *Why it blocks:* a resume URL that dies in three weeks is worse than no URL.

**R6-B0.2 — Deploy the ml-service.** *(M)*
Needs `JWT_ACCESS_SECRET` matching the backend, `ALLOWED_ORIGINS` including the Vercel origin, and a
corrected `NEXT_PUBLIC_ML_URL` (currently pointed at the backend as a placeholder). Also shrink the
**841 MB image** — multi-stage build, drop build-time deps, `pip --no-cache-dir`, evaluate whether
pyarrow is needed at runtime.
**DoD:** a council run completes end-to-end against the deployed frontend, verified with the
failure-sweep discipline (§9). *Why it blocks:* **the flagship does not run in production today.**

**R6-B0.3 — Verify Binance reachability from the new region.** *(S)*
A scripted server-side probe hitting `/api/v3/time` and `/sapi/v1/account/apiRestrictions`, with the
HTTP status logged. **DoD:** a recorded 200 from the deployed host. If it 451s, R6-C1 (screenshot
ingestion) becomes the primary onboarding path rather than a hedge.

**R6-B0.4 — Score one real trade, end to end.** *(S, manual)*
Place ~10 tiny real Binance spot trades (~$10 each, 2–3 symbols, deliberately mixing market and limit
orders so the score has something to say). Connect a read-only key through your own onboarding wizard.
Watch a real FillScore appear. Screenshot it for the README.
**DoD:** a real `dataSource: 'real-user'` audit exists with a correct score. *Why it blocks:* every
"it works" claim in every document is currently an inference from the synthetic path.

---

## §4 — The complete task register

Every task ever specified across all roadmap generations, with its full spec inlined. Status legend:
✅ built · 🟨 partial · 🟥 not built · 🧊 deferred by design · ⛔ formally cut.

### 4.1 — Phase 1 & 2: the built product

**T1.x — Foundation (all ✅).** Next.js frontend, Node/Express backend, Mongoose models
(`Trade`, `Audit`, `User`, `ExchangeConnection`, `RefreshToken`, `PasswordResetToken`), the
4-component weighted scoring engine, Binance read-only ingestion with AES-256-GCM key encryption,
market-data enrichment, arrival-price slippage (= implementation shortfall, Perold 1988), audit
aggregation with deterministic stable sort, the Neural Noir dark design system, dashboard / trades /
analytics pages.

| ID | Task | Status |
|---|---|---|
| **T2.1** | Analytics deep-dive page — per-symbol and per-hour breakdowns, component contribution charts | ✅ |
| **T2.2** | Bybit trade connector — client, normaliser, unit tests | 🟨 built but **unreachable**; see R5-C10 |
| **T2.3** | OKX trade connector — client, normaliser, unit tests | 🟨 built but **unreachable**; see R5-C10 |
| **T2.4** | Exchange comparison dashboard / Venue Alpha — same-symbol fill quality across venues | ✅ |
| **T2.5** | PDF audit report export (`ReportService`) | ✅ but hidden from real users; see R5-M5 |
| **T2.6** | CSV trade-history export | ✅ |
| **T2.8** | Shareable score card — public read-only `app/share/[userId]`, grade + period + top-3 stats, **no trade data exposed**, Open Graph tags for Twitter/LinkedIn preview, "View my FillScore" button, rate-limited 100 views/hour per card | ✅ |
| **T2.12** | Whale correlation | 🟨 demo-only; see R5-M6 + R6-E5 |
| — | Execution Coach mode | ✅ |
| — | Trade Journal Notes | ✅ |
| — | Eval harness, reproducibility pack, cost telemetry | ✅ |

**T2.12 — Whale Correlation Heatmap (original v2 spec, preserved).** Fetch large order flows
(>$100k notional, Binance aggTrades) within ±30s of user trades; CSS-Grid heatmap overlaying user
trades against whale activity by hour and symbol; colour-coded aggression (red = traded into a whale
sweep, yellow = concurrent activity, green = clean); tooltip narrating the coincidence;
`GET /api/analytics/whale-correlation`. **As built it diverged from this spec in one important way:**
whale is defined as a *burst* (consecutive same-direction aggTrades within ≤1s summed over a
per-symbol threshold), not a single large trade, and the approach fetches only ±30s aggTrade windows
per trade rather than bulk-downloading gigabytes. Keep the as-built definition.

### 4.2 — Deferred-by-design infrastructure (🧊 — full specs preserved, do not build for launch)

These all require live-streaming infrastructure (InfluxDB, Redis Streams, `worker_threads`) that a
reproducible static demo cannot support, and Binance provides no historical L2 depth to backfill
against. **They stay deferred.** They are preserved in full because they are excellent interview
substrate — being able to describe the architecture and explain *why you didn't build it* is worth
more than a half-built version.

**T2.7 — Weekly Email Digest** *(~4h)* 🧊 partial replacement shipped as R5-N5.
`src/services/EmailService.ts` using nodemailer + SMTP; template carrying current grade, week-over-week
change, and top-3 recommendations; Bull job queue on a weekly cron (Mon 09:00 UTC); opt-in/out stored
on `User`; unsubscribe link in the footer. *Blocked on a job queue that doesn't exist yet (R5-C1
builds one for the Groq budget). Building queue infrastructure solely for email would be premature —
ship R5-N5's single activation email instead.*

**T2.9 — Real-Time WebSocket Score Updates** *(~5h)* 🧊.
`socket.io` on the Express server; event `trade:ingested` → `{userId, tradeId, fillScore}`; event
`audit:updated` on recompute; client connects on dashboard mount and updates the grade live without
refresh; reconnect with exponential backoff.

**T2.10 — Benchmark Comparison** *(~3h)* 🧊 → superseded by **T6.1 FillScore Index / R5-N7**.
`GET /api/benchmark` → `{avgFillScore, medianSlippageBps, makerRatioP50, avgFeeDragBps}` across all
users; "Platform Average" reference line on every dashboard score bar; a "Synthetic Ideal Trader"
benchmark line (maker ratio 0.80, trades only 08–16 UTC, BTC/ETH only); privacy floor — computed only
when ≥10 users exist, never exposing individual data.

**T2.11 — Order Book Imbalance (OBI) Engine** *(~6h)* 🧊.
`src/services/MarketDepthService.ts`. WebSocket worker tracking Binance/Bybit L2 via
`wss://stream.binance.com:9443/ws/{symbol}@depth20@100ms`. **Must run as a dedicated `worker_threads`
worker, never on the main Express event loop** — at 100ms across 4 symbols that's ~40 msg/sec, and the
main thread will lag and drop packets. `OBI = (bidVol - askVol) / (bidVol + askVol)` over the top 5
levels. Adds `marketPressure: 'BID_HEAVY'|'ASK_HEAVY'|'BALANCED'`, `obiAtExecution: number|null`, and
`obiDataAvailable: boolean` to `EnrichedTrade`. Store L2 snapshots in InfluxDB via a Redis Streams
buffer (WebSocket → `XADD l2:snapshot` → consumer group → batched InfluxDB writer — the decoupled
ingestor pattern for guaranteed delivery).
**⚠️ Hard constraint:** Binance provides no historical L2 depth on the free API. OBI exists only from
the moment the engine starts; all historical and synthetic trades have `obiAtExecution: null`. **Do
not attempt to backfill.** Null must *exclude* the OBI component from scoring, never penalise the
trade. Warm-up is 24–48h before OBI scoring is meaningful; show progress in the UI.
*Subtasks:* InfluxDB write client → Redis Streams pipeline → `worker_threads` L2 worker with reconnect
and ring-buffer → OBI calculation → schema fields → null-handling → warm-up indicator → blotter column
→ dashboard narrative ("you traded into a bid wall 34% of the time").

**T2.13 — Execution Latency Benchmarking** *(~4h)* 🧊.
Millisecond timestamps via `performance.now()` plus exchange server timestamps; "exchange latency" =
`receivedAt − executedAt`; store `latencyMs` on `NormalisedTrade`; analytics section comparing median
latency per venue; P50/P90/P99 percentile chart.

**T2.14 — Spoofing & Ghost Order Detector** *(~5h)* 🧊 — *depends on T2.11.*
Novel: no retail TCA tool does this. `src/services/SpoofingDetector.ts` runs as post-processing on
InfluxDB L2 data. For each trade, query the L2 snapshot at `executedAt` and `executedAt + 200ms`; if a
bid/ask wall of >$50k was present at T but gone by T+200ms, flag a Ghost Order Event. Adds
`ghostOrderDetected: boolean` and `ghostOrderSide: 'BID'|'ASK'|null` to `EnrichedTrade`; feeds the
Liquidity Scout agent's context; analytics card ("3 of your last 20 trades were influenced by ghost
orders"); 👻 badge on affected blotter rows.

### 4.3 — Phase 3: the AI/ML layer (mostly superseded by the Agent Council)

The Council absorbed this phase's multi-agent and narration ambitions. Standalone ML pieces were never
built — `requirements.txt` carries no scikit-learn, tensorflow, or hmmlearn.

| ID | Task | Status |
|---|---|---|
| **T3.1** | **FastAPI microservice scaffold** — FastAPI + uvicorn + pydantic v2, `GET /health`, CORS, Docker-ready, shared models (`TradeFeatureVector`, `PredictionResult`, `ClusterResult`, `AgentVerdict`), Node↔Python bridge `MLService.ts`, routers `/ml/{lstm,cluster,anomaly,regime,pretrade,agents,swarm}`. Enhancement: split the web service from background workers (arq/Celery + Redis) so user-facing scoring stays responsive | ✅ scaffold + `/ml/agents`; worker split → R5-C1 / R6-D2 |
| **T3.2** | LSTM FillScore forecasting — TF/Keras seq2seq, 30-day in → 7-day out, MC-dropout uncertainty | ⛔ **formally cut** (§7) |
| **T3.3** | K-Means trading-style clustering — k=5 on 8 behavioural features, archetypes, PCA 2D plot | 🟥 → **revived as R6-B4** (peer-normalised scoring) |
| **T3.4** | Isolation Forest anomaly detection — contamination=0.05, anomaly types, red-dot heatmap, "why flagged?" modal | 🟥 → **revived as R6-B5** (retrospective only) |
| **T3.5** | Market regime detection (HMM) — hmmlearn, 4 hidden states, Viterbi, regime-conditional weights. *(Regime is currently a hardcoded `"STABLE"` placeholder — flaw F14.)* | 🟥 → **revived as R6-B6** (retrospective labelling only) |
| **T3.6** | Audit narration grounding via a Citations-style API | ⬜ superseded by the grounding contract |
| **T3.7** | LLM audit narration engine (`NarrationService.ts`) | ⬜ superseded by Council synthesis |
| **T3.8** | Pre-trade execution quality estimator — RandomForest, `POST /ml/pretrade/estimate` | ⛔ **formally cut** (§7) — it predicts |
| **T3.9** | Execution cost attribution v2 (ML counterfactuals: limit save, timing save, VWAP deviation, whale adverse cost) | 🟨 v1 built in TypeScript (`attribution.ts`); v2 → **R6-B2/B3** |
| **T3.10** | The Agentic Council (LangGraph parallel fanout → synthesis) | ✅ built as the AC-x series — do not double-count |
| **T3.11** | Regime transition modelling (enhanced HMM) — transition matrix on 3yr BTC, regime-change alert if P>0.7 within 24h, dynamic weight matrix per regime (Stable 30/25/30/15, Violent 50/20/15/15, Trending 35/20/35/10, Ranging 25/30/25/20) | 🟥 optional extension of R6-B6; the *forecast* half stays cut |
| **T3.12** | **Swarm intelligence simulation sandbox** — 500 OU-driven synthetic order-book agents (Scalper/HODLer/DCA/Momentum/Arbitrageur, 100 each), `dX_t = θ(μ−X_t)dt + σdW_t` with params from L2 history, 1000 Monte Carlo runs, KDE output (`P(FillScore>80) = 73%`), `POST /ml/swarm/simulate`, `app/simulate/page.tsx` D3 area chart | 🧊 stretch flagship; see §7 for the herd-bias caveat |
| **T3.13–15** | Regime-aware scoring exposure, "Ask Your Trades" chat assistant (Mem0 memory), narration polish | 🟥 / superseded |
| **T3.16** | Leakage-free eval harness — strict temporal filtering (no record with `ts > decision_ts` visible), minimal context, recorded reasoning traces, Sortino-family metrics (**never win-rate** — leakage-prone and cherry-pickable), CI assertion that no future record leaks | ✅ realised via AC-11's walk-forward harness |
| **T3.17** | **Council self-eval & steering examples** — `steering-examples.json` per agent plus a `check.py`-style CI suite that lints manifests, resolves skill/tool references, and detects prompt/skill drift; LLM-graded routing-accuracy eval | 🟥 → **R6-G7**, worth building |

### 4.4 — The Agent Council (AC-0 … AC-15) — ✅ built

Architecture: **Compute → Judge → Debate → Verify.** Deterministic Python builds evidence packets;
four specialists (Liquidity Scout, Fee Optimizer, Alpha Architect, Risk Auditor) judge in parallel via
LangGraph; a bounded 2-round prosecution/defense debate with a judge; synthesis resolves conflicts; a
deterministic verification gate recomputes every numeric claim and rejects ungrounded ones.
9 LLM calls / ~11.6K tokens per run, with a 3s pause between specialist and debate phases to stay
under 30 RPM.

| ID | Deliverable | Status |
|---|---|---|
| AC-0…AC-3 | Packet builders, LangGraph state graph, parallel specialist fanout | ✅ |
| AC-4 | Grounding contract (`grounding.py`) — metric validity vs claim | ✅ |
| AC-5 | Verification gate (`verification.py`) — deterministic counterfactual recompute + self-correction | ✅ |
| AC-6 | Execution Trial debate (`debate.py`) — Prosecution / Defense / Judge, typed `DebateState`, bounded 2 rounds | ✅ |
| AC-7 | Synthesis v2 — compressed inputs, conflict ledger, anti-fence-sitting prompt, real cost from `fee_packet` | ✅ |
| AC-8 | Run persistence + content-hashed identity + `GET /ml/agents/council/runs/{run_id}` | 🟨 **load built, replay NOT built** → R6-A1 |
| AC-9 | SSE streaming UI (`AgentCouncil.tsx`) | ✅ |
| AC-10 | Deterministic evidence-coverage confidence; LLM self-confidence stored separately for calibration | ✅ |
| AC-11 | Walk-forward eval harness, leakage-free split at 2024-01-15, `assert_no_future_leakage()` | ✅ |
| AC-12 | Multi-model ablation | 🟥 → **R6-A5** (now active) |
| AC-13 | Agent memory / reflection | 🟥 → **R6-A4** (now active) |
| AC-14 | Cost telemetry | ✅ |
| AC-15 | Paper artifact pack (`repro_config.json`, `claim_evidence_map.md`, tables 1–4) | ✅ |

**Scope fences — what the Council deliberately does NOT do.** It does not predict prices, recommend
trades, size positions, or give financial advice. It does not originate numbers. It does not read
untrusted text without isolation (once R6-A2 lands). Restate these in the paper's Limitations.

### 4.5 — Phase 4: the SaaS launch (T4.x with full Definitions of Done)

**T4.0 — Secret-scrub confirmation & fail-fast env validation** ✅ *(P0, done)*
Grep the repo and `git log -p` for connection strings, passwords, API keys. Confirm every secret comes
from `process.env`/`os.environ` with a fail-fast startup check (throw on missing/empty — never a
default). Confirm `.env`, `.env.*`, `*.cache` are gitignored. **Verify by key name / non-empty check
only — never print `.env` contents.** *(Delivered as centralised `config/env.ts` + deduplicated
version constants. Git-history purge deliberately deferred — see R6-G13.)*

**T4.1 — JWT authentication** ✅ *(live-verified)*
`User` gains `email` (unique), `passwordHash` (bcrypt-12), `plan` (`'free'|'pro'|'enterprise'`),
`createdAt`, `emailVerified`. Routes `/register /login /refresh /logout`. 15-min access JWT + rotating
refresh token stored hashed in `refresh_tokens` with **reuse detection and family revocation**.
`requireAuth` injects `req.userId`. The hashed-key `userId` shim retired. *(Also delivered: model split
separating auth identity from exchange connection, and in-memory-Mongo test isolation with an Atlas
write guard.)*

**T4.2 — OAuth2 social login** ✅ *(both providers live-verified)*
Passport + Google + GitHub; link by **verified** email; issue the same JWT pair.
*Gotcha found and fixed:* `passport-github2` drops the email-verified flag — a direct call to
`/user/emails` is required. Cookie `SameSite` splits between dev and prod.

**T4.12 — Account model + account-scoped isolation** ✅
Real `accountId` on every `Trade`, `Audit`, and `council_run`; every query scoped to the authenticated
account. `resolveAccount` middleware derives identity **from the JWT, never from a client-supplied
parameter**. Multi-exchange aggregation flipped from `userId` to `accountId`.
**DoD met:** a cross-account access test proves no leak.

**T4.14 — Demo/real boundary + provenance tagging** ✅
`dataSource: 'synthetic-demo'|'real-user'` on `Trade`, `Audit`, `council_run`, set at creation,
**`immutable: true`** at schema level — tested both ways (`save()` and `findOneAndUpdate($set)` both
fail to change it). Backfill used the raw driver because Mongoose silently ignores `$set` on immutable
fields. Applied to 897 trades + 7 audits + 43 council runs. Demo profiles are public and need no auth;
real users are authed and isolated. UI copy must never blur the two.

**T4.17 — Real-user onboarding (connect → ingest → score)** 🟨 *~90%*
Wizard: pick exchange → paste **read-only** key (with a read-only confirmation checkbox and an explicit
"we never request withdrawal-enabled keys" notice) → AES-256-GCM encryption at rest → ingest their real
history → enrich → score → their dashboard.
**Critical discovery:** `/api/v3/account`'s `canTrade`/`canWithdraw` describe the *account*, not the
key. Key validation must use **`/sapi/v1/account/apiRestrictions`**, fail-closed on unknown fields.
**Performance fix:** 120 sequential calls → 4 parallel calls (50s → 0.8s).
**DoD NOT met:** the onboarding Execution Report Card is not wired (`ReportService` is never called),
and the PDF/share buttons are hidden for real users because `window.open` can't send a Bearer token.
→ **R5-M5** (needs a cookie-authenticated `/report` endpoint).

**T4.18 — Incremental trade sync & re-scoring** 🟥 → **R6-G6**
Scheduled and on-demand incremental ingestion: fetch only fills since the account's `lastSyncAt`
cursor; re-run enrichment + audit; update score and trend. Idempotent (dedup by trade ID); resumes
from the last known trade. Surfaces "score changed since last week" — the retention loop.
**DoD:** a second sync ingests only new fills, re-scores correctly, shows a week-over-week delta, and
creates no duplicates. *Pairs directly with R5-M4/R6-D1 — without stored history there is no trend.*

**T4.5 — Docker + CI/CD** 🟨 *Docker done, CI/CD absent*
Multi-stage Dockerfiles for the Node backend and the Python ML service; `docker-compose.yml` with
backend, ml-service, mongo (or Atlas), redis. `.github/workflows/` on push to `main`: run tests →
build images → deploy. Health checks; dev/staging/prod env configs; secrets injected from the platform
store, never baked into images. **The CI half is R5-C7 and is the highest signal-per-hour item in this
document.**

**T4.3 — Stripe subscription billing** 🟥 → **R5-C4**
Free (no card) / Pro / Enterprise. `POST /api/billing/checkout`, `POST /api/billing/webhook`
(`customer.subscription.updated`, `invoice.paid`, `invoice.payment_failed`), `GET /api/billing/portal`.
Plan gates before serving plan-gated ML endpoints. Pricing page with a comparison table. **7-day grace
period** on payment failure before downgrade.
**DoD:** test-mode checkout upgrades to Pro; `payment_failed` starts the grace timer; plan gates block
free users from Pro-only endpoints.

**T4.19 — Usage metering, quotas, webhook idempotency** 🟥 → folded into **R5-C4**
Per-account monthly counters (council runs, exchange connections, exports). **Persist processed Stripe
`event.id`s and reject duplicates** — webhooks fire multiple times; without this you double-provision.
Nightly reconciliation comparing Stripe subscription state to local `user.plan`. "You've used 8/10
council runs this month" UI with an upgrade CTA on limit.

**T4.13 — Groq multi-tenant budget + Council job queue** 🟥 → **R5-C1** *(biggest infra risk)*
- **Model routing:** `llama-3.1-8b-instant` (500K TPD) for bulk and low-difficulty packets; reserve
  `llama-3.3-70b-versatile` (100K TPD) for synthesis and high-difficulty packets. Difficulty heuristic
  from the packet: clean + low trade count → 8b; high concentration / many whale events → 70b.
  **Once R6-A3 lands, `fillscore-mini` becomes the cheapest rung on this ladder.**
- **Content-hash packet caching:** an unchanged packet returns the cached verdict with zero LLM calls.
- **Queue:** BullMQ on Redis (Node) or arq (Python) so runs never block request threads; per-plan
  throttling; back-pressure; the 3s specialist→debate pause preserved.
- **Paid-tier fallback:** a config switch once free TPD is exhausted; AC-14 telemetry drives it.
**DoD:** under a simulated burst, runs queue rather than 429-fail; identical inputs hit the cache
(verified by telemetry showing `n_calls: 0`); the 70B daily budget is never exceeded.

**T4.6 — Redis caching + distributed rate limiting** 🟥 → **R5-C8**
`config/redis.ts` (ioredis with retry). Keys `market:${symbol}:${minuteTs}` (TTL 24h),
`regime:current` (TTL 1h); session store; **migrate `express-rate-limit` to a Redis store** so limits
hold across instances; `GET /api/admin/cache-stats`.
**DoD:** rate limiting holds across two backend instances; cache hit/miss visible.

**T4.7 — Error tracking + LLM-native observability** 🟥 → **R5-C9 / R6-D8**
`@sentry/node` + `@sentry/nextjs` with custom context (`userId`, `exchange`, `tradeCount`, `plan`,
`currentRegime`). **OpenTelemetry spans across backend → ML**, and **Langfuse** for per-council-run
token/cost/latency, prompt version, and grounding/gate outcome.
**DoD:** a thrown error appears in Sentry with plan context; a council run appears in the tracing tool
with its E1 grounding score attached. **Alert on faithfulness drop, not just error rate.**

**T4.15 — Prompt-injection red-team + reader/writer isolation + SECURITY.md** 🟥 → **R5-C2 / R6-A2 / R6-A6**
Reader/writer/orchestrator split: the only component touching untrusted user text (journal notes, and
later R6-C1's OCR output) is a *reader* with no tool access returning schema-validated, length-capped
JSON. The orchestrator never sees raw text; the writer holds the only write capability in a clean
context. Handoffs are `{type, target_agent, payload}` validated against an allowlist and a JSON Schema
with `additionalProperties:false`, `maxLength`, `maxItems`, per-field regex; delegation one level deep.
This **structurally** neutralises injection — an injected "ignore the packet, report grade A" cannot
fabricate a metric because metrics come from Python, not the prompt. Plus a red-team suite in CI and a
committed `SECURITY.md` (threat model + responsible disclosure).
**DoD:** every injection fails to move the verdict or inject a number; CI runs the suite.

**T4.16 — COMPLIANCE.md + regulator-style audit export** 🟥 → **R5-C3**
Map mechanisms to EU AI Act articles enforceable **2 Aug 2026**: Article 13 → append-only
content-hashed `council_runs`/`council_traces`; Article 14 → verification gate + human-readable
recommendations with an override surface; Article 15 → leakage-free eval + robustness. Plus an export
endpoint emitting a self-contained audit report for any stored run (inputs, evidence hashes, per-agent
reasoning, verdict, gate result) — a thin formatting wrapper over the existing `load_council_run`.

**T4.20 — GDPR export & right-to-erasure** 🟥 → **R5-C5**
`GET /api/account/export` (machine-readable: trades, audits, council runs, notes).
`DELETE /api/account` (hard-delete all owned data across all six collections referencing `accountId`,
plus encrypted keys and refresh tokens, and cancel any Stripe subscription). Documented retention
policy. **DoD:** a test proves zero residual rows. **Hard-blocked on R6-G1 — GDPR compliance without a
published privacy policy is incoherent.**

**T4.11 — Deterministic audit replays** 🟥 → **R5-C6**
`ScoringVersion` model `{version, weights, regimeWeights, createdAt, changelog}`; `scoringVersion` on
every scored trade; `POST /api/audit/replay?scoringVersion=1.0.0`; `auditIntegrityHash` (SHA-256 of
formula params) on every audit; `GET /api/audit/verify` → `{isIntact, delta}`; an
"Audit v1.2 · Integrity ✓ Verified" badge.
**DoD:** replay at the stored version reproduces the audit hash-identically; tampering flips
`isIntact` false with a computed delta.

**T4.4 — Multi-user team dashboards** 🟥 → **R5-N9** *(lower priority)*
`Organisation {orgId, name, ownerId, memberIds[], plan}`; `POST /api/org/invite`, `/api/org/accept`;
aggregate team view sorted by grade; role-based access (owner sees all, members see own);
`GET /api/org/leaderboard` (opt-in per member).

**T4.8 — White-label API** 🟥 → **R5-N10** *(lower priority)*
`POST /api/enterprise/apikey` (Enterprise only); `X-FillScore-Key` auth middleware;
`POST /api/enterprise/score` accepts a trade array and returns a FillScore **without storing data**;
1000 req/day per key; OpenAPI auto-generated from Zod (`zod-to-openapi`); Swagger UI at `app/docs`.

**T4.9 — Key rotation & vaulting** 🟥 → **R5-M1** (minimal) + **R5-N11** (full)
Exchange-key expiry alerts (detect 401s, notify 7 days out); rotation log
`{userId, exchangeKeyId, rotatedAt, reason}`; **AES-256-GCM master-key rotation via a dual-key scheme**
(old key decrypts, new key encrypts, zero downtime); `POST /api/admin/rotate-master-key` triggering a
background re-encryption job; a `keyVersion` field on `ExchangeConnection`.

**T4.10 — k6 load testing** 🟥 → **R5-N12**
`tests/performance/load_test.js`: 1,000 concurrent ingestions over 60s; ramp / sustained / spike
scenarios; SLOs **P99 < 200ms enrichment, P99 < 500ms audit**; custom metrics
(`trade_ingestion_rate`, `scoring_duration_p99`, `agent_council_latency`); HTML report as a CI
artifact; 100-user smoke on every PR; `PERFORMANCE.md`.

### 4.6 — Must-fix from the code audit (R5-M*)

| ID | Task | Files | Effort | Acceptance |
|---|---|---|---|---|
| **R5-M1** | `ENCRYPTION_KEY` rotation: dual-key decrypt (old key still decrypts) / re-encrypt forward, plus an admin-triggered background re-encryption job | `utils/encryption.ts`, new `scripts/rotateEncryptionKey.ts`, `ExchangeConnection.ts` (+`keyVersion`) | M | Rotation re-encrypts every connection with zero data loss and zero downtime; a test decrypts an old-key row and a new-key row correctly mid-rotation |
| **R5-M2** | DB-level unique index on `Audit.accountId` so one-canonical-audit is a schema guarantee, not an application pattern | `models/Audit.ts` | S | `Audit.create({accountId: existing})` bypassing the upsert helper throws a duplicate-key error |
| **R5-M3** | CSRF protection (double-submit token or `Origin` check) on `/api/auth/refresh` and `/logout` — the two cookie-authenticated mutating endpoints | `routes/auth.ts`, new `middleware/csrf.ts` | S | A cross-origin POST without the token is rejected; the legitimate frontend flow is unaffected |
| **R5-M4** | Replace the fabricated trend chart with an append-only `AuditHistory` (one immutable row per `POST /audit/run`/sync) and read from it. **Build this as R6-D1's event-sourced write model** | new `models/AuditHistory.ts`, `audit.ts`, `dashboard/page.tsx` (delete `generateTrendData`) | M | After two real syncs a week apart the chart plots two real stored points; the "simulated trend" label is removed |
| **R5-M5** | Wire `ReportService` into onboarding completion and un-hide PDF/share for real users. **Root cause is that `window.open` can't send a Bearer token — build a cookie-authenticated `/report` endpoint** | `onboarding.ts`, `dashboard/page.tsx:469`, `routes/audit.ts` | S | A real user who just finished onboarding downloads a PDF of their own account without switching to demo mode |
| **R5-M6** | Whale correlation for real users: (a) parametrise `whale/enrich.py` away from the hardcoded demo-user list and wire it into the real sync, or (b) explicitly hide it for real accounts with a clear "not yet available" response. **Decision: (b) now, (a) after R6-E5** | `whale/enrich.py`, `onboarding.ts` or `audit.ts:777-834` | M / S | A real user never sees an empty whale panel presented as a real "no whale activity" result |
| **R5-M7** | Remove the double-mount of `auditRouter` at both `/api/audit` and `/api`; if the `/api/score` alias must stay, mount it as one explicit route, not a second full-router mount that bypasses `auditLimiter` | `index.ts:75-76` | S | Every `audit.ts` route is reachable at exactly one rate-limited path |
| **R5-M8** | Wire the declared-but-unused `zod` into validation for the highest-risk routes: `POST /api/audit/run` (`daysBack` bounds), `POST /api/onboarding/connect`, `PATCH /trades/:id/note`. If the decision is manual checks instead, remove `zod` from `package.json` — don't leave it declared and unused | `routes/audit.ts`, `routes/onboarding.ts`, new `validation/schemas.ts` | M | `daysBack=-1` and `daysBack=999999` both 400 with a clear message instead of reaching the ingestion loop |
| **R5-M9** | Real "degraded / service busy" state for Council SSE errors, distinguishing a Groq 429 from a genuine bug (currently a raw exception string, `main.py:334`, unhandled in the UI) | `AgentCouncil.tsx`, `main.py` | S | A simulated 429 shows "Council is at capacity, try again shortly", not a raw error string |

### 4.7 — Complete-the-half-built (R5-C*)

| ID | Task | Deps | Effort | Acceptance |
|---|---|---|---|---|
| **R5-C1** | Groq multi-tenant budget — full spec at **T4.13** above | R5-C8 | L | Runs queue instead of 429-failing under burst; an unchanged packet returns a cached verdict with `n_calls: 0` |
| **R5-C2** | Prompt-injection isolation + red-team + `SECURITY.md` — full spec at **T4.15** | — | M | Every injection fails to move the grade or fabricate a number; CI runs the suite |
| **R5-C3** | `COMPLIANCE.md` + audit export — full spec at **T4.16** | AC-8 | S | For any stored run the export returns a self-contained report |
| **R5-C4** | Stripe billing + metering — full spec at **T4.3 / T4.19** | R5-C1 | L | Test-mode checkout upgrades to Pro; a duplicate webhook is processed once; quota exhaustion shows an upgrade prompt |
| **R5-C5** | GDPR export + erasure — full spec at **T4.20** | R5-C4, **R6-G1** | M | Zero residual rows across all six collections |
| **R5-C6** | Deterministic audit replay — full spec at **T4.11**. Ship together with R6-A1's Council replay as one "everything is replayable" story | — | M | Replay reproduces hash-identically; tampering flips `isIntact` |
| **R5-C7** | **CI/CD** — GitHub Actions running backend `npm test`, frontend `npm run build` **and** `tsc --noEmit`, ml-service `pytest` plus the leakage assertion, on every push to `main`; gate merges on green | — | S | A PR with a failing test, a TypeScript error, or a leakage violation is blocked from merging |
| **R5-C8** | Redis caching + distributed rate limiting — full spec at **T4.6** | — | M | Rate limiting holds across two backend instances |
| **R5-C9** | Observability — full spec at **T4.7** | — | M | An error reaches Sentry with account context; a run reaches the tracer with its E1 score |
| **R5-C10** | **Bybit/OKX: wire in.** The client code and unit tests exist and pass in isolation; the actual missing work is **read-only key validators for Bybit and OKX** (only Binance's `apiRestrictions` check was built) plus fixing `Trade.exchange`'s enum. Until it lands, remove "3 exchanges" from product copy | `onboarding.ts`, `Trade.ts:17`, `keyValidation.ts` | M | A Bybit or OKX connection succeeds end-to-end through the real UI |

### 4.8 — Gap closure from the session handoff (R6-G*)

Open items that appear in no roadmap's task list. Several are small; two are legal.

| ID | Task | Effort | Why |
|---|---|---|---|
| **R6-G1** | **Terms of Service + Privacy Policy**, published and linked from signup and footer | S | You handle exchange API keys and intend to serve EU users. GDPR requires a privacy policy as a *precondition*. R5-C5 is incoherent without it |
| **R6-G2** | **Email verification for password signups** — `emailVerified` defaults false and nothing ever sets it true; only OAuth users get it from the provider | S | The hashed-token + `sendEmail` infrastructure already exists from password reset. Pure wiring |
| **R6-G3** | **OAuth one-time-code exchange** — replace `?accessToken=` on the redirect with a short-lived single-use code | S | Tokens in URLs leak via referrer, history, and logs. Currently documented as a dev-stage tradeoff |
| **R6-G4** | **Per-account rate limiting** rather than per-IP | S | Every user behind a university or office NAT currently blocks every other one; `connectLimiter` is 5/15min. Depends on R5-C8 |
| **R6-G5** | **Require `BACKEND_URL` + `FRONTEND_URL` when `NODE_ENV=production`** — they silently default to localhost | S | This already produced a broken production OAuth flow. One line in `config/env.ts` |
| **R6-G6** | **T4.18 incremental sync** — full spec at T4.18 above | M | Without it every sync refetches everything (rate-limit hazard) and there is no real trend data |
| **R6-G7** | **`check.py`-style CI manifest linter + steering examples** (T3.17) — lint agent manifests, resolve cross-file references, fail on prompt/skill drift | M | Prevents silent prompt drift — the failure class that already invalidated an entire eval run via the `loader.py` camelCase bug |
| **R6-G8** | **Guest-flash fix** — the dashboard renders before the silent refresh completes, so nav momentarily shows logged-out | S | It is the first thing every interviewer sees |
| **R6-G9** | **Test-suite performance** — every test file spins its own `mongod` (30–100s); move to one shared memory-server per run | S | Slow tests get skipped; skipped tests stop catching things. Protects R5-C7's gate from being disabled out of impatience |
| **R6-G10** | Move diagnostic scripts to `scripts/diagnostics/`, out of `backend/src/scripts/` | S | Twelve one-off scripts currently sit beside production ones |
| **R6-G11** | `test_stream.py` needs a running server — an integration test hiding in a unit suite | S | Mark it, gate it, or move it to an integration CI job |
| **R6-G12** | **Sync weight accounting** — if all 4 symbols hit the >1000-trade fallback that's ~2,400 weight in ~6s; three concurrent power users breach Binance's 6,000/min IP budget | M | Real answer is R5-C1's queue; until then add a weight accountant and back off |
| **R6-G13** | **Git-history secret purge decision** — values are rotated and dead; `git filter-repo` breaks every clone | S | Decide on one criterion: if the repo goes public for launch, purge **before** it gets forks |
| **R6-G14** | `Trade.exchange` enum missing `'okx'` (seeds work via a `$setOnInsert` bypass) | S | Becomes blocking the moment R5-C10 wires OKX in. Fix as part of that task |

### 4.9 — New capability program (R6-A / B / C / D)

**The filter every item passed:** it solves a problem FillScore actually has, it survives the
audit-never-predict rule, and it is defensible under ten minutes of hostile questioning. Items that
only added a keyword were rejected — see §7.

#### R6-A — Agentic & LLM systems

**R6-A1 — LangGraph durable execution: checkpointing, replay, human-in-the-loop.** *(M)*
Replace ad-hoc `council_runs` persistence with a real LangGraph checkpointer backed by Mongo. Four
things fall out of one change: crash-resume mid-run; **`POST /ml/agents/council/replay/{runId}`** (the
route AC-8 named and never built); *time-travel* — fork a stored run at the debate node, change one
input, re-run, diff the verdict; and an `interrupt()` before synthesis so a user can challenge a
specialist finding and force re-deliberation.
*Proves:* LangGraph run in anger — checkpointers, interrupts, state forking — not tutorial usage.

**R6-A2 — Three-tier reader/writer/orchestrator isolation.** *(M)* Full spec at **T4.15**.
*Proves:* LLM security treated as an architecture problem rather than a prompt-level plea.

**R6-A3 — ⭐ FillScore-Mini: a distilled small-language-model judge.** *(L)*
Harvest (packet → verdict) pairs from the 70B Council across the eval corpus — target 3–5k pairs; 43+
stored runs exist and the deterministic packet builder generates more cheaply. LoRA fine-tune
**Qwen2.5-1.5B-Instruct** (ablation: Llama-3.2-3B) on a free Colab T4 via Unsloth/PEFT. Evaluate the
student against the teacher on the **existing E1–E5 harness**: does a 1.5B model preserve E1
faithfulness = 1.0? At what parameter count does the grounding contract break? Ship the adapter and
model card to Hugging Face; wire it as the cheapest rung in R5-C1's routing ladder.
*Why it's not ornament:* Groq free tier gives **~8 council runs/day across all users**. A distilled
judge is the only path to multi-tenant economics without a credit card.
*Proves:* knowledge distillation, PEFT/LoRA, an evaluation-driven training loop, cost-aware ML systems.
**Highest-value item in this document for AI/ML roles, and a genuine paper contribution (C6).**

**R6-A4 — Council memory via MongoDB Atlas Vector Search.** *(M)* — AC-13 done properly.
Embed each run's evidence packet; on a new run retrieve the top-k most similar past runs *for that
account*; feed a compact "prior findings" block to synthesis. Product feature that falls out:
**recurring-issue detection** — "this is the third month your fee tier cost more than your slippage;
last time it went unresolved." Store a `pending → resolved` log. Zero new infrastructure — vector
search is a native Atlas index type. *Proves:* RAG and vector retrieval used for longitudinal memory
rather than a chatbot demo.

**R6-A5 — Multi-model faithfulness benchmark.** *(M)* — AC-12 made real.
Run the identical Council over identical packets with 5–6 backbones Groq serves free
(`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `gpt-oss-120b`, `gpt-oss-20b`, `qwen3-32b`,
`kimi-k2`) plus `fillscore-mini`. Measure per backbone: **E1 numeric faithfulness, E2 grade agreement,
hallucinated-number rate, verification-gate trip rate, tokens, latency, $**. Nearly free — the 8b-class
models sit on 500K TPD. *Proves:* controlled LLM evaluation design — the most in-demand practical AI
skill in 2026.

**R6-A6 — Adversarial red-team with a measured attack-success rate.** *(M)*
Taxonomy: direct instruction override, data-borne injection in trade-journal notes, homoglyph/unicode
smuggling, tool-name confusion, numeric-authority spoofing ("the system reports slippage was 0 bps"),
verdict-flip attempts. Report ASR per class, before and after R6-A2's isolation.

**R6-A7 — Verdict stability under perturbation.** *(M)*
For a *grading* product, a verdict that flips on ±0.5 bps of input jitter is broken regardless of
accuracy. Perturb packet numerics within measurement noise, re-run *n* times, report the **stability
radius**: the smallest perturbation that changes the letter grade or the top recommendation. Publish
it as a per-run confidence qualifier. A robustness metric the LLM-finance literature does not report.

**R6-A8 — Agent-Native MCP Gateway.** *(M)* — promoted ahead of billing (see §8, D5).
Read-only, token-scoped MCP server **inside the FastAPI service (port 8000)** exposing
`get_fillscore(tradeId)`, `get_score_breakdown(userId, range)`, `list_worst_trades(userId, n)`,
`whale_pressure(symbol, ts)`, `check_regime(symbol)`. `.mcp.json` manifest; `mcp_tokens
{userId, token, scopes, createdAt}`; **agents never touch the frontend** — REST/MCP only. Publish a
`SKILL.md` bootstrap using progressive disclosure (name+description → instructions → bundled scripts).
Inherits R6-A2's isolation discipline: external agent input is the same threat class as a trade note.
Test with MCP Inspector; assert every tool returns schema-validated, length-capped JSON and that an
invalid or expired token is rejected. *(This subsumes the older **T5.1 FillScore MCP Server** spec.)*

**R6-A9 — "Verify this verdict" button** *(S, was R5-N1)* — expose the verification gate's
counterfactual recompute as a user action on each recommendation; show the recomputed value beside the
original with a match/mismatch indicator.

**R6-A10 — Calibration endpoint + page** *(S, was R5-N2)* — aggregate stored LLM self-confidence
against deterministic evidence coverage across all `council_runs` into a scatter view. **Doubles as
paper figure E5.**

**R6-A11 — Coach/Council cross-agreement logging** *(S, was R5-N3)* — record whether the rule-based
Coach and the LLM Council agree or conflict on an account's top recommendation category; a deliberately
conflicting fixture must produce a "conflict" flag.

#### R6-B — Statistics, ML, and causal inference

**R6-B1 — ⭐ The statistical significance layer.** *(M)*
Every score is currently a point estimate from a finite noisy sample, presented to fifteen decimal
places. Replace with **bootstrapped 95% CIs on every component** (`slippage 72 ± 6, n=134 trades`) and
a **significance test on every period-over-period delta** (`+4.2 vs last month — not significant,
p=0.31; ~40 more trades needed to resolve a change this size`). Add a **minimum-sample gate**: below
*n* trades, show a band, not a grade.
*Why:* table stakes in institutional TCA and absent from retail tools; it stops users chasing noise,
which is genuine harm reduction. *Proves:* bootstrap resampling, hypothesis testing, power analysis,
and the judgement to know when a number means nothing. **Strongest single item for data-analyst and
data-scientist interviews.**

**R6-B2 — Conformal prediction intervals on counterfactual costs.** *(M)*
"A limit order would have saved $340" is a point estimate of an unobservable counterfactual. Wrap it in
a **split-conformal 90% interval** calibrated on held-out trades — "$180–$520 (90% coverage)" — and
report empirical coverage in the eval table. Distribution-free, assumption-light, and it makes the
product's most persuasive claim also its most honest.

**R6-B3 — ⭐ Causal attribution: did the behaviour change actually help?** *(L)*
The question every TCA user really has is *"I started using limit orders in May — did it work?"* A
naive before/after is confounded by market conditions. Implement **difference-in-differences** with
regime, realised volatility, and symbol mix as controls, plus a **synthetic-control** variant built
from the user's own untreated symbols: *"Your slippage improved 4.1 bps after the switch. Comparable
conditions improved 2.6 bps on their own. Your attributable improvement is 1.5 bps (95% CI 0.2–2.8)
≈ $90/month."* Retrospective causal *attribution*, not prediction — fully inside the thesis, and the
most commercially valuable item on this list. *Proves:* causal inference, confounding, control
construction — what quant and DS interviews actually probe.

**R6-B4 — Peer-normalised scoring via clustering.** *(M)* — revives T3.3 with a real job.
Cluster on behavioural features (size distribution, frequency, maker ratio, symbol concentration,
session-hour profile) with **K-Means and HDBSCAN**, reporting the silhouette/stability comparison — the
fact that you compared is itself the signal. Then use the cluster *for something*: normalise each
component against the peer cohort, so a high-frequency scalper isn't scored against a monthly DCA buyer
on the same fee curve. The original T3.3 produced only a decorative archetype badge; normalisation
makes the cluster load-bearing.

**R6-B5 — Execution anomaly detection.** *(M)* — revives T3.4, reframed.
Per-account **Isolation Forest** on the user's own enriched trade distribution; flag past outliers (fee
outlier, slippage spike, unusual hour, abnormal size) each with a deterministic reason string and
z-score, linked to the trade. Never a prediction — always "this trade was unusual *for you*, on this
dimension." The "why flagged" explanation comes from deterministic feature contribution, not the LLM.

**R6-B6 — Retrospective regime labelling via HMM.** *(M)* — revives T3.5, **and fixes flaw F14**.
Regime is currently a hardcoded `"STABLE"` placeholder in the Council. Fit a 3–4 state Gaussian HMM on
historical volatility/volume/spread and use **Viterbi decoding to label past windows** — never to
forecast the next one. Feed the true label into the Council packet and into R6-B3's controls.
Optionally expose the regime-conditional weight matrix from T3.11. *Proves:* latent-variable sequence
modelling, plus the discipline to use a forecasting-capable model only retrospectively.

**R6-B7 — Sample-efficiency and cold-start policy.** *(S)*
Formalise what FillScore does with 3 trades versus 300: which components are reportable at what *n*,
what a letter grade means below threshold, what the UI says instead. **Every real user starts at n=0** —
with real users this is the first thing that breaks.

#### R6-C — Multimodal (exactly one item, and it earns its place)

**R6-C1 — ⭐ Verified screenshot ingestion: a vision path with a market-data consistency gate.** *(L)*
A user uploads a screenshot (or PDF/CSV export) of their exchange trade history. A **multimodal model**
(Groq serves Llama-4-Scout/Maverick free) extracts structured rows. Then — the whole point — a
**deterministic gate** rejects rows reality contradicts: schema validation, arithmetic consistency
(`price × qty ≈ notional`, `fee ≈ notional × known_fee_rate`), timestamp plausibility, and critically a
**cross-check of each extracted fill price against the real order book at that exact timestamp**. If
the price never traded in that second, the row is rejected, not scored. Extraction is probabilistic;
admission is deterministic.
*Why it isn't bolted-on CV:* it solves three live problems — Binance geo-blocks the server (451),
Bybit/OKX are unwired, and many users will never paste an API key into a stranger's site. It is the
hedge if R6-B0.3 comes back red.
*Why it's the right kind of impressive:* the grounding contract applied to ingestion itself. The vision
model proposes; the market data disposes. *Proves:* VLM integration, structured extraction under noise,
and the instinct never to trust a model's output as fact. **Paper contribution C7.**

#### R6-D — Systems, data engineering, production craft

**R6-D1 — Event-sourced audit history + CQRS read model.** *(M)* — the principled R5-M4.
An append-only `AuditEvent` collection is the write model; the dashboard reads a projected
`AuditSummary`. Kills the fabricated trend chart, makes every historical score reconstructible, and
turns R5-C6's replay into a consequence of the architecture rather than a bolt-on.

**R6-D2 — Background job queue + worker split.** *(M)* — the core of R5-C1. BullMQ + Redis on Node,
`arq` on Python. Council runs, trade sync, and whale enrichment leave the request thread; web and
workers scale independently.

**R6-D3 — Circuit breakers + graceful degradation** *(S)* on every external dependency (Binance, Groq,
Resend, Stripe): open on sustained failure, serve a typed degraded response, half-open probe, surface
state in `/health`. Pairs with R5-M9.

**R6-D4 — Idempotency keys on every mutating endpoint** *(S)*, not only Stripe webhooks.
`POST /audit/run`, `/onboarding/sync`, `/connect` must all be safely retryable.

**R6-D5 — PySpark batch reprocessing of the whale corpus.** *(M)*
The aggTrades corpus is a genuine batch workload — millions of records, embarrassingly parallel over
`(symbol, day)` partitions. Write it as a PySpark job with a documented partitioning and skew strategy,
and publish a benchmark: single-process vs `local[*]` vs 2-node at 1M / 10M / 50M aggTrades. **Be
honest in the README that on one laptop this demonstrates the pattern rather than being required** —
the honesty is what makes it credible. *Why:* connects directly to the Spark/Hadoop and MinHash/LSH
work already on the resume, turning two disconnected lines into one data-engineering story.

**R6-D6 — OpenAPI spec + generated typed SDK + contract tests.** *(M)* — subsumes **T5.2 npm SDK**.
Generate the spec from routes, generate a typed client with `openapi-typescript`, add contract tests
that fail CI on drift. Publishing `@fillscore/sdk` costs an afternoon on top.

**R6-D7 — k6 load testing with SLO gates** *(M, was R5-N12, deps R5-C7)* — full spec at **T4.10**.

**R6-D8 — LLMOps observability** *(M)* — full spec at **T4.7**. Alert on **faithfulness drop**, not
just error rate — that's the unusual alert and the one to talk about.

**R6-D9 — Feature flags + Council kill switch.** *(S)* One flag disabling the Council with an honest
maintenance state, plus per-feature gates. Fifteen minutes; prevents a Groq outage looking like a
broken product mid-demo.

**R6-D10 — Regenerate `ARCHITECTURE.md` from reality, and keep it generated.** *(S)*
Script that emits the file map and API surface from the codebase; run it in CI so it cannot go stale.
*Proves:* docs-as-code, and it eliminates the exact failure mode — building against a stale
assumption — that has cost this project real work.

**R6-D11 — Proactive key-health monitoring** *(S, was R5-N4)* — re-run `validateBinanceKey` before
every sync, not only at connect time; surface a clear "your key needs attention" message when
permissions change or the key is revoked.

**R6-D12 — Minimal activation email** *(S, was R5-N5, deps R5-M5)* — one transactional "here's your
first FillScore" email with the PDF attached after a real user's first successful sync; exactly once.

**R6-D13 — Exchange-availability pre-flight** *(S, was R5-N6)* — an unauthenticated endpoint that pings
Binance server-side and returns reachability, surfaced in the onboarding wizard **before** the user
pastes a key. This is the user-facing half of the 451 problem — necessary, not nice-to-have.

### 4.10 — Growth, ecosystem, and platform (post-launch)

Build none of this until the launch path is live on a real URL. Preserved in full.

**T6.1 / R5-N7 — The FillScore Index** *(~6h)* — **the primary growth lever.**
A public, anonymised, **opt-in** benchmark: *"the S&P 500 of retail execution quality."* Aggregate
median FillScore, slippage, and maker ratio across the platform, **per exchange and per symbol**, and
publish a live page: *"The average retail trader scores 64. You score 81 — top 12%."*
- **Why it's the growth hook:** a data-network effect (every new user sharpens the benchmark) and the
  strongest viral CTA available ("The average retail trader scores 64. What's yours?").
- **Hard privacy gate, non-negotiable:** never publish an aggregate computed over fewer than
  **10 users** for any cell (per-exchange, per-symbol, or global). Show "not enough data yet" instead.
  This is k-anonymity: no cell may be traceable to an individual. Raise the floor toward 50 as the
  user base grows. Opt-in only; a non-opted-in user is never in the aggregate.
- **Gate:** blocked until ≥10 opted-in real users exist. It is meaningless and privacy-unsafe before.
- Opt-in ranking dimensions: FillScore, maker ratio, average slippage, whale-avoidance score,
  best-symbol consistency. Research offering: anonymised datasets, CSV exports, benchmark charts,
  reproducible methodology summaries, opt-in council decision logs.

**TCA Skills Library** *(R5-S6)* — package the methodology as portable `SKILL.md` skills
(`slippage-analysis`, `fee-audit`, `venue-comparison`, `regime-rebalance`), each with bundled scripts
and reference docs; progressive disclosure keeps council context lean (~80 tokens/skill at discovery).
A `check.py`-style linter validates frontmatter, resolves cross-file references, and detects drift
(shares infrastructure with R6-G7). Mostly packaging on top of existing packet builders — low novelty,
good for stars and for the line *"I authored a portable execution-quality methodology standard."*

**T5.3 — Chrome browser extension** *(~6h)* 🧊 — Manifest V3; content script on binance.com/bybit.com;
pre-trade overlay showing a predicted score *(depends on the cut T3.8 — build only the post-trade half)*;
real-time OBI badge *(depends on deferred T2.11)*; post-trade popup with an instant score after a fill;
calls the API with the stored JWT; published to the Chrome Web Store.

**T5.4 — TradingView Pine Script integration** *(~3h)* 🧊 — Pine v5 indicator plotting historical
FillScore alongside price; regime overlay colouring candles by HMM state (needs R6-B6); webhook
receiver `POST /api/webhooks/tradingview` recording signal-triggered trades.

**T5.5 — Multi-agent audit debate (full LangGraph, visual)** — **largely shipped.** Remaining delta is
UI polish: a "Conflict Detected" badge when agents disagree. Confidence per verdict (AC-10),
structured-JSON synthesis with explicit conflict-resolution reasoning (`synthesis.py`), and the
animated one-by-one verdict panel (`AgentCouncil.tsx` SSE) are all built.

**T5.6 — React Native mobile app** *(~8h)* 🧊 — Expo; full dashboard on iOS + Android; push
notifications ("your score dropped 8 points this week"); home-screen widget with the current grade;
manual trade entry for exchanges without an API *(overlaps R6-C1)*.

**T5.7 — DEX execution analysis** *(~6h)* 🧊 — Uniswap v3 subgraph (GraphQL) + Jupiter (Solana)
transaction analysis. Price impact vs slippage tolerance; **MEV detection via the Flashbots API**;
cross-chain CEX-vs-DEX fill-quality comparison for the same asset; an MEV-exposure score ("your last 5
Uniswap swaps were frontrun, costing ~$X"). *A genuinely novel vertical extension once CEX is solid.*

**T5.8 — "Shadow Trader" strategy simulator** *(~10h)* 🧊 — a **counterfactual engine** replaying a
user's 30-day history under different logic ("limit with 2bp offset" vs "market"). Powered by the swarm
engine (T3.12): 1000 simulations per scenario. Scenarios: *what if I used 80% limit orders / only
traded 08–16 UTC / traded on Bybit / avoided whale-correlated windows / traded BTC only?* An
opportunity-cost calculator measuring **"Lost Fills"** — fees saved but value lost on trades that never
hit the limit price. `app/shadow/page.tsx` with a scenario builder and violin-plot results.
**Inherits T3.12's deferral.** Label all output "plausible scenarios, not probability guarantees."

**T5.9 — Cross-exchange arbitrage analysis** *(~6h)* 🟨 — **partially built as T2.4 venue comparison.**
The extension: compare a Binance fill against the *global mid* of Bybit and OKX at that exact
millisecond, quantify Venue Alpha ("trading this on Bybit would have saved $420 this month"), and
account for the latency differential. The per-millisecond cross-venue lookup needs the deferred
time-series infra; the coarser daily comparison already ships.

**R5-N9 — Team dashboards** — full spec at **T4.4**. **R5-N10 — White-label API** — full spec at
**T4.8**. **R5-N11 — Full key rotation & vaulting** — full spec at **T4.9**, the complete version of
R5-M1's minimal rotation.

---

## §5 — The research track (ACTIVE)

### 5.1 — Honest verdict on venue

- What you have is a **systems-and-methodology paper with a measured evaluation.** Not a SOTA-beating
  result, and it must not pretend to be one.
- **Realistic strong outcome:** arXiv preprint → **ICAIF workshop** or **ICLR "Advances in Financial
  AI"** → ICAIF main track as a genuine stretch if the benchmark and distillation results are clean.
  Very good for an undergraduate first paper, and achievable inside a placement cycle.
- **Realistic journals, ranked honestly:** *Expert Systems with Applications* (Q1, receptive to applied
  systems + evaluation, slow but real) · *ACM TIST* · *Journal of Financial Data Science* ·
  *IEEE Access* (fast, indexed, lower prestige — a floor, not a goal).
- **Not achievable, not the right target:** *Journal of Finance*, *RFS*, *Quantitative Finance*. They
  want economic contributions, not agent architectures. Aiming there wastes months.
- **The benchmark (R6-E1) most raises the ceiling.** Benchmarks get cited far out of proportion to
  their difficulty, and yours is nearly built.
- **Do not patent.** Publishing first forfeits patentability in most jurisdictions and the prior art is
  dense. Publish openly.

### 5.2 — Contribution map

| # | Contribution | Backed by | Status |
|---|---|---|---|
| C1 | Compute-then-judge grounding contract with a *measured* faithfulness metric | E1 = 1.0 across three profiles | ✅ |
| C2 | Adversarial prosecution/defense execution-attribution debate — a known mechanism on a *falsifiable* target | `debate.py`, bounded 2 rounds | ✅ |
| C3 | Deterministic counterfactual verification gate with self-correction — a deterministic recompute, not an LLM critic | `verification.py`, gate-trip rate | ✅ |
| C4 | Leakage-free walk-forward evaluation of an *auditing* agent | `assert_no_future_leakage()`, content-hashed packets, split at 2024-01-15 | ✅ |
| C5 | Cost–quality frontier on free-tier models | 27 runs / 264K tokens / $0 | ✅ |
| C6 | **Distillation of a faithfulness guarantee into a 1.5B model** | R6-A3 | 🔨 |
| C7 | **Verified multimodal extraction** — VLM proposes, market-data gate disposes | R6-C1 | 🔨 |
| C8 | **Verdict stability radius** — a robustness metric the field doesn't report | R6-A7 | 🔨 |
| C9 | **Cross-backbone faithfulness benchmark** across 6+ open models | R6-A5 | 🔨 |
| C10 | **An honest null, correctly diagnosed** — and its corrected re-run | R6-E5 | 🔨 |

### 5.3 — Research tasks

**R6-E1 — ⭐ ExecBench: a public benchmark for execution-quality auditing agents.** *(L)*
*N* synthetic trader profiles executed against **real** Binance microstructure windows, with
deterministic ground-truth labels (component scores, counterfactual costs, correct recommendation
category, injection-resistance cases). Four tasks: numeric faithfulness, grade agreement with the
deterministic engine, recommendation actionability, injection robustness. Ship as a **Hugging Face
dataset + eval harness + leaderboard**, with the walk-forward split and leakage assertion baked in.
Most of it exists — packet builder, deterministic engine as ground truth, harness, split, CI check.
The work is packaging and documentation, not invention. **A benchmark is the artifact most likely to be
*used*, which is what turns a preprint into a cited preprint.**

**R6-E2 — Draft the paper.** *(L)* Working title: *"Compute-then-Judge: Faithful Multi-Agent Auditing
of Trade Execution Quality."* Structure: the empty quadrant (verified numbers × agentic reasoning ×
falsifiable target) → architecture → the verification gate → ExecBench → E1–E5 + C6–C9 → limitations.
**Limitations must state plainly:** n=3 profiles is descriptive not powered; only trader behaviour is
synthetic while all market data is real; the null result's instrumentation cause. Stating these before
a reviewer finds them is the difference between a weak accept and a reject.

**R6-E3 — Reproducibility package.** *(M)* Pinned Docker image, `repro_config.json` (exists),
`claim_evidence_map.md` (exists), seeds, HF dataset, `fillscore-mini` model card, one-command repro.

**R6-E4 — E5 human spot-check + calibration figure.** *(S)* The confidence-vs-faithfulness scatter —
LLM self-confidence is already stored separately from deterministic evidence coverage. If they diverge,
that's a clean publishable calibration finding essentially for free. Upgrades R6-A10 into a figure.

**R6-E5 — ⭐ Fix the whale experiment at its root, then re-run.** *(L)*
Regenerate synthetic execution prices **from the real price path / aggTrades** rather than
`Math.random()`, so slippage is *caused* by market conditions. Then re-run the whale-adversity
analysis. **Either outcome is publishable:** a real relationship is a finding; a persistent null against
correct instrumentation is a far stronger null. It also makes every downstream number — demo grades,
Council evidence, R6-B3's causal estimates — reflect real microstructure.
**It will move the locked demo grades again. That is expected and acceptable — re-lock and re-document
afterward.** Highest-integrity item in this document.

**R6-E6 — Related-work grounding.** *(M)* Cite: Perold 1988 (implementation shortfall);
Cont, Kukanov & Stoikov 2014 (order-flow imbalance); BlackRock 2018 (negative transaction costs);
Markov et al. arXiv:1904.01566 (Bloomberg BTCA — the closest production system, no LLM layer, no
faithfulness guarantee); TradingAgents; ai-hedge-fund; FinCon; AlphaAgents (arXiv:2508.11152); the
finance-bias paper (arXiv:2602.14233); the evaluation-taxonomy paper (arXiv:2603.27539); the
agentic-trading survey (arXiv:2605.19337); "Debate or vote" (NeurIPS 2025).
**The sharpest line in related work stays: *they predict; we audit.***

**R5-S7 — Frontier sharpenings** *(M each)* — F1 atomic claim verification, F3 two-tier verifier,
F4 difficulty routing, F6 evidence-utilisation metrics, F7. Optional; do only if reviews ask for more.

---

## §6 — Sequencing

```
M0 — UNBLOCK (this week; nothing else counts until green)
  R6-B0.1 hosting → R6-B0.2 deploy ml-service → R6-B0.3 verify Binance → R6-B0.4 score a real trade
  + R6-G5 (require prod URLs) + R6-D9 (kill switch) — both trivial, both prevent demo-day disasters

M1 — STOP LYING TO USERS + AUTOMATE THE GATE
  R5-C7 (CI/CD — highest signal per hour in this document)
  R5-M2 · R5-M4/R6-D1 (real trend) · R5-M5 (+cookie-auth /report) · R5-M7 · R5-M8 · R5-M9
  R6-G1 (ToS/Privacy) · R6-G2 (email verification) · R6-G3 (OAuth code) · R6-G6 (incremental sync)
  R6-D10 (regenerate ARCHITECTURE.md, keep it generated)

M2 — THE PAPER (runs in PARALLEL with M1; the science is already done)
  R6-E5 (fix whale instrumentation — do early, it moves every downstream number)
  → R6-A5 (multi-model benchmark) + R6-A7 (stability) + R6-E4 (calibration figure)
  → R6-E1 (ExecBench) → R6-E2 (draft) → R6-E3 (repro pack) → arXiv

M3 — DIFFERENTIATORS (pick by the role you're interviewing for)
  AI/ML:      R6-A3 distillation ⭐ · R6-A1 LangGraph durability · R6-A4 memory
  DS/analyst: R6-B1 significance ⭐ · R6-B3 causal attribution ⭐ · R6-B6 HMM regime
  SDE:        R6-D2 queue · R6-D1 event sourcing · R6-D3 breakers · R6-D5 Spark
  Universal:  R6-C1 verified screenshot ingestion — also the 451 insurance policy

M4 — HARDENING & PLATFORM
  R5-C8 Redis → R5-C1 Groq budget (now routing to fillscore-mini) → R5-C2/R6-A2 isolation
  → R6-A6 red team → R5-C9/R6-D8 observability → R5-C10 + R6-G14 Bybit/OKX
  → R6-A8 MCP Gateway → R5-C3 compliance export → R6-D6 OpenAPI + SDK

M5 — BUSINESS
  R5-C4 Stripe → R5-C5 GDPR (needs R6-G1 + C4) → R5-C6 audit replay → R6-D7 k6
  → T6.1/R5-N7 FillScore Index (gated on ≥10 opted-in users)

M6 — POST-LAUNCH GROWTH
  R5-N9 teams · R5-N10 white-label · R5-N11 vaulting · R5-S6 Skills Library · T5.7 DEX · T5.8 swarm
```

### If you only do five things

1. **R6-B0 (all four)** — a live, working, Council-running URL. Everything else is worthless behind it.
2. **R5-C7 (CI/CD)** — one afternoon; the cheapest credibility signal that exists.
3. **R6-A3 (FillScore-Mini)** — strongest AI/ML story, and it solves your hardest real constraint.
4. **R6-B1 (significance layer)** — strongest data-science story, and it makes the product honest.
5. **R6-E1 + R6-E2 → arXiv** — a preprint link, from work that is already 80% done.

---

## §7 — Considered and rejected (this list is an interview asset)

| Rejected | Why |
|---|---|
| **LSTM FillScore forecasting** (T3.2) | It predicts. Breaks the one positioning line the project rests on, and in 2026 a bidirectional LSTM is the least impressive deep learning you could show. **Formally cut.** |
| **Pre-trade execution estimator** (T3.8) | Same. The moment FillScore says what a *future* trade will cost, it is a signals product with a signals product's legal exposure. **Formally cut.** |
| **Reinforcement learning for execution** | Interesting, out of scope, needs a simulator you don't have. *"I rejected RL because the reward would be unfalsifiable on historical data"* is worth more than a half-built PPO loop. |
| **Chart-image understanding / voice UI / generative imagery** | No honest job in a TCA product. Keyword bait. |
| **GNN over a trade/venue graph** | The graph would be tiny and the edges arbitrary. A method in search of a problem. |
| **Swarm simulation / Shadow Trader** (T3.12/T5.8) | Cost-heavy (500 agents × 1000 MC runs ≈ 100k LLM calls at scale) and per the OASIS herd-bias finding (arXiv:2411.11581) LLM agents over-converge, so output is "plausible scenarios, not guarantees." Stays a parked stretch flagship. |
| **Full RAG over market-microstructure literature** | Retrieval over a static corpus adds nothing the deterministic engine doesn't know. R6-A4's memory retrieval is the version with a purpose. |
| **Ollama / any local LLM** | The machine cannot run it (Intel Iris Xe, ~15.7 GB). Re-derived three times across four roadmaps. **Never reintroduce.** R6-A3 is the correct shape of this idea: train on Colab, serve hosted. |
| **Kafka / InfluxDB / live L2 streaming** (T2.9, T2.11, T2.13, T2.14) | Binance provides no historical L2 to backfill against, so these can't be made reproducible. Document them (§10) — knowing *when* an upgrade becomes necessary is the senior signal and costs nothing. |
| **Mobile app, Chrome extension, TradingView, DEX** (T5.3/T5.4/T5.6/T5.7) | Post-launch distribution plays needing a live product with real users first. |

---

## §8 — Decisions

**D1 — Bybit/OKX: wire them in** (not retire). If Binance geo-blocks your *server*, the same
jurisdictional logic affects a meaningful share of your *users*; a single-exchange product with a
geo-fragile primary exchange is fragile. The actual missing work is the read-only key validators, not
the clients. Until it lands, remove "3 exchanges" from product copy.

**D2 — Whale correlation: fix the science first, then wire it in.** The null is an artifact of
`Math.random()` slippage. Do **R6-E5** first. If a real relationship appears, the feature is clearly
worth it; if a clean null persists against correct instrumentation, retire it to "demo-only, explicitly
labelled" **and publish the null**, which is worth more than the feature. Until then take R5-M6's cheap
option (b): an explicit "not yet available for your account," never a silently empty panel.

**D3 — Standalone ML: three revived, two cut.** K-Means → R6-B4 peer normalisation. Isolation Forest →
R6-B5 retrospective anomalies. HMM → R6-B6 retrospective regime labelling (also closes flaw F14). LSTM
and the pre-trade estimator → **formally cut**. No item may be carried as "unbuilt" across a fifth
roadmap generation.

**D4 — Stripe tiers (proposal, tune later).** Free: 1 exchange connection, 3 council runs/month,
30-day history, no API. Pro (~$19/mo): 3 connections, 50 council runs/month, full history, PDF + share,
an MCP token, peer benchmark. Enterprise: unlimited, team dashboards, white-label API, audit export.
**Gate on council runs** — the only genuinely metered cost you have.

**D5 — MCP Gateway before billing.** You are in a placement cycle, not a fundraise. Distribution,
stars, and a 2026-current artifact serve the stated goals more than a revenue path with zero users on
the other end. It still needs R6-A2's isolation as a prerequisite.

**D6 — Hosting: Oracle Cloud Frankfurt, decided**, with Fly.io or a €4/mo Hetzner CX22 as the named
fallback if the ARM rebuild fights back. The cost of indecision now exceeds the cost of being wrong.

---

## §9 — Verification discipline (these caught real bugs — keep applying them)

**"No crash" is not proof a run worked.** A council run silently falls back to typed `_default_*()`
verdicts on Groq 429 exhaustion and still returns a plausible, well-formed result. Every eval number
produced before this check existed turned out invalid at least once. Verify every live council or eval
run four ways:
1. **Failure-string sweep** — grep stdout, stderr, and the persisted doc for `failed:`, `Max retries`,
   `_default_`, `429`, `rate limit`. Report the count for each, including zeros.
2. **Call count** — assert `n_calls == 9` from the persisted `council_runs` document. Print the value.
3. **Freshness** — print `user_id` and `created_at`; confirm the run is fresh, not a replay. Remember
   `created_at` is an ISO-8601 **string** — query by prefix.
4. **Read the actual text** — generic filler ("consider optimizing your execution") indicates a
   degraded run even when the numbers look fine. Aggregates cannot detect this; only reading can.

**Read raw logs, never summaries.** Observed agent failure modes, each of which happened: fabricated a
"correction" inventing plausible file paths that didn't exist; three unauthorised commits despite
explicit instruction; ran `npm run seed` unprompted and corrupted the locked demo dataset; injected
mocked data to force a test green; ran a gated `--apply` migration; wrote hollow assertions
(`>=400` accepts 500); claimed red-then-green without showing red; invented a plausible-but-wrong
explanation instead of reporting the real error; silently dropped a file from an explicit `git add`.

**What consistently worked:** demanding raw artifacts, requiring a real red phase, dry-running every
migration, verifying against the live system, and treating "the tests pass" as necessary but never
sufficient.

**Never let `.env` contents be printed.** Confirm env vars by key name or non-empty check only.
(An agent once masked the DB password and leaked the API keys in the same output.)

**Always run `npm run build` on the frontend and `tsc --noEmit`.** Both catch classes of bug the test
suites structurally cannot, and both caught real production bugs.

---

## §10 — Institutional upgrade paths (document, don't build)

The "I understand *when and why* each upgrade becomes necessary" table — a strong interview signal on
its own, and free.

| Current | Upgrade to | Why | Trigger |
|---|---|---|---|
| Node WebSocket worker | **Go ingestor** | Go handles 10,000+ msg/sec via goroutines; Node is fine to ~500/sec | Tracking 20+ symbols live |
| Redis Streams | **Kafka / NATS** | Durable log replay, consumer groups, backpressure | Ingesting across 5+ exchanges |
| `.env` master key (AES-256-GCM) | **HashiCorp Vault / AWS KMS** | A server breach can't expose the master key; the app requests decryption on the fly | Handling real user funds |
| Oracle VPS + Vercel | **AWS EKS + RDS** | Kubernetes horizontal scaling; managed DB with read replicas | MRR > $1k/month |
| Groq free tier | **Distilled model + paid tier + routing** | 100K TPD blows up under multi-user load | Real concurrent traffic (R5-C1) |
| MongoDB single cluster | **Read replicas / sharding** | Read-heavy audit/analytics load | Sustained user growth |

The framing: *"The current stack handles our traffic comfortably. I architected it swap-compatible —
the Node ingestor can be replaced by a Go service behind the same interface without frontend changes.
I understand when and why that upgrade becomes necessary."*

---

## §11 — Prior art studied (interview substrate and related-work grounding)

**`anthropics/financial-services`** — the most load-bearing teardown. Source of the three-tier
reader/writer/orchestrator isolation (R6-A2), schema-validated handoffs with an allowlist and
`additionalProperties:false`, the Agent Skills progressive-disclosure format (R5-S6), and the
`check.py` validation-harness pattern (R6-G7). Its stance — "AI drafts, humans sign off; nothing is
investment advice" — is inherited directly.

**`HKUDS/AI-Trader`** (arXiv:2512.10971) — source of the leakage-free live benchmark methodology, the
minimal-information paradigm, the Observe-Reason-Act loop with self-correction, agents never touching
the frontend (token-authed REST/MCP only), and the metric discipline of **Sortino-family metrics, never
win-rate**. Central lesson adopted: risk control and cross-verification must be an *explicit module*,
not an emergent hope — FillScore's deterministic verification gate is that module.

**`TradingAgents`** — source of the debate → synthesis → risk-gate shape. **What FillScore rejects is
the target:** TradingAgents debates *what to trade* (unfalsifiable, prediction). FillScore reframes the
debate as prosecution/defense execution attribution — a falsifiable audit of what already happened.

**MiroFish** — source of the immutable event-log architecture (already the shape of `council_runs`), the
ReportAgent meta-agent pattern, counterfactual inject-a-variable re-runs, and machine-readable
`verdict.json` alongside the human report. Its herd-bias caveat is why the swarm engine is deferred.

**Bloomberg BTCA** (Markov et al., arXiv:1904.01566) — the closest production system to FillScore, and
the sharpest contrast: a pure statistical TCA engine with **no LLM reasoning layer and no faithfulness
guarantee.** This is the empty quadrant FillScore occupies — verified numbers + agentic reasoning +
a falsifiable target.

**`koala73/worldmonitor`** — a geopolitical/OSINT dashboard, **not** an order-book or TCA tool. Earlier
roadmaps misattributed "L2 order book / whale flow" ideas to it. Borrow only the signal-convergence view
and the strong README/ARCHITECTURE docs pattern. **Never copy its code — AGPL-3.0 copyleft conflicts
with selling FillScore.**

---

*FillScore Master Roadmap · Deepanshu · VIT Vellore · 23BIT0264*
*Self-contained. Supersedes and replaces Supreme v2, Unified v4, Audit v5, and Launch+Research v6 —
every task from every generation is inlined above. Archive or delete the predecessors; they contain
known-wrong facts (retired grades, futures fee rates mislabelled as spot, Ollama references, colliding
task IDs) and must never be consulted as a source of truth. Edit this file going forward.*

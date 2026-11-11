# FillScore — Roadmap (single source of truth)

*Consolidated 2026-11-07 from `ROADMAP.md` (Master Roadmap: Supreme v2, Unified v4, Audit v5, Launch+Research v6), Roadmap v5 (claude.ai Project), `docs/research/AUDIT_2026-11.md` and spec `docs/superpowers/specs/2026-11-07-measurement-v2-design.md`.*

- **Maintenance:** edit this file only. The Project copy is refreshed at milestones.
- **IDs are permanent anchors.** An item keeps its ID even when it is superseded (v5 IDs `A1…H5`, and the older `T*`, `AC-*`, `R5-*`, `R6-*`).
- **Detailed specs** of older items live in git history: `git show <commit>:ROADMAP.md`.

---

## §0 State (2026-11-07)

| Area | State |
|---|---|
| SaaS core | ✅ JWT + Google/GitHub OAuth, email verification, per-account isolation with cross-user tests, onboarding, lease-based background sync, read-only keys enforced fail-closed, AES-256-GCM, GDPR export/delete, ToS/Privacy pages (legal review pending) |
| Deploy | ✅ Vercel (frontend) + Render Frankfurt (`fillscore-api`, `fillscore-ml`) + Atlas. CI gates deploys (backend, frontend, ml, lint, e2e, eval). `smoke_prod.sh` verifies the live commit |
| Observability | ✅ Sentry ×3, Langfuse OTel tracing, structured logs |
| AI layer | ✅ Placeholder grounding, claim check, counterfactual verifier with materiality gate, golden set with mutation-tested invariants, Council + single-call arm, ablation (prompt v1.5.0 results). Regime placeholder removed (4R-0c) |
| Measurement | ⚠ **v1 is rule-based and partly inaccurate** (audit 2026-11). 4a added markouts and CS/AR spread estimates. **Scoring v2 ("measured") is the current focus** (§2) |
| Demo data | ⚠ The Binance trio is anchored to real prices for MARKET fills only; LIMIT slippage is forced to 0. demo-bybit/okx/multi had simulated prices and are **hidden** (4R-0b/c). All demos are rebuilt on real prints in 4R-2 |
| Real users | ⚠ **0 real trades scored so far.** Deepanshu places about 10 tiny real trades before 4R-1b closes |
| Agent tooling | ✅ Guard hook (143 cases: blocks running protected scripts and printing secrets; allows reading), field registry, commit-msg hook |

**What the audit taught us** (`docs/research/AUDIT_2026-11.md`):
1. Several displayed numbers didn't match their labels: the cards, "cost you $X", Venue Alpha and the fee component. Fixed in 4R-0.
2. The core inputs were weak: the 1-min arrival proxy, the high–low spread heuristic and the hand-picked hours. Fixed by v2.
3. A backfill overwrote a field the scorer depended on. Prevented now by the field registry.

---

## §1 North star and invariants

**FillScore: the independent, verifiable execution auditor for crypto traders.**
- **Measured:** institutional TCA methodology on real public market data.
- **Explained:** AI narratives whose numbers are true by construction.
- **Verifiable:** versioned scores, integrity hashes, replays, signed evidence and, later, cryptographic trade provenance.

**Invariants** (enforced in code, tests and hooks; never relaxed by a feature):
- **I1** Audit the past; never advise, signal or predict. This is also the legal line.
- **I2** LLMs label, argue and explain; they never originate a number.
- **I3** Read-only exchange keys, validated fail-closed; never withdrawal-enabled keys.
- **I4** Published grades never change silently. Any scoring change is a **new ScoringVersion**; v1 stays reproducible.
- **I5** Provenance is explicit and immutable (`synthetic-demo` / `real-user`). **True statement:** demo trader *behaviour* is synthetic; market data is real public data. Demo fill prices are real-anchored only where stated, and fully real after 4R-2.
- **I6** Free tier first; secrets only from env, never printed.
- **I7** External facts (API shapes, formulas, fee rates) come from cited official docs or papers.
- **I8** Correlation, never causation ("coincided with").

**Goals, in order:** (1) placement and a resume that earns interviews; (2) a research paper; (3) GitHub recognition; (4) a sellable SaaS.

---

## §2 Phases (dependency order)

| Phase | Goal | Contents | Exit criteria | Status |
|---|---|---|---|---|
| **4a** | Microstructure measurement | A1, A2, spread-aware counterfactual, markouts card | Report accepted | ✅ (spread field collision fixed in 4R-0) |
| **4R-0** | Stop the bleeding | Field registry and `spreadEstimates`, honest cards and copy, skipped-trade disclosure, guard read/execute split, hidden rolling demos, no regime in prompts, reversion from markouts | Suites green, no grade change | ✅ 4R-0/0b/0c; **4R-0d**: versioned golden sets, demo Council re-record |
| **4R-1a** | Measurement layer v2 | Spec §5: aggTrades data layer, mid from aggressor-side prints, effective/realized spread, impact, E/Q, order IS with opportunity cost, lineage. **A3** fee snapshots, **A4** order reconstruction, **A7** | Every metric hand-tested; identities asserted; the committed real-data fixture passes | ✅ M1 (2026-11-11; Binance only; Bybit/OKX orders not built, see `docs/milestones/M1.md`) |
| **4R-1b** | Scoring v2 | Spec §6: data-derived anchors and hour profiles, minimum 20 fills, bootstrap intervals, **A11** ScoringVersion + integrity hash, **D1** verify endpoint, `/methodology` generated from the metric registry | v1 unchanged; v2 versioned; ≥1 **real** account scored under v2 | ✅ built in M1 (v2.0.0, ADR-0010); the real-account check stays open until real trades exist (`scripts/validate_real_account.py`) |
| **4R-2** | Real demos | Spec §7: demos rebuilt from real prints, re-locked under v2; Bybit/OKX demos rebuilt from public archives or removed; whale study re-run (R6-E5); **one full ablation re-record** on golden v2 | New grades documented next to v1; ablation table regenerated and verified | |
| **4b-2** | Cost vs expected | **A5** square-root impact + LightGBM residual + MAPIE conformal intervals, trained on real fills; **C1** Quick/Deep audit | Every order shows cost vs expected with an interval, or "insufficient data" | |
| **4c** | Explain and act | **A6, A8, E1, E2, C3** | Exception queue live; replay figures open their sources | |
| **5a** | Trust and reach | **D2, E3, F1, C2, C6, C7, G1, G2** | MCP server usable from Claude; red-team in CI; signed pack verifies | |
| **5b** | Breadth | **B1, B3, A9, B5, G6** | ≥3 API exchanges + Kraken/Coinbase CSV end to end | |
| **5c** | Differentiators | **D3** (zkTLS spike first), **F2, B4** (EVM), **D4, F4** | ≥2 shipped | |
| **6** | **Design and UI: remind Deepanshu** | Track H | New design system on all core screens | |
| **7** | Launch | Real users, write-ups, HN/PH, **G3** billing if warranted, **F5**, paper submission | ≥20 real users scored | |

**Track R (research) runs in parallel** and logs to `docs/research/`. The paper is written at the end from LOG + EXPERIMENTS + code.

---

## §3 Feature catalogue (v5 tracks; older IDs they supersede in brackets)

### A — Quant core
- **A1** Markouts 1 s–5 min ✅ [R6-A related; T2.12 adjacent].
- **A2** CS/AR spread estimators ✅. Now a cross-check only; v2 measures the spread from aggressor-side prints (ADR-0008).
- **A3** The account's actual fee rates (commission endpoint, FeeSnapshot) → 4R-1a.
- **A4** Order reconstruction; true order type, resting time (replaces T2.13 "latency", ADR-0007) → 4R-1a.
- **A5** Expected cost with conformal intervals → 4b-2 [R6-B2; T3.8 stays cut: it predicts *future* trades, while A5 models the *past* order's expected cost].
- **A6** Cost decomposition per order (spread / impact / timing / fees / opportunity; delay not measurable) [T3.9 v2].
- **A7** Rule 605 vocabulary: effective/realized spread at 1/15/60/300 s, E/Q, price improvement → 4R-1a.
- **A8** Noise-aware statistics: bootstrap intervals, minimum sample, "too few to tell" [R6-B1, R6-B7] → partly 4R-1b.
- **A9** Perpetual funding costs.
- **A10** Fill probability / opportunity cost of limit orders, research spike [opportunity cost itself is measured in 4R-1a].
- **A11** Versioned scoring + integrity hash [T4.11, R5-C6] → 4R-1b.

### B — Data and connectors
- **B1** CCXT adapter (shadow mode first) [R5-C10 history debt].
- **B2** Public market-data lake: aggTrades/1 s windows, Parquet + DuckDB → 4R-1a.
- **B3** CSV import + hidden-cost checker [overlaps R6-C1].
- **B4** DEX wallet audit, EVM first, MEV patterns [T5.7].
- **B5** Scheduled re-sync and stale-data indicator [T4.18, R6-G6, R6-G12].

### C — AI layer
- **C1** Quick audit (default) / Deep audit (Council, opt-in) → 4b-2.
- **C2** "Ask your execution", deterministic tools only [T3.13–15 chat, superseded].
- **C3** Grounded exception explanations.
- **C4** Claim-type-routed verification [R5-S7 F1].
- **C5** Usefulness eval calibrated to human ratings [R6-E4].
- **C6** Promptfoo red-team in CI [T4.15, R5-C2, R6-A2, R6-A6].
- **C7** Free-tier budget engine [T4.13, R5-C1].

### D — Trust and verifiability
- **D1** Audit verify / replay endpoint [T4.11, R6-A1 Council replay].
- **D2** Signed evidence packs.
- **D3** zkTLS verifiable scorecards (spike approved).
- **D4** Privacy-preserving peer benchmarks; market baseline until N users [T2.10, T6.1, R5-N7].
- **D5** Provenance everywhere ✅ [T4.14].

### E — Workflow
- **E1** Exception queue.
- **E2** Trade replay with source-linked figures.
- **E3** Best-execution evidence pack [T4.16, R5-C3].
- **E4** Weekly digest [T2.7, R6-D12].
- **E5** Journal ↔ cost linking.

### F — Platform
- **F1** MCP server [T5.1, R6-A8].
- **F2** MCP App.
- **F3** Public API + OpenAPI [T4.8, R5-N10, R6-D6].
- **F4** `fillscore-metrics` package [R5-S6 skills library adjacent].
- **F5** Open benchmark [R6-E1 ExecBench].

### G — SaaS operations
- **G1** Redis rate limiting/cache [T4.6, R5-C8, R6-G4].
- **G2** PostHog + feature flags [R6-D9].
- **G3** Stripe billing, last [T4.3, T4.19, R5-C4].
- **G4** Key rotation [T4.9, R5-M1, R5-N11].
- **G5** k6 [T4.10, R5-N12, R6-D7].
- **G6** Debt: lint warnings, `allowScripts`, Bybit/OKX history.

### H — Design and UI (Phase 6; Claude must remind Deepanshu)
- **H1** Design system.
- **H2** Core screens redesign.
- **H3** Accessibility.
- **H4** Demo video and screenshots.
- **H5** Lint debt.

---

## §3a Milestones and additions from the market research (2026-11-11)

**Milestones.** Work now follows `docs/agent/MASTER_BRIEF.md`. The milestones map onto the phases in §2: M1 = 4R-1a + 4R-1b · M2 = 4R-2 · M3 = 4b-2 plus C7 (moved here from 5a) and the `evidence_cited` fix · M4 = 4c · M5 = 5a without C7 · M6 = 5b · M7 = 5c · M8 = Phase 6 (stop for Deepanshu) · M9 = launch readiness (G5, security review, write-ups; G3 billing behind a flag). Current state: `docs/PROGRESS.md`.

**Additions, changes and drops.** Source for each: `docs/research/MARKET_2026-11.md` (section or source number in brackets).

| ID | Item | Why | Milestone | Pillar |
|---|---|---|---|---|
| **B3** (sharpened) | CSV import becomes a **broker-app round-trip audit**: realized cost of a buy-then-sell pair, and of each fill, against public prints at the same second | Two separate 2026 studies measured round-trip costs on broker apps by hand: TUM found −0.58% to −7.49% (6 to 13 round trips per platform) [20]; Frankfurt School found 0.53% to 6.45% (432 round trips on nine providers) [21]. No tool lets a user measure their own | M6 | Measured |
| **A12** (new) | **Fee-schedule gap** per fill: the cost the published fee schedule predicts vs the measured cost. Same definition as the TUM "hidden spread" | The gap reached 4.51 percentage points on one app [20]. It is the single number retail users do not see | M4 (part of A6) | Measured |
| **B6** (new) | **Fill-data quality report** before scoring: missing fills, duplicates, multiple fee rows, unit mismatches, fills with no order record | Recurring exchange-API fill problems [30]. A score on bad input is not verifiable | M1 (basic counts), M6 (full) | Verifiable |
| **B7** (new) | **Aggressor-side convention tests per venue** (Binance `isBuyerMaker`; Coinbase `side` = maker side; Bybit CSV `side`), with a check of the user's fill side against the public print | Conventions differ by venue, and Bybit's CSV meaning is not documented [§8]. A wrong sign flips every spread | M2 (Bybit, before any Bybit demo), M6 | Measured |
| **A13** (new) | **Stop-order outcome audit**: trigger price vs fill price and the public prints between them | Stop-loss slippage is a recurring complaint [29]. Needs the order type and stop price from order history (A4) | M4, if A4 returns stop prices; otherwise dropped with a note | Measured |
| **D2** (sharpened) | Signed evidence packs gain an optional **public timestamp in a transparency log** (Sigstore Rekor v2), and a **reproduce-it-yourself bundle**: inputs, market-data pointers with checksums, and a script | Rekor v2 is generally available and free [42]. A signature proves integrity; a log entry proves the date. Neither proves origin, and the pack says so | M5 | Verifiable |
| **E6** (new) | **Limits panel on every report:** sample size, reference-data source, what could not be measured | The TUM brief does this [20]; vendors do not publish methods [§1] | M1 (v2 result), M4 (all reports) | Explained |
| **E3** (reworded) | Best-execution evidence pack is worded "supports your own documentation". Never "compliant", never "Article 78 report" | Article 78 duties sit with firms [19]; a compliance claim is a legal risk [§Risks] | M5 | Verifiable |
| **D3** (narrowed) | zkTLS stays a **feasibility spike only**. Nothing is promised in copy until a proof of an exchange REST response works end to end | TLSNotary is pre-1.0 and says "not for production"; no project was shown to handle HMAC-signed exchange APIs [§6] | M7 | Verifiable |
| **T5.9 / venue comparison** (constrained) | The matched venue comparison reports only the user's own past fills in matched buckets. A replay of past fills on another venue's tape is **not built**: it reads as routing advice | Invariant I1 [§Synthesis, idea 11] | M4 | Measured |
| **/methodology** (sharpened) | Uses the Rule 605 names (effective spread, realized spread at horizons, effective-over-quoted) with one worked example per metric | The names are public and recognised [22]; no vendor publishes a method [§1] | M1 | Measured |

**Positioning line, checked against the research:** no vendor found serves a retail or prosumer trader with an audit of their own fills from a read-only key; open-source TCA libraries cover FX and equities only; no vendor offers an MCP server for execution audits [§1, §7]. This is a statement about what a search found on 2026-11-11, not proof of absence.

**Wording to stop using** (see the corrections at the top of `MARKET_2026-11.md`): "MiCA Article 78, enforceable since 1 Jul 2026" (say "MiCA applies since 30 Dec 2024; the transition ended 1 Jul 2026"); "TUM and Frankfurt School studies measured 0.5% to 7.5%" as if it were one study; any competitor named Botminds.

---

## §4 Register of older IDs (one line each; corrected status)
Legend: ✅ built · 🟨 partial · 🟥 not built · 🧊 deferred · ⛔ cut · ↪ superseded by.

### Phases 1–2
| ID | Item | Status |
|---|---|---|
| T1.x | Foundation: engine, Binance ingestion, encryption, enrichment, UI | ✅ v1 (arrival = 1-min open proxy; ↪ v2 in 4R-1) |
| T2.1 | Analytics deep-dive | ✅ |
| T2.2 / T2.3 | Bybit / OKX connectors | 🟨 wired, not run with live keys; ↪ B1 |
| T2.4 | Exchange comparison ("Venue Alpha") | 🟨 relabelled "average slippage by venue (unmatched)"; matched version in 4c |
| T2.5 / T2.6 | PDF / CSV export | ✅ (CSV spread column fixed with the registry) |
| T2.7 | Weekly digest | 🧊 ↪ E4 |
| T2.8 | Share card | ✅ (hidden demos return "unavailable") |
| T2.9 | WebSocket live scores | 🧊 |
| T2.10 | Benchmark comparison | 🧊 ↪ D4 |
| T2.11 | OBI engine | 🧊 no spot L2 history; collector-forward only (ADR-0006) |
| T2.12 | Whale correlation | 🟨 demo-only; post-fill weighting to fix; re-run in 4R-2 (R6-E5) |
| T2.13 | Execution latency | ⛔ not measurable from read-only history ↪ A4 resting time (ADR-0007) |
| T2.14 | Spoofing detector | 🧊 (ADR-0006) |

### Phase 3
| ID | Item | Status |
|---|---|---|
| T3.1 | FastAPI scaffold | ✅ |
| T3.2 | LSTM forecasting | ⛔ predicts |
| T3.3 | K-Means clustering | 🟥 ↪ R6-B4 |
| T3.4 | Isolation Forest | 🟥 ↪ R6-B5 |
| T3.5 | HMM regime | 🟥 ↪ R6-B6 (the placeholder was removed from prompts in 4R-0c) |
| T3.6 / T3.7 | Narration grounding / engine | ↪ Council grounding |
| T3.8 | Pre-trade estimator | ⛔ predicts |
| T3.9 | Attribution v2 | 🟨 v1 has known errors (audit #5) ↪ A6 |
| T3.10 | Agentic Council | ✅ as AC-x |
| T3.11 | Regime transitions | 🟥 forecast half cut |
| T3.12 | Swarm simulation | 🧊 |
| T3.13–T3.15 | Regime exposure, chat, narration polish | ↪ C2 |
| T3.16 | Leakage-free eval | ✅ AC-11 |
| T3.17 | Self-eval / steering lint | 🟥 ↪ R6-G7 |

### Agent Council
| ID | Item | Status |
|---|---|---|
| AC-0…AC-3 | Packets, graph, parallel specialists | ✅ (liquidity reversion wired to markouts, 4R-0c) |
| AC-4 | Grounding | ✅ |
| AC-5 | Verification gate | ✅ |
| AC-6 | Debate | ✅ |
| AC-7 | Synthesis v2 | ✅ (one priority rule, no regime) |
| AC-8 | Persistence; replay | 🟨 load built, replay ↪ D1 |
| AC-9 | SSE UI | ✅ |
| AC-10 | Evidence-coverage confidence | ✅ |
| AC-11 | Walk-forward eval | ✅ |
| AC-12 | Multi-model ablation | 🟥 ↪ R6-A5 |
| AC-13 | Memory | 🟥 ↪ R6-A4 |
| AC-14 | Cost telemetry | ✅ |
| AC-15 | Artifact pack | ✅ |

### Phase 4
| ID | Item | Status |
|---|---|---|
| T4.0 | Secret scrub + fail-fast env | ✅ |
| T4.1 / T4.2 | JWT / OAuth | ✅ live |
| T4.3 | Stripe | 🟥 ↪ G3 |
| T4.4 | Teams | 🟥 (R5-N9) |
| T4.5 | Docker + CI/CD | ✅ (Render auto-deploy after checks) |
| T4.6 | Redis | 🟥 ↪ G1 |
| T4.7 | Observability | ✅ |
| T4.8 | White-label API | 🟥 ↪ F3 |
| T4.9 | Key rotation | 🟥 ↪ G4 |
| T4.10 | k6 | 🟥 ↪ G5 |
| T4.11 | Audit replay/verify | 🟥 ↪ A11 + D1 (4R-1b) |
| T4.12 | Account isolation | ✅ |
| T4.13 | Groq budget + queue | 🟨 run caps exist ↪ C7 |
| T4.14 | Provenance | ✅ |
| T4.15 | Injection isolation + SECURITY.md | 🟨 notes excluded from prompts; SECURITY.md exists ↪ C6 |
| T4.16 | Compliance export | 🟥 ↪ E3 |
| T4.17 | Onboarding | ✅ code; 🟥 no real user yet |
| T4.18 | Incremental sync | 🟨 ↪ B5 |
| T4.19 | Metering | 🟥 ↪ G3 |
| T4.20 | GDPR | ✅ |

### Phases 5–6
| ID | Item | Status |
|---|---|---|
| T5.1 | MCP server | ↪ F1 |
| T5.2 | SDK | ↪ F3 |
| T5.3 | Browser extension | 🧊 |
| T5.4 | TradingView | 🧊 |
| T5.5 | Visual debate | ✅ mostly |
| T5.6 | Mobile | 🧊 |
| T5.7 | DEX | ↪ B4 |
| T5.8 | Shadow Trader | 🧊 (opportunity cost measured for real in 4R-1a) |
| T5.9 | Cross-venue analysis | 🟨 ↪ matched venue comparison in 4c |
| T6.1 | FillScore Index | ↪ D4 |

### R5 — audit must-fix / complete / new
| ID | Item | Status |
|---|---|---|
| R5-M1 | Encryption-key rotation | 🟥 ↪ G4 |
| R5-M2 | Unique audit index | ✅ |
| R5-M3 | CSRF origin check | ✅ |
| R5-M4 | AuditHistory | ✅ (event-sourced build in 4R-1b) |
| R5-M5 | Report for real users | ✅ |
| R5-M6 | Whale for real users | ✅ option (b); (a) after 4R-2 |
| R5-M7 | Single router mount | ✅ |
| R5-M8 | Zod validation | ✅ partial |
| R5-M9 | Typed Council errors | ✅ |
| R5-C1 | Groq budget | ↪ C7 |
| R5-C2 | Injection isolation | ↪ C6 |
| R5-C3 | Compliance export | ↪ E3 |
| R5-C4 | Stripe | ↪ G3 |
| R5-C5 | GDPR | ✅ |
| R5-C6 | Audit replay | ↪ A11/D1 |
| R5-C7 | CI | ✅ (leakage assertion in eval job) |
| R5-C8 | Redis | ↪ G1 |
| R5-C9 | Observability | ✅ |
| R5-C10 | Bybit/OKX wiring | 🟨 validators in; live keys untested ↪ B1 |
| R5-N1 | Verify-this-verdict button | ↪ D1 UI |
| R5-N2 | Calibration page | ↪ C5 |
| R5-N3 | Coach/Council agreement | 🟥 |
| R5-N4 | Key-health checks | 🟥 |
| R5-N5 | Activation email | 🟥 ↪ E4 |
| R5-N6 | Exchange pre-flight | ✅ |
| R5-N7 | Index | ↪ D4 |
| R5-N9 | Teams | 🟥 |
| R5-N10 | White-label | ↪ F3 |
| R5-N11 | Vaulting | ↪ G4 |
| R5-N12 | k6 | ↪ G5 |
| R5-S6 | Skills library | ↪ F4-adjacent |
| R5-S7 | Frontier sharpenings | ↪ C4 |

### R6 — v6 additions
| ID | Item | Status |
|---|---|---|
| R6-B0 / R6-B0.1 | Blocking layer; hosting | ✅ Render Frankfurt (Oracle plan superseded) |
| R6-B0.2 | Deploy ml-service | ✅ |
| R6-B0.3 | Binance reachability | ✅ (sync works from Frankfurt) |
| R6-B0.4 | Score one real trade | 🟥 **open: needed by 4R-1b** |
| R6-G1 | ToS/Privacy | ✅ (legal review) |
| R6-G2 | Email verification | ✅ |
| R6-G3 | OAuth code exchange | ✅ |
| R6-G4 | Per-account rate limiting | ↪ G1 |
| R6-G5 | Required prod URLs | ✅ |
| R6-G6 | Incremental sync | ↪ B5 |
| R6-G7 | Prompt-drift linter | 🟥 |
| R6-G8 | Guest flash | ✅ |
| R6-G9 | Test performance | 🟨 |
| R6-G10 | Diagnostics folder | 🟥 |
| R6-G11 | Integration-test marking | ✅ deselected |
| R6-G12 | Sync weight accounting | 🟨 ↪ B5 |
| R6-G13 | Git-history purge decision | 🟥 decide before wider launch |
| R6-G14 | OKX enum | ✅ |
| R6-A1 | LangGraph durability/replay | ↪ D1 |
| R6-A2 | Reader/writer isolation | ↪ C6 |
| R6-A3 | FillScore-Mini distillation | 🟥 Track R / C7 option |
| R6-A4 | Vector memory | 🟥 |
| R6-A5 | Multi-model benchmark | 🟥 Track R |
| R6-A6 | Red-team ASR | ↪ C6 |
| R6-A7 | Stability radius | 🟥 Track R |
| R6-A8 | MCP gateway | ↪ F1 |
| R6-A9 | Verify button | ↪ D1 |
| R6-A10 | Calibration page | ↪ C5 |
| R6-A11 | Coach/Council agreement | 🟥 (= R5-N3) |
| R6-B1 | Significance layer | ↪ A8 (4R-1b) |
| R6-B2 | Conformal counterfactuals | ↪ A5 |
| R6-B3 | Causal attribution (DiD) | 🟥 after real users |
| R6-B4 | Peer-normalised clustering | 🟥 after real users |
| R6-B5 | Anomaly detection | 🟥 |
| R6-B6 | Retrospective HMM regime | 🟥 |
| R6-B7 | Cold-start policy | ↪ A8 (minimum 20 fills) |
| R6-C1 | Verified screenshot ingestion | 🟥 ↪ B3 family |
| R6-D1 | Event-sourced audits | ↪ 4R-1b `audit_build` |
| R6-D2 | Job queue/worker split | 🟨 Mongo jobs (spec §8) |
| R6-D3 | Circuit breakers | 🟥 |
| R6-D4 | Idempotency keys | ↪ spec §8 |
| R6-D5 | PySpark batch | 🟥 optional |
| R6-D6 | OpenAPI + SDK | ↪ F3 |
| R6-D7 | k6 | ↪ G5 |
| R6-D8 | LLMOps observability | ✅ Langfuse |
| R6-D9 | Feature flags + kill switch | ↪ G2 |
| R6-D10 | Generated ARCHITECTURE.md | ✅ |
| R6-D11 | Key-health monitoring | 🟥 (= R5-N4) |
| R6-D12 | Activation email | ↪ E4 |
| R6-D13 | Exchange pre-flight | ✅ |
| R6-E1 | ExecBench | ↪ F5 / Track R |
| R6-E2 | Draft paper | Track R, at the end |
| R6-E3 | Repro package | Track R |
| R6-E4 | Human spot-check / calibration | ↪ C5 |
| R6-E5 | Fix the whale experiment | ↪ 4R-2 |
| R6-E6 | Related work | `docs/research/RELATED_WORK.md` |

---

## §5 Decisions
- **Old D1** Bybit/OKX are wired, not retired. **D2** Fix the whale science first. **D3** Three standalone-ML items revived, two cut. **D4** Stripe tiers proposal. **D5** MCP before billing. **D6** Hosting → *superseded*: Render Frankfurt.
- **v5:** zkTLS spike approved; DEX = EVM first; billing last; research is logged continuously.
- **Spec 2026-11-07:**
  - D1 guard blocks running, not reading;
  - D2 v1 frozen, v2 measured;
  - D3 rolling demos hidden then rebuilt or removed;
  - D4 this file is the single roadmap;
  - D5 timing from a data-derived hour profile; minimum 20 fills.
- **4R-0 decisions:**
  - demo `spreadBps` is never fabricated (unseeded originals);
  - skipped trades are disclosed;
  - Council reversion is defined on MARKET fills (makers are covered by markouts);
  - golden sets are versioned, and one re-record happens after 4R-2;
  - cached demo Council runs are re-recorded, never text-edited.

## §6 Considered and rejected
LSTM forecasting and pre-trade estimates (they predict); RL execution; chart-image/voice/generative features; GNN; swarm simulation (herd bias, cost); RAG over literature; local LLMs (hardware); live L2/Kafka/InfluxDB before there's a collector need; mobile, extension and TradingView before real users; **synthetic OBI or synthetic spreads of any kind**; editing recorded LLM outputs.

## §7 Verification discipline
- **"No crash" is not proof.** For live Council runs: a failure-string sweep (`failed:`, `Max retries`, `_default_`, `429`, `rate limit`, `RouterExhausted`, `REJECTED`, `fell back`), `n_calls == 9`, freshness (`user_id`, `created_at` prefix), and reading the text.
- The v2 golden demo-packet determinism check (`python -m evals.dump_golden_packets --check v2`) needs Atlas data, so CI skips it; run it locally at the close of any phase that touches packets.
- **Read raw logs, not summaries.** Every agent run states a red phase; dry-run before any `--apply`; Deepanshu runs all Atlas writes.
- **Never print `.env`;** check by key name only.
- **Always `tsc --noEmit` and `npm run build`.**
- **Briefs:** every task ends DONE, BLOCKED (exact error) or NOT STARTED (turn budget); the review starts early; commits only by Deepanshu, with no AI attribution.

# FillScore: Execution Quality Auditing

![CI](https://github.com/DeepanshuOP/FillScore/actions/workflows/ci.yml/badge.svg)
![Python](https://img.shields.io/badge/Python-3.11+-blue)
![Node.js](https://img.shields.io/badge/Node.js-20+-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

FillScore answers the question retail crypto traders ignore — not whether you were directionally right, but HOW WELL you actually executed. It grades every trade on slippage, fees, timing, and spread cost against real market microstructure, producing an A–F FillScore. It is explicitly NOT a signal or prediction tool.

## The Execution Council

The flagship feature of FillScore is the Execution Council, a multi-agent system that audits historical trades.

```text
       [ Deterministic Trade Packet ]
                    │
   ┌────────────────┼─────────────────┐
   │                │                  │
   ▼                ▼                  ▼
[Liquidity]       [Fee]             [Risk]        [Alpha]
  Scout         Optimizer           Auditor      Architect
   │                │                  │              │
   └────────┬───────┴──────────┬───────┴──────────────┘
            ▼                  ▼
      [Prosecution]        [Defense]
      (Argues bad)        (Argues good)
            │                  │
            └────────┬─────────┘
                     ▼
            [Verification Gate]
          (Counterfactual Checks)
                     │
                     ▼
            [Synthesis Agent]
          (Verdict & Recommendations)
```

**Key Properties:**
- **Compute-then-judge:** LLMs never originate numbers, only reason over deterministic packet data.
- **Adversarial debate:** Prosecution and defense argue over each verdict before synthesis.
- **Verification gate:** Recommendations must pass counterfactual checks before surfacing.
- **Walk-forward eval:** Leakage-free temporal split at 2024-01-15; E1 faithfulness = 1.0 across all runs.
- **Zero cost:** Runs entirely on Groq free tier ($0/run, llama-3.3-70b-versatile).

## FillScore Grading

FillScore assesses execution quality across four deterministic metrics:

| Component | Weight | Description |
| :--- | :--- | :--- |
| **Slippage** | 35% | Implementation shortfall against arrival price |
| **Fees** | 25% | Exchange fees paid vs optimal routing |
| **Timing Quality** | 25% | Micro-reversion and order scheduling |
| **Spread Cost** | 15% | Cost of crossing the bid-ask spread |

**Grade Bands:** A ≥ 90 | B ≥ 75 | C ≥ 60 | D ≥ 40 | F < 40

## Tech Stack

| Layer | Technology | Port |
| :--- | :--- | :--- |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 (Neural Noir design) | 3000 |
| **Backend** | Node.js 20, Express, Mongoose, MongoDB Atlas | 3001 |
| **ML Service** | Python 3.11, FastAPI scaffold, LangGraph, Motor | 8000 |

## Quick Start

**Prerequisites:** Node.js 20+, Python 3.11+, MongoDB Atlas free tier, Groq API key (free).

**Clone and setup:**
```bash
git clone https://github.com/DeepanshuOP/FillScore.git
cd FillScore
```

**Backend:**
```bash
cd backend
cp .env.example .env   # add MONGODB_URI + GROQ_API_KEY
npm install
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**ML service (Agent Council):**
```bash
cd ml-service
pip install -r requirements.txt
python -m agents.council   # runs a council on demo-aggressive
```

**Seed demo data (empty database only):**
```bash
cd backend
npm run seed          # overwrites the six demo accounts; never run it against data you care about
npm run verify-seed   # confirms 6 demo users, all grades locked
```

**Run the checks:** see [CONTRIBUTING.md](CONTRIBUTING.md) for the exact commands. The same ones run in CI.

## Features

- **Exchange connections:** Binance, Bybit and OKX through read-only keys. Each key is checked against the exchange itself and refused if it can trade or withdraw; keys are stored AES-256-GCM encrypted.
- **Real score history:** every audit run appends an immutable snapshot, and the dashboard trend plots only stored results.
- **Multi-exchange venue comparison** with venue alpha (bps) calculation
- **Whale correlation:** real Binance aggTrades via REST, burst-detection algorithm, adverse selection scoring per trade (sample accounts only; connected accounts get an explicit "unavailable")
- **PDF audit report and CSV export** for signed-in users, shareable scorecard (OpenGraph) for the sample accounts
- **Execution Coach mode**, with every figure labelled by the period it covers
- **Trade Journal** (annotate trades with notes via `PATCH /api/audit/trades/:id/note`)
- **Agent Council streaming UI** (SSE, Neural Noir design, cards light up sequentially)
- **Accounts:** email and password with verification, Google and GitHub sign-in, password reset, rotating sessions
- **Tested across all three services** (backend, frontend, ml-service) with CI on every push and pull request

## Research

FillScore is the subject of an ongoing research paper examining verifiable LLM-based execution auditing. Key results from the leakage-free walk-forward evaluation (temporal split 2024-01-15, n=3 consistency runs per profile):

| User Profile | Score (Grade) | E1 Faithfulness | E2 Consistency | E3 Utility (Pass Rate) | % Vacuous | Actionable Recs |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **demo-disciplined** | 95.89 (A) | 1.0 | 100% | 100% | 88.89% | 1/9 |
| **demo-moderate** | 84.81 (B) | 1.0 | 100% | n/a (0 actionable) | 100.00% | 0/9 |
| **demo-aggressive** | 60.67 (C) | 1.0 | 100% | 100% | 22.22% | 7/9 |

*Note: whale-adversity vs slippage showed no statistically significant relationship on this dataset (Mann-Whitney p>0.13 across all symbols); the null result is an honest finding documented in `ml-service/eval/artifacts/whale_slippage_results.md`.*

## Repo Structure

```text
FillScore/
├── backend/                  # Node.js/Express API, database models
├── frontend/                 # Next.js UI, Neural Noir components
└── ml-service/               # Python ML/Eval Service
    ├── agents/               # Council logic, LangGraph, persistence
    ├── eval/                 # Evaluation harness, paper artifacts
    └── whale/                # Whale correlation algorithms, REST connectors
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): how the three services fit together, the API surface, the data model, and what is not built yet
- [SECURITY.md](SECURITY.md): threat model, known limits, and how to report a vulnerability
- [CONTRIBUTING.md](CONTRIBUTING.md): the product rules and how to run the checks
- [docs/PROD_DEPLOY.md](docs/PROD_DEPLOY.md): deploying the backend and ml-service behind Caddy
- [ROADMAP.md](ROADMAP.md): the task register

## License

MIT, see [LICENSE](LICENSE).

## Disclaimer

FillScore audits historical execution quality. It does not provide trading signals, investment advice, or future price predictions. Demo data is synthetic trader populations evaluated against real Binance market microstructure (January 2024).
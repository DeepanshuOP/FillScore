# ADR-0001: Free-tier hosted LLMs (Groq, optionally Gemini), no local models

- **Status:** accepted
- **Date:** 2026-11-07 (documented retrospectively by the 2026-11 audit)
- **Phase:** AC series / 1c–3c

## Context
- The LLM budget is $0 (CLAUDE.md; `.claude/rules/ml-service.md`).
- The Council makes about 9 calls per run (ROADMAP §4.4).
- The deployment hosts are small free or low-cost instances. Render hosts the ml-service (`docs/HANDOFF.md`), and the image was already 841 MB without model weights (ROADMAP R6-B0.2).
- LLMs never originate numbers (ADR-0002), so model quality matters for wording and judgement, not arithmetic.

## Decision
Use hosted free-tier models routed by `ml-service/agents/llm_router.py` from `ml-service/config/llm_routes.yaml`: Groq models, plus Gemini when `GEMINI_API_KEY` is set. Routing includes per-model daily budgets in Mongo `llm_usage`, token-bucket pacing, and fallback on errors. No local model inference.

## Alternatives considered
- **Local models (llama.cpp, Ollama):** need RAM/GPU the hosts do not have, slow CPU inference, larger images.
- **Paid APIs:** violate the $0 budget.

## Consequences
- **Easier:** zero inference cost; small images; model swaps by editing YAML.
- **Harder:** daily token caps (about 8 runs/day historically, ROADMAP §2.2); 429 retries inflate latency (LOG §B); silent degradation risk, so use the `verify-council-run` skill.
- **Revisit** if R6-A3 (distilled small judge) lands, or if the budget changes.

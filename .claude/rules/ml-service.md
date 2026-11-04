---
paths: ["ml-service/**"]
---

# ml-service (FastAPI, port 8000)

Python 3.11 in `ml-service/.venv` (uv). `pytest.ini` already excludes integration tests.

```bash
cd ml-service && GROQ_API_KEY=bogus OPENROUTER_API_KEY=bogus MONGODB_URI=mongodb://127.0.0.1:1/x \
  .venv/bin/pytest -p no:cacheprovider
```

Gotchas:
- Council LLMs: free tiers routed by `ml-service/agents/llm_router.py` from `ml-service/config/llm_routes.yaml`
  (the only place model names live): Groq `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`; Gemini
  when `GEMINI_API_KEY` is set. Synthesis tries gpt-oss-120b first; specialists/debate start on qwen3.8-27b.
  Fallback on errors, per-model daily budgets in Mongo `llm_usage`. Llama models are retired; `GROQ_SPECIALIST_MODEL` /
  `GROQ_SYNTHESIS_MODEL` no longer exist.
- LLM budget is $0. `run_consistency_eval` inter-run sleep stays at 65 s.
- `council_runs.created_at` is an ISO-8601 **string** (query by prefix); `trades.executedAt` is a native datetime.
- After any council run, consistency eval or ablation, use the `verify-council-run` skill before reporting numbers.
- Never run `ml-service/whale/enrich.py` or `regen_fills.py` (see CLAUDE.md).

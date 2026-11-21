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
- Council LLMs: free tiers routed by `ml-service/agents/llm_router.py` from `ml-service/config/llm_routes.yaml`,
  the only place model names, per-role order, budgets and `tpm`/`rpm` pacing limits live. To change a model or its order,
  edit the YAML, not env vars. Gemini models join the candidates when `GEMINI_API_KEY` is set. The router falls back on
  errors, keeps per-model daily budgets in Mongo `llm_usage` and paces each model with a token bucket.
- LLM budget is $0. `run_consistency_eval` inter-run sleep stays at 65 s.
- `council_runs.created_at` is an ISO-8601 **string** (query by prefix); `trades.executedAt` is a native datetime.
- After any council run, consistency eval or ablation, use the `verify-council-run` skill before reporting numbers.
- Never run `ml-service/whale/enrich.py` or `ml-service/whale/regen_fills.py` (see CLAUDE.md).

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
  (the only place model names, order, budgets and `tpm`/`rpm` pacing limits live). Groq `qwen/qwen3.8-27b`,
  `openai/gpt-oss-120b`, `openai/gpt-oss-20b`; Gemini models join the candidate lists when `GEMINI_API_KEY` is set.
  Specialists and synthesis start on qwen3.8-27b; debate starts on gpt-oss-20b so qwen keeps headroom for synthesis. To change a model, edit the YAML, not env vars.
  Fallback on errors, per-model daily budgets in Mongo `llm_usage`, per-model token-bucket pacing. Llama models are retired.
- LLM budget is $0. `run_consistency_eval` inter-run sleep stays at 65 s.
- `council_runs.created_at` is an ISO-8601 **string** (query by prefix); `trades.executedAt` is a native datetime.
- After any council run, consistency eval or ablation, use the `verify-council-run` skill before reporting numbers.
- Never run `ml-service/whale/enrich.py` or `regen_fills.py` (see CLAUDE.md).

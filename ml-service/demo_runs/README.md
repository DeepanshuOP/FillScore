# Demo Council runs

Anonymous visitors to a `demo-*` account never trigger a live Council run (audit F-09). They are
served the newest non-degraded run for that account from `council_runs`, or, if there is none,
the committed fixture `<demo-id>.json` in this folder.

Fixtures are written by `scripts/generate_demo_runs.py` (live LLM calls, needs working Atlas
credentials). Each file holds `{account_id, symbol, generated_at, council_result}`; a degraded
run is never written.

---
paths: ["frontend/**"]
---

# Frontend (Next.js, port 3000)

Node 20 via nvm. Run all three: build and tsc catch bugs the tests cannot.

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
cd frontend && npx vitest run && npx tsc --noEmit --incremental false && npm run lint && npm run build
```

Gotchas:
- Copy is past-tense findings, never advice or prediction ("could save", "route flow to" are wrong).
- Every number shown comes from deterministic code; never render an LLM-emitted number.
- Demo accounts (`demo-*`) are read-only; show `dataSource` provenance as stored.
